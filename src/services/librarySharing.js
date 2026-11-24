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
  const cloudResources = resources.filter((resource) => resource.cloudItemId);
  const driveResources = resources.filter(
    (resource) => resource.driveFileId && resource.driveUrl
  );

  const unsupported = resources.filter(
    (resource) =>
      !resource.cloudItemId &&
      !(resource.driveFileId && resource.driveUrl) &&
      !resource.blob
  );

  if (unsupported.length) {
    throw new Error(
      `${unsupported[0].name || "A document"} is local-only and its PDF is unavailable for automatic upload.`
    );
  }

  if (!resources.length) {
    throw new Error("Select at least one document to share.");
  }

  const result = await createCloudShare(
    cloudResources.map((resource) => resource.cloudItemId),
    driveResources.map((resource) => ({
      drive_file_id: resource.driveFileId,
      display_name: resource.name,
      course_id: resource.courseId || null,
    }))
  );

  return shareUrl(result.token);
}

export function getShareToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("import") || "";
}

export async function resolveLibraryShare(value, onProgress) {
  onProgress?.({ stage: "resolving", completed: 0, total: 0 });

  const result = await resolveCloudShare(getToken(value));

  const cloudItems = (result.items || []).map((item) => ({
    id: item.document_id,
    type: "rxct",
    cloudDocumentId: item.document_id,
    name: item.display_name,
    courseId: item.course_id || null,
    course: null,
    size: item.document?.file_size || 0,
    mimeType: item.document?.mime_type || "application/pdf",
    contentHash: item.document?.content_hash || "",
  }));

  const driveItems = (result.drive_items || []).map((item) => ({
    id: `drive:${item.drive_file_id}`,
    type: "google-drive",
    driveFileId: item.drive_file_id,
    driveUrl: `https://drive.google.com/open?id=${encodeURIComponent(item.drive_file_id)}`,
    name: item.display_name,
    courseId: item.course_id || null,
    course: null,
    size: 0,
    mimeType: "application/pdf",
  }));

  const items = [...cloudItems, ...driveItems];

  onProgress?.({
    stage: "complete",
    completed: items.length,
    total: items.length,
  });

  items.shareToken = result.token || getToken(value);

  return {
    ...result,
    token: items.shareToken,
    items,
  };
}

export async function importLibraryItems(
  items,
  selectedIds,
  accountId,
  saveResource,
  onProgress,
  signal,
) {
  if (!accountId) {
    throw new Error("Sign in before importing a library.");
  }

  if (signal?.aborted) {
    throw new DOMException("The operation was cancelled.", "AbortError");
  }

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const shareToken = items.shareToken || null;

  if (!shareToken) {
    throw new Error("That import link is missing its share token.");
  }

  onProgress?.({
    stage: "saving",
    completed: 0,
    total: selected.length,
  });

  const cloudSelected = selected.filter(
    (item) => item.type !== "google-drive"
  );
  const driveSelected = selected.filter(
    (item) => item.type === "google-drive"
  );

  const result = await importCloudShare(
    shareToken,
    cloudSelected.map((item) => item.cloudDocumentId || item.id),
    driveSelected.map((item) => item.driveFileId),
  );

  let completed = 0;

  for (const item of result.items || []) {
    const source = cloudSelected.find(
      (candidate) => candidate.cloudDocumentId === item.document_id
    );

    await saveResource({
      id: `${accountId}-cloud-${item.id}`,
      accountId,
      cloudItemId: item.id,
      contentHash: item.document?.content_hash || source?.contentHash || "",
      name: item.display_name,
      mimeType: item.document?.mime_type || "application/pdf",
      size: item.document?.file_size || source?.size || 0,
      courseId: item.course_id || null,
      assignmentStatus:
        item.assignment_status || (item.course_id ? "assigned" : "unassigned"),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    });

    completed += 1;
    onProgress?.({
      stage: "saving",
      completed,
      total: selected.length,
    });
  }

  for (const item of driveSelected) {
    const now = new Date().toISOString();

    await saveResource({
      id: `${accountId}-drive-${item.driveFileId}`,
      accountId,
      fingerprint: `drive:${item.driveFileId}`,
      text: item.name,
      source: "google-drive",
      driveFileId: item.driveFileId,
      driveUrl: item.driveUrl,
      name: item.name,
      mimeType: "application/pdf",
      size: 0,
      courseId: item.courseId || null,
      assignmentStatus: item.courseId ? "assigned" : "unassigned",
      lastOpenedAt: null,
      lastOpenedSection: "Document",
      progress: {},
      createdAt: now,
      updatedAt: now,
    });

    completed += 1;
    onProgress?.({
      stage: "saving",
      completed,
      total: selected.length,
    });
  }

  return completed;
}
