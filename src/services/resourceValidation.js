export function validatePdfBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  return view.length >= 5 && String.fromCharCode(...view.slice(0, 5)) === "%PDF-";
}

export async function readAndValidatePdf(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("A valid PDF file is required.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validatePdfBytes(bytes)) {
    throw new Error(`${file.name || "The file"} is not a valid PDF.`);
  }
  return bytes;
}
