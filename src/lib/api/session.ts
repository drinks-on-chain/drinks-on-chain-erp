// Sesión del cliente (contrato de la Ola 0 §5 y §7).
//
// - El token de acceso (15 min) vive SOLO en memoria. Nada de la sesión se guarda en
//   sessionStorage ni localStorage.
// - La renovación viaja en la cookie HttpOnly `doc_rt` de primera parte (P-1). Para sobrevivir
//   a una recarga, la app llama a `POST /api/v1/auth/refresh` al arrancar (bootstrapSession).
//   Un `refreshToken` en el cuerpo de la respuesta (retirado en H1) se ignora.

export type SessionStatus = "unknown" | "authenticated" | "anonymous";

/** `expired`: la renovación caducó o no existe. `revoked`: reutilización, bloqueo o revocación. */
export type SessionEndReason = "expired" | "revoked";

export type SessionTokens = {
  accessToken: string;
  /** Segundos de vida del acceso (900 en el contrato). */
  expiresIn: number;
};

type State = {
  status: SessionStatus;
  accessToken: string | null;
  expiresAt: number;
  /** Por qué terminó la última sesión (el login lo avisa); `null` si se cerró a propósito. */
  endReason: SessionEndReason | null;
};

const initial: State = { status: "unknown", accessToken: null, expiresAt: 0, endReason: null };
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

/** Motivo del último cierre involuntario de la sesión; `null` con sesión o tras cerrarla a propósito. */
export function getSessionEndReason(): SessionEndReason | null {
  return state.endReason;
}

/** Guarda solo el acceso: la renovación la gestiona el navegador con la cookie `doc_rt`. */
export function setSession(tokens: SessionTokens) {
  state = {
    status: "authenticated",
    accessToken: tokens.accessToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
    endReason: null,
  };
  emit();
}

/**
 * Sin sesión (tras cerrar sesión, fallar la renovación o no tener cookie al arrancar). Con
 * `reason`, el login avisa de por qué terminó (p. ej. "Tu sesión se cerró por seguridad").
 */
export function clearSession(reason: SessionEndReason | null = null) {
  state = { ...initial, status: "anonymous", endReason: reason };
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
