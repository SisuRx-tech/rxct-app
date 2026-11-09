/* ========================================
   STUDY CONTEXT
   What the student is looking at right now.
   Jotter reads this so a note is attached
   to the medicine, class or group and the
   section being studied.

   { type, name, className, groupName,
     section }  or  null
======================================== */

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
