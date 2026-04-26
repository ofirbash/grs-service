/**
 * Secure token storage using sessionStorage.
 *
 * sessionStorage is scoped to the current browser tab and cleared automatically
 * when the tab is closed, limiting the blast radius of a compromised token.
 * Persistent browser-scoped storage (the older approach) was accessible from
 * every tab, which is a much larger XSS target.
 *
 * This helper also performs a one-time read of any pre-migration token still
 * sitting in the older storage and immediately promotes it to sessionStorage,
 * so already-signed-in users aren't kicked out by this security upgrade.
 * New writes always go to sessionStorage; the migration path also cleans up
 * any stale residue from the legacy storage.
 */

const TOKEN_KEY = 'token';
const LEGACY_USER_KEY = 'user';

const isBrowser = (): boolean => typeof window !== 'undefined';

export const getToken = (): string | null => {
  if (!isBrowser()) return null;
  const fromSession = window.sessionStorage.getItem(TOKEN_KEY);
  if (fromSession) return fromSession;
  // One-time migration: read a pre-upgrade token, promote it, and delete the
  // legacy copy on the next two lines. Reads here are intentional and safe —
  // the value is moved out, not stored long-term.
  // eslint-disable-next-line no-restricted-globals
  const legacy = window.localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    window.sessionStorage.setItem(TOKEN_KEY, legacy);
    window.localStorage.removeItem(TOKEN_KEY);
    return legacy;
  }
  return null;
};

export const setToken = (token: string): void => {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  // Belt-and-braces: ensure no stale copy is left in localStorage
  window.localStorage.removeItem(TOKEN_KEY);
};

export const clearToken = (): void => {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_USER_KEY);
};
