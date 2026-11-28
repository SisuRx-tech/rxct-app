import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.883.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.883.0";
import {
  NEW_STORAGE_PROVIDER,
  canComplete,
  isOwnedBy,
  shouldRemoveObjectMetadata,
  validatePortableExportInput,
  verifyS3Head,
} from "./portableValidation.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...cors, "Content-Type": "application/json" };
const PRESIGNED_URL_SECONDS = 15 * 60;
const LEGACY_BUCKET_MARKER = "legacy";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

function requiredConfig(names: string[]) {
  const missing = names.filter((name) => !Deno.env.get(name));
  if (missing.length) {
    throw new HttpError(`Portable backup is not configured. Missing server secrets: ${missing.join(", ")}.`, 503);
  }
}

function s3Config() {
  requiredConfig(["B2_S3_ENDPOINT", "B2_S3_REGION", "B2_S3_BUCKET_NAME", "B2_S3_ACCESS_KEY_ID", "B2_S3_SECRET_ACCESS_KEY"]);
  return {
    endpoint: Deno.env.get("B2_S3_ENDPOINT")!,
    region: Deno.env.get("B2_S3_REGION")!,
    bucketName: Deno.env.get("B2_S3_BUCKET_NAME")!,
    accessKeyId: Deno.env.get("B2_S3_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("B2_S3_SECRET_ACCESS_KEY")!,
  };
}

function legacyConfig() {
  requiredConfig(["B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET_ID", "B2_BUCKET_NAME"]);
  return {
    keyId: Deno.env.get("B2_KEY_ID")!,
    applicationKey: Deno.env.get("B2_APPLICATION_KEY")!,
    bucketId: Deno.env.get("B2_BUCKET_ID")!,
    bucketName: Deno.env.get("B2_BUCKET_NAME")!,
  };
}

function s3Client(config: ReturnType<typeof s3Config>) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

async function userFromRequest(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError("Authentication required.", 401);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError("Authentication required.", 401);
  return data.user;
}

async function b2Authorize(config: ReturnType<typeof legacyConfig>) {
  const response = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${btoa(`${config.keyId}:${config.applicationKey}`)}` },
  });
  if (!response.ok) throw new HttpError("Legacy Backblaze authorization failed.", 502);
  return response.json();
}

function normalizeRequestId(value: unknown) {
  const requestId = String(value || "");
  return /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : null;
}

function safeFilename(value: string) {
  return value.replace(/["\\\r\n]/g, "-");
}

function legacyBucketName(row: any, config: ReturnType<typeof legacyConfig>) {
  return row?.storage_bucket && row.storage_bucket !== LEGACY_BUCKET_MARKER ? row.storage_bucket : config.bucketName;
}

async function presignedUpload(config: ReturnType<typeof s3Config>, item: any) {
  return getSignedUrl(
    s3Client(config),
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: item.objectKey,
      ContentType: item.mimeType,
      Metadata: { "content-sha256": item.contentHash },
    }),
    { expiresIn: PRESIGNED_URL_SECONDS },
  );
}

async function presignedDownload(config: ReturnType<typeof s3Config>, item: any) {
  return getSignedUrl(
    s3Client(config),
    new GetObjectCommand({ Bucket: config.bucketName, Key: item.object_key }),
    { expiresIn: PRESIGNED_URL_SECONDS },
  );
}

async function verifyNewObject(config: ReturnType<typeof s3Config>, item: any) {
  try {
    const head = await s3Client(config).send(new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: item.objectKey,
    }));
    verifyS3Head(item, head);
  } catch (error) {
    if (error instanceof Error && /verification failed/.test(error.message)) throw error;
    throw new HttpError(`Portable object is missing or could not be verified: ${item.contentHash}.`, 502);
  }
}

async function findExistingNewObjects(hashes: string[], bucketName: string) {
  if (!hashes.length) return new Map();
  const result = await admin.from("rxct_portable_objects")
    .select("content_hash, object_key, file_size, mime_type, storage_provider, storage_bucket, verified_at")
    .in("content_hash", hashes)
    .eq("storage_provider", NEW_STORAGE_PROVIDER)
    .eq("storage_bucket", bucketName);
  if (result.error) throw result.error;
  return new Map((result.data || []).map((row: any) => [row.content_hash, row]));
}

async function prepareResponse(exportRow: any, itemRows: any[], existing: Map<string, any>, config: ReturnType<typeof s3Config>) {
  const items = await Promise.all(itemRows.map(async (row: any) => {
    const existingObject = existing.get(row.content_hash);
    return {
      content_hash: row.content_hash,
      object_key: row.object_key,
      already_exists: Boolean(existingObject),
      upload_url: existingObject ? null : await presignedUpload(config, {
        contentHash: row.content_hash,
        objectKey: row.object_key,
        fileSize: Number(row.file_size),
        mimeType: row.mime_type,
      }),
    };
  }));
  return { export_id: exportRow.id, token: exportRow.token, items };
}

async function failExport(exportId: string) {
  await admin.from("rxct_portable_exports").update({ status: "failed" }).eq("id", exportId).eq("status", "preparing");
}

async function prepare(user: any, body: any) {
  const validated = validatePortableExportInput(body);
  const config = s3Config();
  const requestId = normalizeRequestId(body.request_id) || crypto.randomUUID();

  let exportRow = await admin.from("rxct_portable_exports")
    .select("id, token, status")
    .eq("owner_id", user.id)
    .eq("request_id", requestId)
    .maybeSingle();
  if (exportRow.error) throw exportRow.error;

  if (!exportRow.data) {
    const inserted = await admin.from("rxct_portable_exports").insert({
      owner_id: user.id,
      request_id: requestId,
      schema_version: validated.manifest.schemaVersion,
      status: "preparing",
      manifest: validated.manifest,
      total_documents: validated.items.length,
      total_bytes: validated.totalBytes,
      storage_provider: NEW_STORAGE_PROVIDER,
      storage_bucket: config.bucketName,
    }).select("id, token, status").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      exportRow = await admin.from("rxct_portable_exports")
        .select("id, token, status")
        .eq("owner_id", user.id)
        .eq("request_id", requestId)
        .single();
      if (exportRow.error) throw exportRow.error;
    } else {
      exportRow = inserted;
    }
  }

  if (!canComplete(exportRow.data.status)) throw new HttpError("This portable export cannot be prepared again.", 409);

  let itemRows = await admin.from("rxct_portable_export_items")
    .select("content_hash, object_key, display_name, file_size, mime_type, storage_provider, storage_bucket")
    .eq("export_id", exportRow.data.id)
    .order("content_hash");
  if (itemRows.error) throw itemRows.error;

  if (!itemRows.data?.length) {
    const inserted = await admin.from("rxct_portable_export_items").insert(validated.items.map((item) => ({
      export_id: exportRow.data.id,
      content_hash: item.contentHash,
      object_key: item.objectKey,
      display_name: item.displayName,
      file_size: item.fileSize,
      mime_type: item.mimeType,
      storage_provider: NEW_STORAGE_PROVIDER,
      storage_bucket: config.bucketName,
    }))).select("content_hash, object_key, display_name, file_size, mime_type, storage_provider, storage_bucket");
    if (inserted.error) {
      await failExport(exportRow.data.id);
      throw inserted.error;
    }
    itemRows = inserted;
  }

  const preparedHashes = new Set(itemRows.data.map((row: any) => row.content_hash));
  if (preparedHashes.size !== validated.items.length || validated.items.some((item) => !preparedHashes.has(item.contentHash))) {
    throw new HttpError("Portable export retry payload does not match the existing export.", 409);
  }

  const existing = await findExistingNewObjects(itemRows.data.map((row: any) => row.content_hash), config.bucketName);
  return prepareResponse(exportRow.data, itemRows.data, existing, config);
}

async function complete(user: any, body: any) {
  const exportId = String(body.export_id || "");
  const found = await admin.from("rxct_portable_exports")
    .select("id, token, owner_id, status, expires_at, storage_provider, storage_bucket")
    .eq("id", exportId)
    .eq("owner_id", user.id)
    .single();
  if (found.error || !found.data) throw new HttpError("Portable export not found.", 404);
  if (!isOwnedBy(found.data, user.id)) throw new HttpError("Portable export not found.", 404);
  if (found.data.status === "ready") return { token: found.data.token, expires_at: found.data.expires_at };
  if (found.data.status !== "preparing") throw new HttpError("Portable export cannot be completed.", 409);

  const config = s3Config();
  const rows = await admin.from("rxct_portable_export_items")
    .select("content_hash, object_key, file_size, mime_type, storage_provider, storage_bucket")
    .eq("export_id", exportId);
  if (rows.error) throw rows.error;
  if (!rows.data?.length) throw new HttpError("Portable export has no documents.", 400);

  const verifiedAt = new Date().toISOString();
  const verified = [];
  for (const row of rows.data) {
    if (row.storage_provider !== NEW_STORAGE_PROVIDER || row.storage_bucket !== config.bucketName) {
      throw new HttpError("New exports must use the configured S3 bucket.", 409);
    }
    await verifyNewObject(config, {
      contentHash: row.content_hash,
      objectKey: row.object_key,
      fileSize: Number(row.file_size),
      mimeType: row.mime_type,
    });
    verified.push({
      content_hash: row.content_hash,
      object_key: row.object_key,
      file_size: row.file_size,
      mime_type: row.mime_type,
      storage_provider: NEW_STORAGE_PROVIDER,
      storage_bucket: config.bucketName,
      verified_at: verifiedAt,
    });
  }

  const objects = await admin.from("rxct_portable_objects").upsert(verified, {
    onConflict: "content_hash,storage_provider,storage_bucket",
  });
  if (objects.error) throw objects.error;

  const updated = await admin.from("rxct_portable_exports")
    .update({ status: "ready", completed_at: verifiedAt })
    .eq("id", exportId)
    .eq("owner_id", user.id)
    .eq("status", "preparing")
    .select("token, expires_at")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) {
    const retry = await admin.from("rxct_portable_exports").select("token, expires_at, status").eq("id", exportId).eq("owner_id", user.id).single();
    if (retry.error || retry.data.status !== "ready") throw new HttpError("Portable export completion could not be committed.", 503);
    return retry.data;
  }
  return updated.data;
}

async function resolve(body: any) {
  const token = String(body.token || "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new HttpError("That portable export has expired or is unavailable.", 404);
  const found = await admin.from("rxct_portable_exports")
    .select("id, token, schema_version, manifest, total_documents, total_bytes, expires_at, last_accessed_at")
    .eq("token", token)
    .eq("status", "ready")
    .gt("expires_at", new Date().toISOString())
    .single();
  if (found.error || !found.data) throw new HttpError("That portable export has expired or is unavailable.", 404);

  const nextExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const touched = await admin.from("rxct_portable_exports")
    .update({ last_accessed_at: new Date().toISOString(), expires_at: nextExpiry })
    .eq("id", found.data.id)
    .eq("status", "ready");
  if (touched.error) throw touched.error;

  const items = await admin.from("rxct_portable_export_items")
    .select("content_hash, object_key, display_name, file_size, mime_type, metadata, storage_provider, storage_bucket")
    .eq("export_id", found.data.id);
  if (items.error) throw items.error;
  const resolvedItems = items.data || [];
  if (resolvedItems.some((item: any) => item.storage_provider === NEW_STORAGE_PROVIDER)) {
    const config = s3Config();
    for (const item of resolvedItems) {
      if (item.storage_provider === NEW_STORAGE_PROVIDER && item.storage_bucket === config.bucketName) {
        item.download_url = await presignedDownload(config, item);
      }
    }
  }
  return { ...found.data, expires_at: nextExpiry, items: resolvedItems };
}

async function downloadLegacy(row: any) {
  const config = legacyConfig();
  const auth = await b2Authorize(config);
  const bucketName = row.storage_bucket && row.storage_bucket !== LEGACY_BUCKET_MARKER ? row.storage_bucket : config.bucketName;
  const response = await fetch(`${auth.downloadUrl}/file/${encodeURIComponent(bucketName)}/${row.object_key.split("/").map(encodeURIComponent).join("/")}`, { headers: { Authorization: auth.authorizationToken } });
  if (!response.ok || !response.body) throw new HttpError("The legacy portable document is unavailable.", 502);
  return response;
}

async function download(body: any) {
  const payload = await resolve(body);
  const item = (payload.items || []).find((candidate: any) => candidate.content_hash === body.content_hash);
  if (!item) throw new HttpError("That document is not part of the portable export.", 404);

  let response: Response;
  if (item.storage_provider === NEW_STORAGE_PROVIDER) {
    const config = s3Config();
    if (item.storage_bucket !== config.bucketName) throw new HttpError("Portable object bucket is not configured.", 409);
    try {
      const result = await s3Client(config).send(new GetObjectCommand({ Bucket: config.bucketName, Key: item.object_key }));
      response = new Response(result.Body as ReadableStream, { status: 200 });
    } catch {
      throw new HttpError("The portable document is unavailable.", 502);
    }
  } else {
    response = await downloadLegacy(item);
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": item.mime_type || "application/pdf",
      "Content-Length": String(item.file_size),
      "Content-Disposition": `attachment; filename="${safeFilename(String(item.display_name))}"`,
    },
  });
}

async function deleteLegacyObject(row: any) {
  const config = legacyConfig();
  const auth = await b2Authorize(config);
  const listed = await fetch(`${auth.apiUrl}/b2api/v3/b2_list_file_names`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: config.bucketId, prefix: row.object_key, maxFileCount: 100 }),
  });
  if (!listed.ok) throw new HttpError("Legacy object listing failed.", 502);
  const files = await listed.json();
  const file = (files.files || []).find((candidate: any) => candidate.fileName === row.object_key);
  if (!file) return true;
  const deleted = await fetch(`${auth.apiUrl}/b2api/v3/b2_delete_file_version`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: file.fileId, fileName: file.fileName }),
  });
  if (!deleted.ok) throw new HttpError("Legacy object deletion failed.", 502);
  return true;
}

async function deleteObject(row: any) {
  if (row.storage_provider === NEW_STORAGE_PROVIDER) {
    const config = s3Config();
    if (row.storage_bucket !== config.bucketName) throw new HttpError("Portable object bucket is not configured.", 409);
    await s3Client(config).send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: row.object_key }));
    return true;
  }
  return deleteLegacyObject(row);
}

async function cleanup(req: Request) {
  const expected = Deno.env.get("PORTABLE_CLEANUP_SECRET");
  if (!expected || req.headers.get("X-RxCT-Cleanup-Secret") !== expected) throw new HttpError("Cleanup authorization failed.", 401);

  const expired = await admin.from("rxct_portable_exports")
    .select("id")
    .lte("expires_at", new Date().toISOString())
    .in("status", ["preparing", "ready", "failed"]);
  if (expired.error) throw expired.error;

  let removed = 0;
  let deletedObjects = 0;
  let failedObjects = 0;
  for (const exportRow of expired.data || []) {
    const items = await admin.from("rxct_portable_export_items")
      .select("content_hash, object_key, file_size, mime_type, storage_provider, storage_bucket")
      .eq("export_id", exportRow.id);
    if (items.error) throw items.error;

    let failed = false;
    for (const item of items.data || []) {
      const refs = await admin.from("rxct_portable_export_items")
        .select("export_id", { count: "exact", head: true })
        .eq("content_hash", item.content_hash)
        .eq("storage_provider", item.storage_provider)
        .eq("storage_bucket", item.storage_bucket)
        .eq("object_key", item.object_key);
      if (refs.error) throw refs.error;
      if ((refs.count || 0) > 1) continue;

      try {
        const deleted = await deleteObject(item);
        if (shouldRemoveObjectMetadata(deleted)) {
          const removedObject = await admin.from("rxct_portable_objects")
            .delete()
            .eq("content_hash", item.content_hash)
            .eq("storage_provider", item.storage_provider)
            .eq("storage_bucket", item.storage_bucket)
            .eq("object_key", item.object_key);
          if (removedObject.error) throw removedObject.error;
          deletedObjects += 1;
        }
      } catch (error) {
        failed = true;
        failedObjects += 1;
        console.error("Portable object cleanup failed.", { contentHash: item.content_hash, provider: item.storage_provider, message: error instanceof Error ? error.message : "unknown error" });
      }
    }

    if (failed) {
      await admin.from("rxct_portable_exports").update({ status: "failed" }).eq("id", exportRow.id);
      continue;
    }
    const deletedExport = await admin.from("rxct_portable_exports").delete().eq("id", exportRow.id);
    if (deletedExport.error) throw deletedExport.error;
    removed += 1;
  }
  return { removed, deletedObjects, failedObjects };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    if (body.action === "cleanup") return reply(await cleanup(req));
    const user = await userFromRequest(req);
    if (body.action === "prepare") return reply(await prepare(user, body));
    if (body.action === "complete") return reply(await complete(user, body));
    if (body.action === "resolve") return reply(await resolve(body));
    if (body.action === "download") return download(body);
    throw new HttpError("Unsupported portable export action.", 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return reply({ error: error instanceof Error ? error.message : "Portable export failed." }, status);
  }
});
