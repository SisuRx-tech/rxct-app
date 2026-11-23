import { supabase } from "./supabase";

const BUCKET = "rxct-library-shares";
const DAY = 24 * 60 * 60 * 1000;
const MAX_SHARE_BYTES = 50 * 1024 * 1024;
const TRANSFER_CONCURRENCY = 3;
const SHARE_ORIGIN = "https://rxct.vercel.app";

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }
  );

  await Promise.all(runners);
  return results;
}

async function removeUploadedFiles(paths) {
  if (!paths.length) return;

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove(paths);

  if (error) {
    console.error("Could not clean up an incomplete library export:", error);
  }
}

export async function createLibraryShare(resources, accountId, onProgress) {
  if (!accountId) {
    throw new Error("Sign in before exporting a library.");
  }

  if (!resources?.length) {
    throw new Error("Select at least one document to export.");
  }

  const token = crypto.randomUUID();
  const folder = `${accountId}/${token}`;
  const manifestPath = `${folder}/manifest.json`;
  const uploadedPaths = [];

  const sourceBytes = resources.reduce(
    (total, resource) =>
      total + (resource.blob?.size || resource.size || 0),
    0
  );

  if (sourceBytes > MAX_SHARE_BYTES) {
    throw new Error(
      "This export is larger than 50 MB. Select fewer documents to keep the share fast and bandwidth-friendly."
    );
  }

  const items = resources.map((resource, index) => ({
    id: resource.id,
    name: resource.name,
    mimeType: resource.mimeType || resource.blob?.type || "application/pdf",
    size: resource.blob?.size || resource.size || 0,
    pageCount: resource.pageCount || null,
    text: resource.text || "",
    courseId: resource.courseId || null,
    course: resource.course || null,
    assignmentStatus: resource.assignmentStatus || "unassigned",
    filePath: resource.blob
      ? `${folder}/files/${index}.pdf`
      : null,
  }));

  try {
    const files = resources
      .map((resource, index) => ({
        resource,
        item: items[index],
      }))
      .filter(({ resource }) => resource.blob);

    onProgress?.({
      stage: "uploading",
      completed: 0,
      total: files.length,
    });

    let completed = 0;

    await mapWithConcurrency(
      files,
      TRANSFER_CONCURRENCY,
      async ({ resource, item }) => {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(item.filePath, resource.blob, {
            contentType: item.mimeType,
            upsert: false,
          });

        if (error) throw error;

        uploadedPaths.push(item.filePath);
        completed += 1;

        onProgress?.({
          stage: "uploading",
          completed,
          total: files.length,
        });
      }
    );

    onProgress?.({
      stage: "saving",
      completed: files.length,
      total: files.length,
    });

    const payload = new Blob(
      [
        JSON.stringify({
          version: 2,
          createdAt: new Date().toISOString(),
          items,
        }),
      ],
      { type: "application/json" }
    );

    const { error: manifestError } = await supabase.storage
      .from(BUCKET)
      .upload(manifestPath, payload, {
        contentType: "application/json",
        upsert: false,
      });

    if (manifestError) throw manifestError;

    uploadedPaths.push(manifestPath);

    const { error: shareError } = await supabase
      .from("library_shares")
      .insert({
        token,
        owner_id: accountId,
        storage_path: manifestPath,
        expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
      });

    if (shareError) throw shareError;

    onProgress?.({
      stage: "complete",
      completed: files.length,
      total: files.length,
    });

    return `${SHARE_ORIGIN}/library/import/${token}`;
  } catch (error) {
    await removeUploadedFiles(uploadedPaths);
    throw error;
  }
}

export async function resolveLibraryShare(token) {
  if (!token) {
    throw new Error("No library share token was provided.");
  }

  const { data, error } = await supabase.rpc(
    "resolve_library_share",
    { share_token: token }
  );

  if (error) throw error;

  const path = data?.storage_path || data?.[0]?.storage_path;

  if (!path) {
    throw new Error(
      "That library link has expired or is no longer available. Request a fresh link from its owner."
    );
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (downloadError) throw downloadError;

  if (!(file instanceof Blob)) {
    throw new Error("The shared library file could not be read.");
  }

  try {
    const payload = JSON.parse(await file.text());

    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("Invalid library data.");
    }

    if (payload.version === 2) {
      const filesPrefix = `${path.slice(0, -"manifest.json".length)}files/`;

      for (const item of payload.items) {
        if (
          item.filePath &&
          (
            !item.filePath.startsWith(filesPrefix) ||
            item.filePath.includes("..")
          )
        ) {
          throw new Error(
            "Invalid document path in shared library."
          );
        }
      }
    } else if (payload.version !== 1) {
      throw new Error("Unsupported library export version.");
    }

    return payload;
  } catch (parseError) {
    const knownErrors = [
      "Invalid library data.",
      "Unsupported library export version.",
      "Invalid document path in shared library.",
    ];

    throw new Error(
      knownErrors.includes(parseError.message)
        ? parseError.message
        : "The shared library data is damaged or invalid.",
      { cause: parseError }
    );
  }
}

export async function importLibraryItems(
  items,
  selectedIds,
  accountId,
  saveResource
) {
  if (!accountId) {
    throw new Error("Sign in before importing a library.");
  }

  const selected = items.filter(
    (item) => selectedIds.includes(item.id)
  );

  await mapWithConcurrency(
    selected,
    TRANSFER_CONCURRENCY,
    async (item) => {
      let blob = null;

      if (item.filePath) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .download(item.filePath);

        if (error) {
          throw new Error(
            `Could not restore ${item.name}: ${error.message}`
          );
        }

        blob = data;
      } else if (item.fileData) {
        // Backward compatibility with version-1 Base64 exports.
        const response = await fetch(item.fileData);

        if (!response.ok) {
          throw new Error(`Could not restore ${item.name}.`);
        }

        blob = await response.blob();
      }

      const {
        fileData,
        filePath,
        ...metadata
      } = item;

      const now = new Date().toISOString();

      await saveResource({
        ...metadata,
        id: `${accountId}-${item.id}`,
        accountId,
        blob,
        createdAt: now,
        updatedAt: now,
      });
    }
  );

  return selected.length;
}

export function getShareToken() {
  const url = new URL(window.location.href);

  const pathMatch = url.pathname.match(
    /\/library\/import\/([0-9a-f-]{36})\/?$/i
  );

  if (pathMatch) return pathMatch[1];

  return url.searchParams.get("import");
}
