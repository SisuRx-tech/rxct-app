import test from "node:test";
import assert from "node:assert/strict";
import { validatePdfBytes, readAndValidatePdf } from "./resourceValidation.js";

test("accepts a PDF signature", () => {
  assert.equal(validatePdfBytes(new TextEncoder().encode("%PDF-1.7\n")), true);
});

test("rejects an empty or non-PDF response", () => {
  assert.equal(validatePdfBytes(new TextEncoder().encode("not a pdf")), false);
});

test("validates a file-like PDF once and returns its bytes", async () => {
  const file = {
    name: "lecture.pdf",
    arrayBuffer: async () => new TextEncoder().encode("%PDF-1.4 body").buffer,
  };
  const bytes = await readAndValidatePdf(file);
  assert.equal(bytes[0], 0x25);
});

test("rejects a corrupt file-like PDF", async () => {
  await assert.rejects(
    () => readAndValidatePdf({ name: "broken.pdf", arrayBuffer: async () => new ArrayBuffer(0) }),
    /not a valid PDF/,
  );
});
