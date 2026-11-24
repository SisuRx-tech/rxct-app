import {
  readAccountStorage,
  writeAccountStorage,
  getActiveAccountId,
} from "./accountStorage";

const HISTORY_KEY = "medicine-history";
const PROGRESS_KEY = "study-progress";
const HISTORY_LIMIT = 30;

const same = (a, b) =>
  a.type === b.type &&
  String(a.name).toLowerCase() === String(b.name).toLowerCase();

export function getRecentActivity(limit = 5) {
  const history = readAccountStorage(HISTORY_KEY, []);

  return Array.isArray(history) ? history.slice(0, limit) : [];
}

export function recordVisit({ type, name }) {
  const userId = getActiveAccountId();
  if (!userId || !type || !name) return;

  const history = readAccountStorage(HISTORY_KEY, [], userId);

  const nextHistory = [
    {
      type,
      name,
      visitedAt: new Date().toISOString(),
    },
    ...history.filter((entry) => !same(entry, { type, name })),
  ].slice(0, HISTORY_LIMIT);

  writeAccountStorage(HISTORY_KEY, nextHistory, userId);
}

export function getResumePoint() {
  const progress = readAccountStorage(PROGRESS_KEY, null);

  if (!progress?.destination) return null;

  return {
    destination: progress.destination,
    title: progress.title || progress.name || "",
    section: progress.section || "",
  };
}

export function saveResume({ destination, title, section }) {
  const userId = getActiveAccountId();
  if (!userId || !destination) return;

  writeAccountStorage(
    PROGRESS_KEY,
    { destination, title, section },
    userId,
  );
}
