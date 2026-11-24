import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "rxct-documents";
const MAX_BYTES = 80 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "");

  if (!token) throw new Error("Authentication required.");

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Authentication required.");
  }

  return data.user;
}

function cleanName(value: string) {
  const name = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);

  return name.toLowerCase().endsWith(".pdf")
    ? name
    : `${name || "document"}.pdf`;
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uniqueName(userId: string, originalName: string) {
  const original = cleanName(originalName);
  const dot = original.lastIndexOf(".");
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const extension = dot > 0 ? original.slice(dot) : ".pdf";

  const { data } = await admin
    .from("rxct_library_items")
    .select("display_name")
    .eq("user_id", userId)
    .ilike("display_name", `${stem}%`);

  const occupied = new Set(
    (data || []).map((row) => row.display_name),
  );

  let result = original;
  let index = 2;

  while (occupied.has(result)) {
    result = `${stem} (${index++})${extension}`;
  }

  return result;
}

async function startUpload(user: any, body: any) {
  const fileSize = Number(body.file_size);
  const contentHash = String(body.content_hash || "").toLowerCase();

  if (body.mime_type !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
    throw new Error("PDF must be smaller than 80 MB.");
  }

  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error("Invalid SHA-256 hash.");
  }

  const path = `.staging/${user.id}/${crypto.randomUUID()}.pdf`;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) throw error;

  return {
    path,
    token: data.token,
  };
}

async function finishUpload(user: any, body: any) {
  const path = String(body.path || "");
  const expectedHash = String(body.content_hash || "").toLowerCase();

  if (!path.startsWith(`.staging/${user.id}/`)) {
    throw new Error("Invalid staging path.");
  }

  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error("Invalid SHA-256 hash.");
  }

  const { data: file, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(path);

  if (downloadError || !file) {
    throw new Error("Uploaded PDF could not be read.");
  }

  const actualHash = await hashBlob(file);

  if (actualHash !== expectedHash) {
    await admin.storage.from(BUCKET).remove([path]);
    throw new Error("SHA-256 verification failed.");
  }

  let { data: document } = await admin
    .from("rxct_documents")
    .select("*")
    .eq("content_hash", actualHash)
    .maybeSingle();

  if (!document) {
    const storagePath = `${actualHash.slice(0, 2)}/${actualHash}.pdf`;

    const { error: moveError } = await admin.storage
      .from(BUCKET)
      .move(path, storagePath);

    if (moveError && !/already exists/i.test(moveError.message)) {
      throw moveError;
    }

    const { data: inserted, error: insertError } = await admin
      .from("rxct_documents")
      .insert({
        content_hash: actualHash,
        storage_path: storagePath,
        mime_type: "application/pdf",
        file_size: file.size,
      })
      .select("*")
      .single();

    if (insertError && insertError.code !== "23505") {
      throw insertError;
    }

    if (inserted) {
      document = inserted;
    } else {
      const existing = await admin
        .from("rxct_documents")
        .select("*")
        .eq("content_hash", actualHash)
        .single();

      if (existing.error) throw existing.error;
      document = existing.data;
    }
  } else {
    await admin.storage.from(BUCKET).remove([path]);
  }

  const displayName = await uniqueName(
    user.id,
    body.display_name || "document.pdf",
  );

  const { data: item, error: itemError } = await admin
    .from("rxct_library_items")
    .upsert({
      user_id: user.id,
      document_id: document.id,
      display_name: displayName,
      course_id: body.course_id || null,
      assignment_status: body.course_id
        ? "assigned"
        : "unassigned",
    }, {
      onConflict: "user_id,document_id",
    })
    .select("*")
    .single();

  if (itemError) throw itemError;

  return { item, document };
}

async function listItems(user: any) {
  const { data, error } = await admin
    .from("rxct_library_items")
    .select("*, document:rxct_documents(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return { items: data || [] };
}

async function readItem(user: any, body: any) {
  const { data: item, error } = await admin
    .from("rxct_library_items")
    .select("*, document:rxct_documents(*)")
    .eq("id", body.item_id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) {
    throw new Error("Resource not found.");
  }

  const { data, error: urlError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(item.document.storage_path, 300);

  if (urlError) throw urlError;

  return {
    item,
    url: data.signedUrl,
  };
}

async function getOwnedItem(user: any, itemId: string) {
  const { data, error } = await admin
    .from("rxct_library_items")
    .select("*, document:rxct_documents(*)")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) throw new Error("Resource not found.");
  return data;
}

async function updateItem(user: any, body: any) {
  await getOwnedItem(user, String(body.item_id || ""));
  const changes: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    const name = cleanName(String(body.display_name));
    changes.display_name = name;
  }
  if (body.course_id !== undefined) {
    changes.course_id = body.course_id || null;
    changes.assignment_status = body.course_id ? "assigned" : "unassigned";
  }
  if (body.assignment_status !== undefined) {
    changes.assignment_status = String(body.assignment_status).slice(0, 40);
  }
  if (body.last_opened_at !== undefined) changes.last_opened_at = body.last_opened_at || null;
  if (body.last_opened_section !== undefined) {
    changes.last_opened_section = String(body.last_opened_section || "").slice(0, 255) || null;
  }
  if (body.progress !== undefined) changes.progress = body.progress || {};

  if (!Object.keys(changes).length) throw new Error("No resource changes were provided.");

  const { data, error } = await admin
    .from("rxct_library_items")
    .update(changes)
    .eq("id", body.item_id)
    .eq("user_id", user.id)
    .select("*, document:rxct_documents(*)")
    .single();

  if (error) throw error;
  return { item: data };
}

async function deleteItem(user: any, body: any) {
  await getOwnedItem(user, String(body.item_id || ""));
  const { error } = await admin
    .from("rxct_library_items")
    .delete()
    .eq("id", body.item_id)
    .eq("user_id", user.id);

  if (error) throw error;
  return { deleted: true };
}

async function createShare(user: any, body: any) {
  const itemIds = [...new Set((Array.isArray(body.item_ids) ? body.item_ids : [])
    .map((id) => String(id)).filter(Boolean))];
  if (!itemIds.length) throw new Error("Select at least one document to share.");

  const { data: items, error: itemsError } = await admin
    .from("rxct_library_items")
    .select("id, document_id, display_name, course_id")
    .eq("user_id", user.id)
    .in("id", itemIds);
  if (itemsError) throw itemsError;
  if (!items?.length || items.length !== itemIds.length) throw new Error("One or more resources are unavailable.");

  const { data: share, error: shareError } = await admin
    .from("rxct_document_shares")
    .insert({ owner_id: user.id })
    .select("id, token, expires_at")
    .single();
  if (shareError) throw shareError;

  const { error: shareItemsError } = await admin
    .from("rxct_document_share_items")
    .insert(items.map((item) => ({
      share_id: share.id,
      document_id: item.document_id,
      display_name: item.display_name,
      course_id: item.course_id,
    })));
  if (shareItemsError) {
    await admin.from("rxct_document_shares").delete().eq("id", share.id);
    throw shareItemsError;
  }

  return { token: share.token, expires_at: share.expires_at, item_count: items.length };
}

async function resolveShare(body: any) {
  const token = String(body.token || "");
  const { data: share, error: shareError } = await admin
    .from("rxct_document_shares")
    .select("id, token, owner_id, expires_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();
  if (shareError || !share) throw new Error("That RxCT share link has expired or is invalid.");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("rxct_document_shares").update({ expires_at: expiresAt }).eq("id", share.id);

  const { data: items, error } = await admin
    .from("rxct_document_share_items")
    .select("document_id, display_name, course_id, document:rxct_documents(content_hash, file_size, mime_type)")
    .eq("share_id", share.id);
  if (error) throw error;

  return { token: share.token, owner_id: share.owner_id, expires_at: expiresAt, items: items || [] };
}

async function importShare(user: any, body: any) {
  const payload = await resolveShare(body);
  const allowed = new Set((payload.items || []).map((item) => item.document_id));
  const requested = [...new Set((Array.isArray(body.item_ids) ? body.item_ids : [])
    .map((id) => String(id)).filter((id) => allowed.has(id)))];
  const selected = (payload.items || []).filter((item) => requested.includes(item.document_id));
  if (!selected.length) throw new Error("Select at least one shared document.");

  const { error: grantError } = await admin.from("rxct_document_access").upsert(
    selected.map((item) => ({ user_id: user.id, document_id: item.document_id, granted_by: payload.owner_id })),
    { onConflict: "user_id,document_id" },
  );
  if (grantError) throw grantError;

  const { data: items, error: itemError } = await admin
    .from("rxct_library_items")
    .upsert(selected.map((item) => ({
      user_id: user.id,
      document_id: item.document_id,
      display_name: item.display_name,
      course_id: item.course_id,
      assignment_status: item.course_id ? "assigned" : "unassigned",
    })), { onConflict: "user_id,document_id" })
    .select("*, document:rxct_documents(*)");
  if (itemError) throw itemError;
  return { items: items || [], expires_at: payload.expires_at };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const user = await getUser(req);
    const body = await req.json();

    if (body.action === "start") {
      return reply(await startUpload(user, body));
    }

    if (body.action === "finish") {
      return reply(await finishUpload(user, body));
    }

    if (body.action === "list") {
      return reply(await listItems(user));
    }

    if (body.action === "read") {
      return reply(await readItem(user, body));
    }

    if (body.action === "update") return reply(await updateItem(user, body));
    if (body.action === "delete") return reply(await deleteItem(user, body));
    if (body.action === "share") return reply(await createShare(user, body));
    if (body.action === "resolve-share") return reply(await resolveShare(body));
    if (body.action === "import-share") return reply(await importShare(user, body));

    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    return reply({
      error: error instanceof Error
        ? error.message
        : "Upload failed.",
    }, 400);
  }
});
