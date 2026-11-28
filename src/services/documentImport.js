import {
  findDuplicateResources,
  hashPdfContent,
  saveResources,
  validatePdfFile,
} from "./resourceLibrary";

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException("The operation was cancelled.", "AbortError");
}

async function mapBounded(items, worker, concurrency, signal) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      throwIfAborted(signal);
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function importPdfDocuments({
  accountId,
  items,
  buildResource,
  understand,
  onDuplicate,
  onProgress,
  onCheckpoint,
  validateEntry,
  signal,
  concurrency = 3,
  loadItem = async (item) => item,
}) {
  const prepared = await mapBounded(items, async (item, index) => {
    try {
      onProgress?.({ stage: "processing", completed: index, total: items.length, name: item.name });
      const loaded = await loadItem(item, signal);
      const bytes = await validatePdfFile(loaded.file);
      const contentHash = await hashPdfContent(loaded.file, bytes);
      await validateEntry?.({ item: loaded, bytes, contentHash });
      return { item: loaded, bytes, contentHash };
    } catch (error) {
      return { item, error };
    }
  }, concurrency, signal);

  const valid = prepared.filter((entry) => !entry.error);
  const duplicateByHash = await findDuplicateResources(
    accountId,
    valid.map((entry) => entry.contentHash),
  );
  const unique = [];
  const duplicates = [];
  const seenHashes = new Set();
  const failures = prepared.filter((entry) => entry.error).map((entry) => ({ item: entry.item, error: entry.error }));
  for (const entry of valid) {
    const duplicate = duplicateByHash.get(entry.contentHash);
    if (duplicate || seenHashes.has(entry.contentHash)) {
      try {
        if (duplicate) await onDuplicate?.(entry, duplicate);
        duplicates.push({ entry, duplicate });
      } catch (error) {
        failures.push({ item: entry.item, error });
      }
    } else {
      seenHashes.add(entry.contentHash);
      unique.push(entry);
    }
  }

  const staged = unique.map(({ item, contentHash }) => buildResource(item, contentHash, "processing"));
  if (staged.length) await saveResources(staged);
  await onCheckpoint?.({ stage: "persisted", resourceIds: staged.map((resource) => resource.id) });

  const published = [];
  const processed = await mapBounded(unique, async (entry) => {
    const stagedResource = staged.find((resource) => resource.contentHash === entry.contentHash);
    try {
      const resource = await understand(stagedResource, entry.bytes, entry.item);
      published.push(resource);
      onProgress?.({ stage: "saving", completed: published.length, total: unique.length, name: entry.item.name });
      await onCheckpoint?.({ stage: "published", resourceIds: [resource.id], processed: published.length });
      return resource;
    } catch (error) {
      const failedResource = {
        ...stagedResource,
        assignmentStatus: "unassigned",
        recognitionStatus: "recognition-failed",
        processingError: error.message || "Document processing failed.",
        updatedAt: new Date().toISOString(),
      };
      published.push(failedResource);
      failures.push({ item: entry.item, error });
      await onCheckpoint?.({ stage: "failed", resourceIds: [failedResource.id], processed: published.length });
      return failedResource;
    }
  }, concurrency, signal).catch(async (error) => {
    if (error.name !== "AbortError") throw error;
    const completedHashes = new Set(published.map((resource) => resource.contentHash));
    for (const resource of staged.filter((candidate) => !completedHashes.has(candidate.contentHash))) {
      published.push({
        ...resource,
        assignmentStatus: "unassigned",
        recognitionStatus: "recognition-failed",
        processingError: "Import cancelled before document understanding completed.",
        updatedAt: new Date().toISOString(),
      });
    }
    return published;
  });

  if (processed.length) await saveResources(processed);
  return {
    imported: unique.length,
    duplicates: duplicates.length,
    failed: failures.length,
    failures,
    resources: processed,
  };
}
