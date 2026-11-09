/* ========================================
   MEDICINE NOTES
   Notes written in Jotter. They are grouped
   by what the student was studying, so each
   medicine, class or group has one note
   collection that entries are added to,
   never a pile of duplicate records.

   {
     "medicine:amoxicillin": {
       type, name, className, groupName,
       entries: [{ id, text, section, createdAt }]
     }
   }

   Stored on the device. Resources reads it
   from here.
======================================== */

const NOTES_KEY = "rxct-medicine-notes-v1";
const DRAFT_KEY = "rxct-jotter-draft";

const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));

    return true;
  } catch {
    return false;
  }
};

const entityKey = (context) =>
  context ? `${context.type}:${context.name.toLowerCase()}` : "general";

export function addNote(context, text) {
  const all = read(NOTES_KEY, {});
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

  return write(NOTES_KEY, all);
}

export const getAllNotes = () => read(NOTES_KEY, {});

// An unfinished note survives closing Jotter or reloading the page.
export const getDraft = () => read(DRAFT_KEY, "");

export function saveDraft(text) {
  write(DRAFT_KEY, text);
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
