import assert from "node:assert/strict";
import test from "node:test";
import {
  canComplete,
  isOwnedBy,
  shouldRemoveObjectMetadata,
  storageRoute,
  validatePortableExportInput,
  verifyS3Head,
} from "./portableValidation.js";

const hash = "a".repeat(64);
const validBody = {
  manifest: {
    schemaVersion: 1,
    documents: [{ contentHash: hash, size: 4, mimeType: "application/pdf" }],
  },
  items: [{ content_hash: hash, file_size: 4, mime_type: "application/pdf", display_name: "notes.pdf" }],
};

test("validates manifest consistency and normalizes object metadata", () => {
  const result = validatePortableExportInput(validBody);
  assert.equal(result.totalBytes, 4);
  assert.equal(result.items[0].objectKey, `documents/aa/${hash}.pdf`);
});

test("accepts the versioned intelligence manifest format", () => {
  const result = validatePortableExportInput({
    ...validBody,
    manifest: {
      ...validBody.manifest,
      schemaVersion: 2,
      documents: [{
        ...validBody.manifest.documents[0],
        text: "Existing extracted text",
        headings: ["Introduction"],
        topics: ["pharmacology"],
      }],
    },
  });
  assert.equal(result.manifest.schemaVersion, 2);
});

test("rejects duplicate hashes and manifest mismatches", () => {
  assert.throws(() => validatePortableExportInput({
    ...validBody,
    items: [validBody.items[0], validBody.items[0]],
    manifest: { ...validBody.manifest, documents: [validBody.manifest.documents[0], validBody.manifest.documents[0]] },
  }), /Duplicate/);
  assert.throws(() => validatePortableExportInput({
    ...validBody,
    manifest: { ...validBody.manifest, documents: [{ ...validBody.manifest.documents[0], size: 5 }] },
  }), /does not match/);
});

test("requires size, MIME type, and SHA-256 metadata verification", () => {
  const item = { contentHash: hash, fileSize: 4, mimeType: "application/pdf" };
  assert.equal(verifyS3Head(item, { ContentLength: 4, ContentType: "application/pdf", Metadata: { "content-sha256": hash } }), true);
  assert.throws(() => verifyS3Head(item, { ContentLength: 3, ContentType: "application/pdf", Metadata: { "content-sha256": hash } }), /size/);
  assert.throws(() => verifyS3Head(item, { ContentLength: 4, ContentType: "application/pdf", Metadata: {} }), /hash/);
});

test("routes old objects to legacy storage and new objects only to the new bucket", () => {
  assert.deepEqual(storageRoute({ storage_provider: "b2-native", storage_bucket: "legacy" }, "rxct-shared-docs"), { provider: "b2-native", bucket: "legacy" });
  assert.deepEqual(storageRoute({ storage_provider: "b2-s3", storage_bucket: "rxct-shared-docs" }, "rxct-shared-docs"), { provider: "b2-s3", bucket: "rxct-shared-docs" });
  assert.deepEqual(storageRoute({ storage_provider: "b2-s3", storage_bucket: "other" }, "rxct-shared-docs"), { provider: "b2-native", bucket: "other" });
});

test("completion is retryable and failed deletes retain metadata", () => {
  assert.equal(canComplete("preparing"), true);
  assert.equal(canComplete("ready"), true);
  assert.equal(canComplete("failed"), false);
  assert.equal(shouldRemoveObjectMetadata(false), false);
  assert.equal(shouldRemoveObjectMetadata(true), true);
});

test("ownership checks require an exact authenticated user id", () => {
  assert.equal(isOwnedBy({ owner_id: "user-1" }, "user-1"), true);
  assert.equal(isOwnedBy({ owner_id: "user-1" }, "user-2"), false);
  assert.equal(isOwnedBy({ owner_id: "user-1" }, ""), false);
});
