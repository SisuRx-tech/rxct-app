/**
 * Account-scoped personal course selection.
 *
 * Master catalogue records are immutable and never edited by this service.
 * Only selected course IDs are stored per authenticated account.
 * This is local-device storage; it does not sync across devices.
 */

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "rxct:course-selection";

function storageKey(userId) {
  if (!userId || typeof userId !== "string") {
    throw new Error("A signed-in account ID is required for course selection.");
  }
  return `${STORAGE_PREFIX}:v${STORAGE_VERSION}:${userId}`;
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
}

export function readCourseSelection(userId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeIds(parsed?.selectedCourseIds);
  } catch (error) {
    console.error("Could not read saved course selection:", error);
    return [];
  }
}

export function writeCourseSelection(userId, selectedCourseIds) {
  if (typeof window === "undefined") {
    throw new Error("Course selection storage is unavailable.");
  }

  const payload = {
    version: STORAGE_VERSION,
    selectedCourseIds: normalizeIds(selectedCourseIds),
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(payload));
    return { error: null };
  } catch (error) {
    return { error };
  }
}

export function getSelectedCourses(catalogue, userId) {
  const selectedIds = new Set(readCourseSelection(userId));
  return catalogue.filter((course) => selectedIds.has(course.id));
}

export function reconcileCourseSelection(catalogue, selectedCourseIds) {
  const validIds = new Set(catalogue.map((course) => course.id));
  return normalizeIds(selectedCourseIds).filter((id) => validIds.has(id));
}
