
import { supabase } from "./supabase";

const BUCKET = "rxct-documents";

async function call(body) {
  const { data, error } = await supabase.functions.invoke(
    "rxct-document-upload",
    { body },
  );

  if (error) {
    let detail = error.message || "The cloud request failed.";
    const response = error.context;
    const cause = error.cause?.message;

    console.error("RxCT cloud document request failed.", {
      action: body.action,
      name: error.name,
      message: error.message,
      cause,
      status: response?.status,
    });

    if (response && typeof response.json === "function") {
      try {
        const payload = await response.clone().json();
        if (payload?.error) detail = payload.error;
      } catch {
        // Preserve the SDK error when the function did not return JSON.
      }
    }

    if (/failed to send a request/i.test(detail)) {
      const suffix = [
        error.name && "type: " + error.name,
        response?.status && "status: " + response.status,
        cause && "cause: " + cause,
      ]
        .filter(Boolean)
        .join(" · ");

      detail =
        "RxCT could not reach rxct-document-upload" +
        (suffix ? " (" + suffix + ")" : "") +
        ". Check the browser network connection and the function logs.";
    }

    throw new Error(detail);
  }

  if (data?.error) throw new Error(data.error);

  return data;
}

async function sha256(file) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function uploadCloudPdf(
  file,
  courseId = null,
  metadata = {},
) {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("Only PDF files are supported.");
  }

  const contentHash = await sha256(file);

  const upload = await call({
    action: "start",
    file_size: file.size,
    mime_type: "application/pdf",
    content_hash: contentHash,
  });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file);

  if (uploadError) throw uploadError;

  return call({
    action: "finish",
    path: upload.path,
    content_hash: contentHash,
    display_name: file.name,
    course_id: courseId,
    ...metadata,
  });
}

export function listCloudResources() {
  return call({ action: "list" });
}

export function updateCloudResource(itemId, changes) {
  return call({ action: "update", item_id: itemId, ...changes });
}

export function deleteCloudResource(itemId) {
  return call({ action: "delete", item_id: itemId });
}

export function createCloudShare(itemIds, driveItems = []) {
  return call({
    action: "share",
    item_ids: itemIds,
    drive_items: driveItems,
  });
}

export function resolveCloudShare(token) {
  return call({ action: "resolve-share", token });
}

export function importCloudShare(token, itemIds, driveItemIds = []) {
  return call({
    action: "import-share",
    token,
    item_ids: itemIds,
    drive_item_ids: driveItemIds,
  });
}
export function openCloudResource(itemId) {
  return call({
    action: "read",
    item_id: itemId,
  });
}

export { sha256 as hashCloudPdf };
