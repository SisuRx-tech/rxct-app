/*
 * STUDY CONTEXT
 * Tracks what the student is currently studying.
 * Automatically resets when the authenticated account changes.
 */

let current = null;
const listeners = new Set();

export const getStudyContext = () => current;

export function setStudyContext(next) {
  current = next;
  listeners.forEach((listener) => listener(current));
}

export function subscribeStudyContext(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("rxct-account-change", () => {
    setStudyContext(null);
  });
}
