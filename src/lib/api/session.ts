// Sesión del cliente (contrato de la Ola 0 §5 y §7).
//
// - El token de acceso (15 min) vive SOLO en memoria. Nada de la sesión se guarda en
//   sessionStorage ni localStorage.
// - La renovación viaja en la cookie HttpOnly `doc_rt` de primera parte (P-1). Para sobrevivir
//   a una recarga, la app llama a `POST /api/v1/auth/refresh` al arrancar (bootstrapSession).
// - Tolerancia transitoria (*retirada* en H1): si el backend aún devuelve `tokens.refreshToken`
//   en el cuerpo, se guarda en memoria y se reenvía en el cuerpo de `refresh`. Así un backend
//   anterior a O0-BE-4 (sin cookie) sigue funcionando mientras la pestaña no se recargue.

export type SessionStatus = "unknown" | "authenticated" | "anonymous";

export type SessionTokens = {
  accessToken: string;
  /** Segundos de vida del acceso (900 en el contrato). */
  expiresIn: number;
  /** Solo por compatibilidad hasta H1. */
  refreshToken?: string | null;
};

type State = {
  status: SessionStatus;
  accessToken: string | null;
  expiresAt: number;
  legacyRefreshToken: string | null;
};

const initial: State = { status: "unknown", accessToken: null, expiresAt: 0, legacyRefreshToken: null };
let state: State = initial;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getSessionStatus(): SessionStatus {
  return state.status;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

/** Epoch en ms en que caduca el acceso (0 sin sesión). */
export function getAccessExpiresAt(): number {
  return state.expiresAt;
}

/** Refresco recibido en el cuerpo (backend anterior al contrato). *Retirada* en H1. */
export function getLegacyRefreshToken(): string | null {
  return state.legacyRefreshToken;
}

export function setSession(tokens: SessionTokens) {
  state = {
    status: "authenticated",
    accessToken: tokens.accessToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
    legacyRefreshToken: tokens.refreshToken ?? null,
  };
  emit();
}

/** Sin sesión (tras cerrar sesión, fallar la renovación o no tener cookie al arrancar). */
export function clearSession() {
  state = { ...initial, status: "anonymous" };
  emit();
}

/** Solo para pruebas: vuelve al estado de arranque. */
export function resetSessionForTests() {
  state = initial;
  emit();
}

/** Para `useSyncExternalStore`. */
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** La plantilla 0.1 guardaba acceso y refresco en sessionStorage: se borra al arrancar. */
export function purgeLegacyStorage() {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem("doc.session");
  } catch {
    // Almacenamiento no disponible (modo privado estricto): no hay nada que borrar.
  }
}
