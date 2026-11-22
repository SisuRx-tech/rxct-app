/*
 * ACCOUNT-SCOPED LOCAL STORAGE
 * Private offline data is isolated by Supabase user ID.
 * Data is retained when a user signs out.
 * Unscoped legacy data is deliberately not migrated.
 */

let activeAccountId = null;

export function setActiveAccount(userId) {
  const nextId = userId ? String(userId) : null;
  if (nextId === activeAccountId) return;

  activeAccountId = nextId;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("rxct-account-change"));
  }
}

export function getActiveAccountId() {
  return activeAccountId;
}

export function getAccountStorageKey(key, userId = activeAccountId) {
  if (!userId) return null;
  return `rxct:user:${encodeURIComponent(String(userId))}:${key}`;
}

export function readAccountStorage(key, fallback = null, userId = activeAccountId) {
  const storageKey = getAccountStorageKey(key, userId);
  if (!storageKey) return fallback;

  try {
    const value = localStorage.getItem(storageKey);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeAccountStorage(key, value, expectedUserId = activeAccountId) {
  if (!expectedUserId || activeAccountId !== String(expectedUserId)) {
    return false;
  }

  const storageKey = getAccountStorageKey(key, expectedUserId);
  if (!storageKey) return false;

  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeAccountStorage(key, expectedUserId = activeAccountId) {
  if (!expectedUserId || activeAccountId !== String(expectedUserId)) {
    return false;
  }

  const storageKey = getAccountStorageKey(key, expectedUserId);
  if (!storageKey) return false;

  try {
    localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
