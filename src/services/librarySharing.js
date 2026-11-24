import {
  createCloudShare,
  importCloudShare,
  resolveCloudShare,
} from "./cloudResources";

const SHARE_ORIGIN = "https://rxct.vercel.app";

function shareUrl(token) {
  const origin = typeof window !== "undefined" && window.location.origin !== "null"
    ? window.location.origin
    : SHARE_ORIGIN;
  return `${origin}/resources?import=${encodeURIComponent(token)}`;
}

function getToken(value) {
  const input = String(value || "").trim();
  try {
    const url = new URL(input);
    return url.searchParams.get("import") || input;
  } catch {
    return input;
  }
}

export async function createLibraryShare(resources) {
  const itemIds = resources.map((resource) => resource.cloudItemId).filter(Boolean);
  if (itemIds.length !== resources.length) {
    throw new Error("This document is still local-only. Upload it to RxCT before sharing.");
  }

  const result = await createCloudShare(itemIds);
  return shareUrl(result.token);
}

export function getShareToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("import") || "";
}

export async function resolveLibraryShare(value, onProgress) {
  onProgress?.({ stage: "resolving", completed: 0, total: 0 });
  const result = await resolveCloudShare(getToken(value));
  const items = (result.items || []).map((item) => ({
    id: item.document_id,
    cloudDocumentId: item.document_id,
    name: item.display_name,
    courseId: item.course_id || null,
    course: null,
    size: item.document?.file_size || 0,
    mimeType: item.document?.mime_type || "application/pdf",
    contentHash: item.document?.content_hash || "",
  }));
  onProgress?.({ stage: "complete", completed: items.length, total: items.length });
  items.shareToken = result.token || getToken(value);
  return { ...result, token: items.shareToken, items };
}

export async function importLibraryItems(
  items,
  selectedIds,
  accountId,
  saveResource,
  onProgress,
  signal,
) {
  if (!accountId) throw new Error("Sign in before importing a library.");
  if (signal?.aborted) throw new DOMException("The operation was cancelled.", "AbortError");

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const shareToken = items.shareToken || null;
  if (!shareToken) throw new Error("That import link is missing its share token.");

  onProgress?.({ stage: "saving", completed: 0, total: selected.length });
  const result = await importCloudShare(shareToken, selected.map((item) => item.cloudDocumentId || item.id));
  for (const [index, item] of (result.items || []).entries()) {
    const source = selected[index] || selected.find((candidate) => candidate.cloudDocumentId === item.document_id);
    await saveResource({
      id: `${accountId}-cloud-${item.id}`,
      accountId,
      cloudItemId: item.id,
      contentHash: item.document?.content_hash || source?.contentHash || "",
      name: item.display_name,
      mimeType: item.document?.mime_type || "application/pdf",
      size: item.document?.file_size || source?.size || 0,
      courseId: item.course_id || null,
      assignmentStatus: item.assignment_status || (item.course_id ? "assigned" : "unassigned"),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    });
    onProgress?.({ stage: "saving", completed: index + 1, total: selected.length });
  }
  return result.items?.length || 0;
}
