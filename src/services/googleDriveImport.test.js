import test from "node:test";
import assert from "node:assert/strict";
import { downloadDrivePdf } from "./googleDriveImport.js";

const pdf = new Uint8Array([...
  new TextEncoder().encode("%PDF-1.7\n"),
  ...new TextEncoder().encode("test"),
]);

test("downloads and validates a Google Drive PDF", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Blob([pdf], { type: "application/pdf" }), {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });

  try {
    const file = await downloadDrivePdf(
      { id: "drive-id", name: "lecture", mimeType: "application/pdf" },
      "token",
    );
    assert.equal(file.name, "lecture.pdf");
    assert.equal(file.type, "application/pdf");
    assert.equal(file.size, pdf.byteLength);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a Drive response that is not a PDF", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not a pdf", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });

  try {
    await assert.rejects(
      () => downloadDrivePdf(
        { id: "drive-id", name: "lecture", mimeType: "application/pdf" },
        "token",
      ),
      /not returned as a PDF/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
