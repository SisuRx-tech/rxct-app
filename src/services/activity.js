/* ========================================
   STUDY ACTIVITY
   Recent activity and the resume point.

   Uses the same storage keys the Medicines
   page has always used. Moves to IndexedDB
   with the offline phase.
======================================== */

const HISTORY_KEY = "rxct-medicine-history";
const PROGRESS_KEY = "rxct-study-progress";
const HISTORY_LIMIT = 30;

const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable or full.
  }
};

const same = (a, b) =>
  a.type === b.type &&
  String(a.name).toLowerCase() === String(b.name).toLowerCase();

export function getRecentActivity(limit = 5) {
  const history = readStorage(HISTORY_KEY, []);

  return Array.isArray(history) ? history.slice(0, limit) : [];
}

// Record that a medicine, class or group was opened.
export function recordVisit({ type, name }) {
  const item = { type, name };
  const history = readStorage(HISTORY_KEY, []);

  writeStorage(
    HISTORY_KEY,
    [
      { ...item, visitedAt: new Date().toISOString() },
      ...history.filter((entry) => !same(entry, item)),
    ].slice(0, HISTORY_LIMIT),
  );
}

export function getResumePoint() {
  const progress = readStorage(PROGRESS_KEY, null);

  if (!progress?.destination) return null;

  return {
    destination: progress.destination,
    title: progress.title || progress.name || "",
    section: progress.section || "",
  };
}

// The place to pick up from: where, and in which section.
export function saveResume({ destination, title, section }) {
  writeStorage(PROGRESS_KEY, { destination, title, section });
}
