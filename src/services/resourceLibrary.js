import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readAccountStorage, writeAccountStorage } from "./accountStorage";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DB_NAME = "rxct-resources";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const CORRECTIONS_KEY = "resource-course-corrections";
const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "into", "of", "in", "to",
  "a", "an", "on", "or", "by", "this", "that", "these", "those",
  "lecture", "notes", "note", "slides", "slide", "document", "pdf",
]);

function requireAccount(accountId) {
  if (!accountId) throw new Error("A signed-in account is required.");
  return String(accountId);
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support local document storage."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (!store.indexNames.contains("accountId")) {
        store.createIndex("accountId", "accountId", { unique: false });
      }
      if (!store.indexNames.contains("updatedAt")) {
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error || new Error("Could not open local document storage."),
    );
  });
}

function transactionRequest(mode, callback) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = callback(transaction.objectStore(STORE_NAME));
    let result;

    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(
      request.error || new Error("Local document storage failed."),
    );
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Local document storage failed."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Local document storage was aborted."));
    };
  }));
}

export function getResources(accountId) {
  const id = requireAccount(accountId);

  return transactionRequest("readonly", (store) =>
    store.index("accountId").getAll(id),
  ).then((resources) =>
    resources.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
  );
}

export function saveResource(resource) {
  requireAccount(resource.accountId);
  if (!resource.id) throw new Error("This document is missing its storage ID.");
  return transactionRequest("readwrite", (store) => store.put(resource));
}

export async function removeResource(accountId, resourceId) {
  const id = requireAccount(accountId);
  const existing = await transactionRequest("readonly", (store) =>
    store.get(resourceId),
  );

  if (!existing || String(existing.accountId) !== id) {
    throw new Error("This document does not belong to the signed-in account.");
  }

  return transactionRequest("readwrite", (store) => store.delete(resourceId));
}

function readCorrections(accountId) {
  const value = readAccountStorage(CORRECTIONS_KEY, {}, requireAccount(accountId));
  return value && typeof value === "object" ? value : {};
}

function normalizeTokens(value) {
  return [...new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3 && !STOP_WORDS.has(token)),
  )].slice(0, 180);
}

function tokenSimilarity(left, right) {
  const a = new Set(left || []);
  const b = new Set(right || []);
  if (!a.size || !b.size) return 0;

  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;

  return overlap / Math.sqrt(a.size * b.size);
}

export function getRememberedCorrection(accountId, documentFingerprint, documentText = "") {
  const corrections = readCorrections(accountId);
  const exact = corrections.exact?.[documentFingerprint] || corrections[documentFingerprint];

  if (exact) return { courseId: exact, source: "exact", confidence: 1 };

  const tokens = normalizeTokens(documentText);
  if (tokens.length < 8) return null;

  const matches = (corrections.examples || [])
    .map((example) => ({
      ...example,
      confidence: tokenSimilarity(tokens, example.tokens),
    }))
    .filter((example) => example.confidence >= 0.78)
    .sort((a, b) => b.confidence - a.confidence);

  const best = matches[0];
  const secondDifferentCourse = matches.find(
    (match) => match.courseId !== best?.courseId,
  );

  if (!best) return null;
  if (secondDifferentCourse && best.confidence - secondDifferentCourse.confidence < 0.12) {
    return null;
  }

  return {
    courseId: best.courseId,
    source: "learned",
    confidence: best.confidence,
  };
}

export function rememberCorrection(
  accountId,
  documentFingerprint,
  courseId,
  documentText = "",
) {
  const id = requireAccount(accountId);
  if (!documentFingerprint || !courseId) return false;

  const corrections = readCorrections(id);
  corrections.exact = corrections.exact || {};
  corrections.exact[documentFingerprint] = courseId;

  const tokens = normalizeTokens(documentText);
  if (tokens.length >= 8) {
    corrections.examples = (corrections.examples || []).filter(
      (example) => example.fingerprint !== documentFingerprint,
    );

    corrections.examples.unshift({
      fingerprint: documentFingerprint,
      courseId,
      tokens,
      updatedAt: new Date().toISOString(),
    });

    // Keep a small, account-local learning set.
    corrections.examples = corrections.examples.slice(0, 80);
  }

  return writeAccountStorage(CORRECTIONS_KEY, corrections, id);
}

async function fingerprint(file, text) {
  const source = `${file.name}:${file.size}:${file.lastModified}:${text.slice(0, 2000)}`;

  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return source;
}

export async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }

  return { text: pages.join("\n"), pageCount: document.numPages };
}


export { fingerprint };

export async function hashPdfContent(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("A valid PDF file is required to calculate its content hash.");
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure PDF duplicate detection is unavailable in this browser.");
  }

  const bytes = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function findDuplicateResource(accountId, contentHash) {
  const id = requireAccount(accountId);
  if (!contentHash) return null;

  const resources = await getResources(id);

  for (const resource of resources) {
    let existingHash = resource.contentHash;

    // Older documents predate content hashes. Fingerprint their stored
    // PDF once, then cache the hash without changing their other metadata.
    if (!existingHash && resource.blob) {
      existingHash = await hashPdfContent(resource.blob);
      await saveResource({ ...resource, contentHash: existingHash });
    }

    if (existingHash === contentHash) return resource;
  }

  return null;
}

export async function renameDuplicateResource(accountId, resource, newName) {
  const id = requireAccount(accountId);

  if (!resource || String(resource.accountId) !== id || !resource.id) {
    throw new Error("This document does not belong to the signed-in account.");
  }

  const cleanName = String(newName || "").trim();
  if (!cleanName) throw new Error("A valid document name is required.");

  // Preserve the existing blob, ID, course, progress, and timestamps.
  return saveResource({ ...resource, name: cleanName });
}

const COURSE_INFO_KEY = "resource-course-descriptions";

export function getCourseDescriptions(accountId) {
  const value = readAccountStorage(
    COURSE_INFO_KEY,
    {},
    requireAccount(accountId),
  );
  return value && typeof value === "object" ? value : {};
}

export function saveCourseDescription(accountId, courseId, description) {
  const id = requireAccount(accountId);
  if (!courseId) return false;

  const descriptions = getCourseDescriptions(id);
  const cleanDescription = String(description || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 160);

  if (cleanDescription) descriptions[courseId] = cleanDescription;
  else delete descriptions[courseId];

  return writeAccountStorage(COURSE_INFO_KEY, descriptions, id);
}
