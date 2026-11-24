const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const PDF_MIME = "application/pdf";

const EXPORTABLE_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);

let googleScriptPromise;

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("The operation was cancelled.", "AbortError");
  }
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]',
      );

      const script = existing || document.createElement("script");

      script.onload = resolve;
      script.onerror = () => {
        googleScriptPromise = null;
        reject(new Error("Google authorization could not be loaded."));
      };

      if (!existing) {
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }

  return googleScriptPromise;
}

export function preloadDriveAuthorization() {
  return loadGoogleIdentity();
}

export function requestDriveAccess() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return Promise.reject(new Error("Google Drive import is not configured."));
  }

  if (!window.google?.accounts?.oauth2) {
    return Promise.reject(new Error("Google authorization is still loading. Please try again."));
  }

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || "Google access was not granted."));
          return;
        }

        resolve(response.access_token);
      },
      error_callback: () => reject(
        new Error("Google authorization was closed or blocked. Please try again."),
      ),
    });

    client.requestAccessToken({ prompt: "" });
  });
}

function getDriveId(input) {
  let url;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Paste a valid Google Drive file or folder link.");
  }

  if (!["drive.google.com", "docs.google.com"].includes(url.hostname)) {
    throw new Error("That is not a Google Drive link.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const markerIndex = segments.findIndex((part) =>
    ["folders", "file", "document", "spreadsheets", "presentation"].includes(part),
  );

  const id = markerIndex >= 0
    ? segments[markerIndex + 1]
    : url.searchParams.get("id");

  if (!id || !/^[\w-]+$/.test(id)) {
    throw new Error("Could not find a file or folder ID in that link.");
  }

  return id;
}

async function driveRequest(path, token, params = {}, signal) {
  const url = new URL(`${DRIVE_API}/${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Google could not access that file. Check its sharing permissions and try again.");
    }

    if (response.status === 404) {
      throw new Error("That Drive file or folder was not found or is not accessible.");
    }

    throw new Error(`Google Drive request failed (${response.status}).`);
  }

  return response;
}

async function getFile(id, token, signal) {
  throwIfAborted(signal);
  const response = await driveRequest(`files/${encodeURIComponent(id)}`, token, {
    fields: "id,name,mimeType,size,modifiedTime",
    supportsAllDrives: true,
  }, signal);

  return response.json();
}

async function listFolder(folderId, token, signal) {
  throwIfAborted(signal);
  const files = [];
  let pageToken;

  do {
    const response = await driveRequest("files", token, {
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken,
      orderBy: "name",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    }, signal);

    const data = await response.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

export async function listDrivePdfs(input, token, onProgress, signal) {
  throwIfAborted(signal);
  onProgress?.({ stage: "connecting", completed: 0, total: 0 });
  const rootId = getDriveId(input);
  const root = await getFile(rootId, token, signal);
  throwIfAborted(signal);

  if (root.mimeType !== FOLDER_MIME) {
    if (root.mimeType !== PDF_MIME && !EXPORTABLE_TYPES.has(root.mimeType)) {
      throw new Error("This file cannot be imported as a PDF.");
    }

    onProgress?.({ stage: "complete", completed: 1, total: 1 });
    return {
      items: [{
        id: root.id,
        name: root.name,
        mimeType: root.mimeType,
        size: Number(root.size) || 0,
      }],
    };
  }

  const folders = [root.id];
  const visited = new Set();
  const items = [];

  while (folders.length) {
    throwIfAborted(signal);
    const folderId = folders.shift();
    onProgress?.({
      stage: "scanning",
      completed: items.length,
      total: 0,
      message: `Scanning Drive folder ${visited.size + 1}… Found ${items.length} supported documents so far.`,
    });
    if (visited.has(folderId)) continue;
    visited.add(folderId);

    const children = await listFolder(folderId, token, signal);
    throwIfAborted(signal);

    for (const file of children) {
      if (file.mimeType === FOLDER_MIME) {
        folders.push(file.id);
      } else if (
        file.mimeType === PDF_MIME ||
        EXPORTABLE_TYPES.has(file.mimeType)
      ) {
        items.push({
          id: file.id,
          name: file.name.replace(/\.(docx?|xlsx?|pptx?)$/i, "") + (
            file.mimeType === PDF_MIME || file.name.toLowerCase().endsWith(".pdf")
              ? ""
              : ".pdf"
          ),
          mimeType: file.mimeType,
          size: Number(file.size) || 0,
        });
      }

      if (items.length > 500) {
        throw new Error("This folder contains more than 500 supported documents. Please use a smaller folder.");
      }
    }
  }

  if (!items.length) {
    throw new Error("No PDFs or exportable Google documents were found in that folder.");
  }

  throwIfAborted(signal);
  onProgress?.({ stage: "complete", completed: items.length, total: items.length });
  return { items };
}

export async function downloadDrivePdf(item, token, signal) {
  const isGoogleDocument = EXPORTABLE_TYPES.has(item.mimeType);
  const path = isGoogleDocument
    ? `files/${encodeURIComponent(item.id)}/export`
    : `files/${encodeURIComponent(item.id)}`;

  const response = await driveRequest(path, token, isGoogleDocument
    ? { mimeType: PDF_MIME }
    : { alt: "media" },
    signal,
  );

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error(`${item.name} is empty or could not be downloaded.`);
  }

  return new File([blob], item.name.toLowerCase().endsWith(".pdf")
    ? item.name
    : `${item.name}.pdf`, {
    type: PDF_MIME,
    lastModified: Date.now(),
  });
}
