const DB_NAME = "rxct-background-jobs";
const DB_VERSION = 1;
const STORE_NAME = "jobs";
const JOB_EVENT = "rxct-background-job-change";

let databasePromise;

export function getBackgroundJobProgress(job) {
  if (!job) return { percentage: 0, processedBytes: 0, totalBytes: 0, etaSeconds: null };
  const processedBytes = Number(job.processedBytes || 0);
  const totalBytes = Number(job.totalBytes || 0);
  const percentage = totalBytes
    ? Math.min(100, Math.round((processedBytes / totalBytes) * 100))
    : job.totalItems
      ? Math.min(100, Math.round((Number(job.processedItems || 0) / job.totalItems) * 100))
      : 0;
  return {
    percentage,
    processedBytes,
    totalBytes,
    etaSeconds: job.estimatedRemainingSeconds ?? null,
  };
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support background job storage."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("accountId", "accountId", { unique: false });
      store.createIndex("accountStatus", ["accountId", "status"], { unique: false });
      store.createIndex("updatedAt", "updatedAt", { unique: false });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Could not open background job storage."));
    };
  });
  return databasePromise;
}

function requireAccount(accountId) {
  if (!accountId) throw new Error("A signed-in account is required.");
  return String(accountId);
}

function notify(job) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(JOB_EVENT, { detail: job }));
  }
  return job;
}

function request(mode, callback) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    try {
      result = callback(transaction.objectStore(STORE_NAME));
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error || new Error("Background job storage failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Background job storage was aborted."));
  }));
}

export function subscribeToBackgroundJobs(listener) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => listener(event.detail);
  window.addEventListener(JOB_EVENT, handler);
  return () => window.removeEventListener(JOB_EVENT, handler);
}

export async function createBackgroundJob({ accountId, type, totalItems = 0, totalBytes = 0, checkpoint = {} }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    accountId: requireAccount(accountId),
    type,
    status: "running",
    stage: "queued",
    processedItems: 0,
    totalItems,
    processedBytes: 0,
    totalBytes,
    estimatedRemainingSeconds: null,
    checkpoint,
    createdAt: now,
    updatedAt: now,
  };
  await request("readwrite", (store) => store.put(job));
  return notify(job);
}

export async function getBackgroundJobs(accountId, { includeCompleted = false } = {}) {
  const id = requireAccount(accountId);
  const jobs = await request("readonly", (store) => store.index("accountId").getAll(id));
  return jobs
    .filter((job) => includeCompleted || !["completed", "cancelled"].includes(job.status))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function updateBackgroundJob(accountId, jobId, changes) {
  const id = requireAccount(accountId);
  const existing = await request("readonly", (store) => store.get(jobId));
  if (!existing || String(existing.accountId) !== id) throw new Error("This background job does not belong to the signed-in account.");
  const job = { ...existing, ...changes, id: existing.id, accountId: id, updatedAt: new Date().toISOString() };
  await request("readwrite", (store) => store.put(job));
  return notify(job);
}

export function pauseBackgroundJob(accountId, jobId) {
  return updateBackgroundJob(accountId, jobId, { status: "paused", pausedAt: new Date().toISOString() });
}

export function resumeBackgroundJob(accountId, jobId) {
  return updateBackgroundJob(accountId, jobId, { status: "running", pausedAt: null, error: null });
}

export function cancelBackgroundJob(accountId, jobId) {
  return updateBackgroundJob(accountId, jobId, { status: "cancelled", stage: "cancelled", cancelledAt: new Date().toISOString() });
}

export function completeBackgroundJob(accountId, jobId, changes = {}) {
  return updateBackgroundJob(accountId, jobId, { ...changes, status: "completed", stage: "complete" });
}

export function failBackgroundJob(accountId, jobId, error) {
  return updateBackgroundJob(accountId, jobId, {
    status: "failed",
    stage: "failed",
    error: error?.message || String(error || "Background job failed."),
  });
}

export { JOB_EVENT };
