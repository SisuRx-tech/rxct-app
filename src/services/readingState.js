/* ========================================
   READING STATE
   Remembers, per medicine / class / group:
   the active section, scroll position per
   section and which subsections are open.

   Stored on the device so it also works
   offline. Moves to IndexedDB with the
   offline phase; only this file changes.
======================================== */

const STORAGE_KEY = "rxct-reading-state-v1";
const MAX_ENTRIES = 60;
const SAVE_DELAY = 400;

let cache = null;
let timer = 0;

const load = () => {
  if (cache) return cache;

  try {
    cache = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    cache = {};
  }

  return cache;
};

const persist = () => {
  const all = load();
  const keys = Object.keys(all);

  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((key) => delete all[key]);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage may be unavailable or full.
  }
};

const schedulePersist = () => {
  clearTimeout(timer);
  timer = setTimeout(persist, SAVE_DELAY);
};

export function getReadingState(key) {
  return load()[key] || null;
}

export function saveReadingState(key, patch) {
  const all = load();
  const current = all[key] || {};

  all[key] = {
    ...current,
    ...patch,
    scroll: { ...current.scroll, ...patch.scroll },
    expanded: { ...current.expanded, ...patch.expanded },
    updatedAt: Date.now(),
  };

  schedulePersist();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    clearTimeout(timer);
    persist();
  });
}
