export const MAX_DOCUMENT_BYTES = 80 * 1024 * 1024;
export const MAX_DOCUMENT_COUNT = 100;
export const NEW_STORAGE_PROVIDER = "b2-s3";
export const LEGACY_STORAGE_PROVIDER = "b2-native";

const SHA256 = /^[a-f0-9]{64}$/;

export function objectKey(contentHash) {
  const hash = String(contentHash || "").toLowerCase();
  if (!SHA256.test(hash)) throw new Error("Invalid document content hash.");
  return `documents/${hash.slice(0, 2)}/${hash}.pdf`;
}

function normalizedSize(value) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_DOCUMENT_BYTES) {
    throw new Error("A portable PDF has an invalid size.");
  }
  return size;
}

function cleanDisplayName(value) {
  const name = String(value || "document.pdf")
    .replace(/[\\/:*?"<>|\r\n]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
  if (!name) throw new Error("A portable PDF needs a display name.");
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

export function validatePortableExportInput(body) {
  const manifest = body?.manifest;
  const items = Array.isArray(body?.items) ? body.items : [];
  const documents = Array.isArray(manifest?.documents) ? manifest.documents : [];

  if (![1, 2].includes(Number(manifest?.schemaVersion)) || !items.length) {
    throw new Error("Invalid portable export manifest.");
  }
  if (items.length > MAX_DOCUMENT_COUNT || documents.length !== items.length) {
    throw new Error("Portable manifest and item counts do not match.");
  }

  const hashes = new Set();
  let totalBytes = 0;
  const normalizedItems = items.map((raw, index) => {
    const contentHash = String(raw?.content_hash || "").toLowerCase();
    if (!SHA256.test(contentHash)) throw new Error("Invalid document content hash.");
    if (hashes.has(contentHash)) throw new Error("Duplicate portable document hash.");
    hashes.add(contentHash);

    const fileSize = normalizedSize(raw?.file_size);
    const mimeType = String(raw?.mime_type || "");
    if (mimeType !== "application/pdf") throw new Error("Only PDF files are supported.");

    const document = documents[index];
    if (
      document?.contentHash !== contentHash ||
      Number(document?.size) !== fileSize ||
      (document?.mimeType || "application/pdf") !== mimeType
    ) {
      throw new Error("Portable manifest does not match its document items.");
    }

    totalBytes += fileSize;
    return {
      contentHash,
      fileSize,
      mimeType,
      displayName: cleanDisplayName(raw?.display_name),
      objectKey: objectKey(contentHash),
    };
  });

  if (Number(manifest.documents.length) !== normalizedItems.length) {
    throw new Error("Portable manifest is incomplete.");
  }

  return { manifest, items: normalizedItems, totalBytes };
}

export function verifyS3Head(item, head) {
  const size = Number(head?.ContentLength);
  if (size !== item.fileSize) throw new Error(`Portable object size verification failed for ${item.contentHash}.`);

  const metadata = head?.Metadata || {};
  const hashEntry = Object.entries(metadata).find(([key]) => key.toLowerCase() === "content-sha256" || key.toLowerCase() === "x-amz-meta-content-sha256");
  const hash = String(hashEntry?.[1] || "").toLowerCase();
  if (hash !== item.contentHash) throw new Error(`Portable object hash verification failed for ${item.contentHash}.`);

  const contentType = String(head?.ContentType || "application/pdf").split(";", 1)[0].trim();
  if (contentType !== item.mimeType) throw new Error(`Portable object MIME verification failed for ${item.contentHash}.`);
  return true;
}

export function isOwnedBy(row, userId) {
  return Boolean(row?.owner_id && userId && row.owner_id === userId);
}

export function storageRoute(row, newBucket) {
  if (row?.storage_provider === NEW_STORAGE_PROVIDER && row.storage_bucket === newBucket) {
    return { provider: NEW_STORAGE_PROVIDER, bucket: newBucket };
  }
  return { provider: LEGACY_STORAGE_PROVIDER, bucket: row?.storage_bucket || "legacy" };
}

export function canComplete(status) {
  return status === "preparing" || status === "ready";
}

export function shouldRemoveObjectMetadata(deleteSucceeded) {
  return deleteSucceeded === true;
}
