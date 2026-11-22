import {
  readAccountStorage,
  writeAccountStorage,
  getActiveAccountId,
} from "./accountStorage";

const STORAGE_KEY = "reading-state-v1";
const MAX_ENTRIES = 60;
const SAVE_DELAY = 400;

let cache = null;
let cacheAccountId = null;
let timer = 0;

const load = () => {
  const userId = getActiveAccountId();

  if (!userId) return {};

  if (cache && cacheAccountId === userId) {
    return cache;
  }

  cacheAccountId = userId;
  cache = readAccountStorage(STORAGE_KEY, {}, userId);

  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    cache = {};
  }

  return cache;
};

const persist = (expectedUserId) => {
  if (!expectedUserId || getActiveAccountId() !== expectedUserId) {
    return;
  }

  const all = load();
  const keys = Object.keys(all);

  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((key) => delete all[key]);
  }

  writeAccountStorage(STORAGE_KEY, all, expectedUserId);
};

const schedulePersist = (expectedUserId) => {
  clearTimeout(timer);
  timer = setTimeout(() => persist(expectedUserId), SAVE_DELAY);
};

export function getReadingState(key) {
  if (!getActiveAccountId()) return null;
  return load()[key] || null;
}

export function saveReadingState(key, patch) {
  const userId = getActiveAccountId();
  if (!userId) return;

  const all = load();
  const current = all[key] || {};

  all[key] = {
    ...current,
    ...patch,
    scroll: { ...current.scroll, ...patch.scroll },
    expanded: { ...current.expanded, ...patch.expanded },
    updatedAt: Date.now(),
  };

  schedulePersist(userId);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    clearTimeout(timer);

    if (cacheAccountId) {
      persist(cacheAccountId);
    }
  });
}
