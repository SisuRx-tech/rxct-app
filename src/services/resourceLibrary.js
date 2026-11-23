import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readAccountStorage, writeAccountStorage } from "./accountStorage";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DB_NAME = "rxct-resources";
const DB_VERSION = 1;
const STORE_NAME = "documents";
const CORRECTIONS_KEY = "resource-course-corrections";

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
      if (!store.indexNames.contains("accountId")) store.createIndex("accountId", "accountId", { unique: false });
      if (!store.indexNames.contains("updatedAt")) store.createIndex("updatedAt", "updatedAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local document storage."));
  });
}

function transactionRequest(mode, callback) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = callback(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local document storage failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local document storage was aborted."));
    transaction.oncomplete = () => database.close();
  }));
}

export function getResources(accountId) {
  const id = requireAccount(accountId);
  return transactionRequest("readonly", (store) => store.index("accountId").getAll(id))
    .then((resources) => resources.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
}

export function saveResource(resource) {
  requireAccount(resource.accountId);
  return transactionRequest("readwrite", (store) => store.put(resource));
}

export function removeResource(accountId, resourceId) {
  requireAccount(accountId);
  return transactionRequest("readwrite", (store) => store.delete(resourceId));
}

function readCorrections(accountId) {
  return readAccountStorage(CORRECTIONS_KEY, {}, accountId) || {};
}

export function getRememberedCorrection(accountId, fingerprint) {
  return readCorrections(accountId)[fingerprint] || null;
}

export function rememberCorrection(accountId, fingerprint, courseId) {
  const corrections = readCorrections(accountId);
  corrections[fingerprint] = courseId;
  writeAccountStorage(CORRECTIONS_KEY, corrections, accountId);
}

async function fingerprint(file, text) {
  const source = `${file.name}:${file.size}:${file.lastModified}:${text.slice(0, 2000)}`;
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
