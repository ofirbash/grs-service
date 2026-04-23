/**
 * Secure token storage using sessionStorage.
 *
 * sessionStorage is scoped to the current browser tab and cleared automatically
 * when the tab is closed, limiting the blast radius of a compromised token.
 * localStorage persisted across browser restarts and was accessible from every
 * tab, which is a much larger XSS target.
 *
 * This helper also reads a legacy token from localStorage once (during a
 * transitional window) so that already-signed-in users aren't kicked out by
 * this security upgrade. New writes always go to sessionStorage.
 */

const TOKEN_KEY = 'token';
const LEGACY_USER_KEY = 'user';

const isBrowser = (): boolean => typeof window !== 'undefined';

export const getToken = (): string | null => {
  if (!isBrowser()) return null;
  const fromSession = window.sessionStorage.getItem(TOKEN_KEY);
  if (fromSession) return fromSession;
  // One-time migration: read a legacy localStorage token and promote it
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
