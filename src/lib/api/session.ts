// Sesión del cliente. El access token vive en memoria y en sessionStorage (se pierde al
// cerrar la pestaña). Cuando el backend confirme el refreshToken en cookie HttpOnly
// (10 §2.4), el refresh deja de guardarse aquí.

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

const KEY = "doc.session";
let current: Tokens | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getTokens(): Tokens | null {
  if (current) return current;
  const raw = storage()?.getItem(KEY);
  if (!raw) return null;
  try {
    current = JSON.parse(raw) as Tokens;
    return current;
  } catch {
    return null;
  }
}

export function setTokens(tokens: { accessToken: string; refreshToken: string; expiresIn: number }) {
  current = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
  storage()?.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

export function clearTokens() {
  current = null;
  storage()?.removeItem(KEY);
  listeners.forEach((l) => l());
}

/** Para `useSyncExternalStore`. */
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
