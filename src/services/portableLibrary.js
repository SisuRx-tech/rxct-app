import { supabase } from "./supabase";

const FUNCTION_NAME = "rxct-portable-export";
const SCHEMA_VERSION = 2;

async function call(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || "Portable library request failed.");
  if (data?.error) throw new Error(data.error);
  return data;
}

function manifestFor(resources) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    documents: resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      mimeType: resource.mimeType || "application/pdf",
      size: Number(resource.blob?.size || resource.size || 0),
      contentHash: resource.contentHash,
      fingerprint: resource.fingerprint || null,
      courseId: resource.courseId || null,
      course: resource.course || null,
      curriculumStatus: resource.curriculumStatus || null,
      assignmentStatus: resource.assignmentStatus || null,
      recognitionStatus: resource.recognitionStatus || null,
      confidence: resource.confidence || 0,
      suggestions: resource.suggestions || [],
      text: resource.text || "",
      pageCount: resource.pageCount || 0,
      folderPath: resource.folderPath || "",
      source: resource.source || "local",
      semester: resource.semester || resource.course?.semester || null,
      documentType: resource.documentType || null,
      headings: resource.headings || [],
      topics: resource.topics || [],
      keywords: resource.keywords || [],
      processingMetadata: resource.processingMetadata || null,
      intelligence: resource.intelligence || null,
      progress: resource.progress || {},
      lastOpenedAt: resource.lastOpenedAt || null,
      lastOpenedSection: resource.lastOpenedSection || "Document",
      createdAt: resource.createdAt || null,
      updatedAt: resource.updatedAt || null,
    })),
  };
}

export async function createPortableExport(resources, onProgress, signal) {
  const selected = resources.filter((resource) => resource.blob && resource.contentHash);
  if (!selected.length) throw new Error("Select documents with locally available PDFs.");

  const manifest = manifestFor(selected);
  const totalBytes = selected.reduce((sum, resource) => sum + resource.blob.size, 0);
  const prepared = await call("prepare", {
    request_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    manifest,
    items: selected.map((resource) => ({
      content_hash: resource.contentHash,
      display_name: resource.name,
      file_size: resource.blob.size,
      mime_type: resource.mimeType || "application/pdf",
    })),
  });

  let uploadedBytes = 0;
  const startedAt = Date.now();
  for (const item of prepared.items || []) {
    if (signal?.aborted) throw new DOMException("The export was cancelled.", "AbortError");
    const resource = selected.find((candidate) => candidate.contentHash === item.content_hash);
    if (!resource || item.already_exists) {
      uploadedBytes += resource?.blob.size || 0;
      const elapsed = Math.max(1, Date.now() - startedAt) / 1000;
      onProgress?.({ stage: "already-exists", completed: uploadedBytes, total: totalBytes, uploadedBytes, totalBytes, remainingBytes: Math.max(0, totalBytes - uploadedBytes), alreadyExisting: true, speedBytesPerSecond: uploadedBytes / elapsed, etaSeconds: uploadedBytes ? Math.max(0, (totalBytes - uploadedBytes) / (uploadedBytes / elapsed)) : null, name: resource?.name });
      continue;
    }
    const response = await fetch(item.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": resource.mimeType || "application/pdf",
        "x-amz-meta-content-sha256": item.content_hash,
      },
      body: resource.blob,
      signal,
    });
    if (!response.ok) throw new Error(`Could not upload ${resource.name}.`);
    uploadedBytes += resource.blob.size;
    const elapsed = Math.max(1, Date.now() - startedAt) / 1000;
    const speedBytesPerSecond = uploadedBytes / elapsed;
    onProgress?.({ stage: "uploading", completed: uploadedBytes, total: totalBytes, uploadedBytes, totalBytes, remainingBytes: Math.max(0, totalBytes - uploadedBytes), alreadyExisting: false, speedBytesPerSecond, etaSeconds: speedBytesPerSecond ? Math.max(0, (totalBytes - uploadedBytes) / speedBytesPerSecond) : null, name: resource.name });
  }

  const completed = await call("complete", { export_id: prepared.export_id });
  onProgress?.({ stage: "complete", uploadedBytes: totalBytes, totalBytes });
  return completed;
}

export function resolvePortableExport(token) {
  return call("resolve", { token });
}

export async function downloadPortableDocument(token, item, signal) {
  if (item.download_url) {
    const response = await fetch(item.download_url, { signal });
    if (!response.ok) throw new Error(`Could not restore ${item.display_name}.`);
    const data = await response.blob();
    if (!data.size) throw new Error(`Could not restore ${item.display_name}.`);
    if (Number(item.file_size) !== data.size) throw new Error(`${item.display_name} has an unexpected file size.`);
    return new File([data], item.display_name, { type: item.mime_type || "application/pdf", lastModified: Date.now() });
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action: "download", token, content_hash: item.content_hash },
  });
  if (error) throw new Error(error.message || `Could not restore ${item.display_name}.`);
  if (!(data instanceof Blob) || !data.size) throw new Error(`Could not restore ${item.display_name}.`);
  if (Number(item.file_size) !== data.size) throw new Error(`${item.display_name} has an unexpected file size.`);
  if (signal?.aborted) throw new DOMException("The restore was cancelled.", "AbortError");
  return new File([data], item.display_name, { type: item.mime_type || "application/pdf", lastModified: Date.now() });
}
