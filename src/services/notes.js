import {
  readAccountStorage,
  writeAccountStorage,
  getActiveAccountId,
} from "./accountStorage";

const NOTES_KEY = "medicine-notes-v1";
const DRAFT_KEY = "jotter-draft";

const entityKey = (context) =>
  context ? `${context.type}:${context.name.toLowerCase()}` : "general";

export function addNote(context, text) {
  const userId = getActiveAccountId();
  if (!userId || !text?.trim()) return false;

  const all = readAccountStorage(NOTES_KEY, {});
  const key = entityKey(context);

  const collection = all[key] || {
    type: context?.type || "general",
    name: context?.name || "General",
    className: context?.className || null,
    groupName: context?.groupName || null,
    entries: [],
  };

  collection.entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    section: context?.sectionLabel || null,
    createdAt: new Date().toISOString(),
  });

  all[key] = collection;

  return writeAccountStorage(NOTES_KEY, all, userId);
}

export const getAllNotes = () =>
  readAccountStorage(NOTES_KEY, {});

export const getDraft = () =>
  readAccountStorage(DRAFT_KEY, "");

export function saveDraft(text) {
  const userId = getActiveAccountId();
  if (!userId) return;

  writeAccountStorage(DRAFT_KEY, text, userId);
}

export function clearDraft() {
  const userId = getActiveAccountId();
  if (!userId) return;

  try {
    const storageKey = `rxct:user:${encodeURIComponent(userId)}:${DRAFT_KEY}`;
    localStorage.removeItem(storageKey);
  } catch {
    // Storage may be unavailable.
  }
}
