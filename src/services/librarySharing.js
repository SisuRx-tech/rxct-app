import { supabase } from "./supabase";

const BUCKET = "rxct-library-shares";
const DAY = 24 * 60 * 60 * 1000;
const MAX_SHARE_BYTES = 50 * 1024 * 1024;

const asDataUrl = (blob) => new Promise((resolve, reject) => {
  if (!blob) return resolve(null);
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("Could not prepare a document for export."));
  reader.readAsDataURL(blob);
});

export async function createLibraryShare(resources, accountId) {
  if (!accountId) throw new Error("Sign in before exporting a library.");
  const items = await Promise.all(resources.map(async (resource) => ({
    id: resource.id,
    name: resource.name,
    mimeType: resource.mimeType || "application/pdf",
    size: resource.size || 0,
    pageCount: resource.pageCount || null,
    text: resource.text || "",
    courseId: resource.courseId || null,
    course: resource.course || null,
    assignmentStatus: resource.assignmentStatus || "unassigned",
    fileData: await asDataUrl(resource.blob),
  })));
  const sourceBytes = items.reduce((total, item) => total + (item.size || 0), 0);
  if (sourceBytes > MAX_SHARE_BYTES) {
    throw new Error("This export is larger than 50 MB. Select fewer documents to keep the share fast and bandwidth-friendly.");
  }
  const token = crypto.randomUUID();
  const path = `${accountId}/${token}.json`;
  const payload = new Blob([JSON.stringify({ version: 1, createdAt: new Date().toISOString(), items })], { type: "application/json" });
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, payload, { contentType: "application/json", upsert: false });
  if (uploadError) throw uploadError;
  const { error: shareError } = await supabase.from("library_shares").insert({ token, owner_id: accountId, storage_path: path, expires_at: new Date(Date.now() + 7 * DAY).toISOString() });
  if (shareError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw shareError;
  }
  return `${window.location.origin}/resources?import=${token}`;
}

export async function resolveLibraryShare(token) {
  const { data, error } = await supabase.rpc("resolve_library_share", { share_token: token });
  if (error) throw error;
  const path = data?.storage_path || data?.[0]?.storage_path;
  if (!path) throw new Error("That library link has expired or is no longer available.");
  const { data: file, error: downloadError } = await supabase.storage.from(BUCKET).download(path);
  if (downloadError) throw downloadError;
  return file.json();
}

export async function importLibraryItems(items, selectedIds, accountId, saveResource) {
  const selected = items.filter((item) => selectedIds.includes(item.id));
  await Promise.all(selected.map(async (item) => {
    let blob = null;
    if (item.fileData) {
      const response = await fetch(item.fileData);
      blob = await response.blob();
    }
    await saveResource({ ...item, id: `${accountId}-${item.id}`, accountId, blob, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }));
  return selected.length;
}

export function getShareToken() {
  return new URLSearchParams(window.location.search).get("import");
}
