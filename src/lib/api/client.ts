import { z } from "zod";
import { API_BASE } from "@/lib/env";
import { CLIENT_APP, CLIENT_APP_HEADER } from "@/lib/client-app";
import { ApiError, ContractError, NetworkError } from "./errors";
import { errorEnvelope, successEnvelope } from "./envelope";
import {
  clearSession,
  getAccessExpiresAt,
  getAccessToken,
  getSessionStatus,
  purgeLegacyStorage,
  setSession,
  type SessionEndReason,
} from "./session";

export type { SessionEndReason } from "./session";

type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions<T> = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Query;
  /** Objeto (se envía como JSON) o FormData (multipart, p. ej. /v1/uploads). */
  body?: unknown;
  /** Esquema zod de `data`. Sin esquema se devuelve `unknown`. */
  schema?: z.ZodType<T>;
  /** false en rutas públicas (login, trazabilidad pública). */
  auth?: boolean;
  signal?: AbortSignal;
};

/** Códigos con los que el backend da la sesión por terminada (contrato de la Ola 0 §5). */
export const SESSION_ENDED_CODES: readonly string[] = ["AUTH_REFRESH_REUSED", "AUTH_SESSION_REVOKED"];

/** Se llama una vez cuando la sesión termina sin poder renovarse (la app avisa y lleva al login). */
let onSessionEnded: (reason: SessionEndReason) => void = () => {};
export function setSessionEndedHandler(fn: (reason: SessionEndReason) => void) {
  onSessionEnded = fn;
}

/** Margen para renovar antes de que caduque el acceso. */
const RENEW_BEFORE_MS = 30_000;

/** `path` es la ruta del backend (`/v1/...`); se llama siempre al propio origen (`/api/v1/...`). */
export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

async function send(path: string, opts: RequestOptions<unknown>, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "es",
    "X-Correlation-ID": crypto.randomUUID(),
    // App de origen para la bitácora (contrato de la Ola 1 §7), en todas las peticiones.
    [CLIENT_APP_HEADER]: CLIENT_APP,
  };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
      // La cookie `doc_rt` viaja siempre (mismo origen gracias a la reescritura P-1).
      credentials: "include",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new NetworkError(cause);
  }
}

/** `Retry-After` en segundos (también admite una fecha HTTP). */
function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000));
}

async function parseError(res: Response, path: string): Promise<ApiError> {
  const retryAfter = retryAfterSeconds(res);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Cuerpo vacío o no JSON.
  }
  const parsed = errorEnvelope.safeParse(json);
  if (parsed.success) {
    const { error, statusCode, path: p } = parsed.data;
    return new ApiError({
      status: statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      path: p,
      retryAfter,
    });
  }
  return new ApiError({
    status: res.status,
    code: `HTTP_${res.status}`,
    message: res.statusText || "Error",
    path,
    retryAfter,
  });
}

// ---------------------------------------------------------------------------
// Renovación
// ---------------------------------------------------------------------------

// `refresh` responde como el login; aquí solo interesa el acceso. El refresco rotado llega en la
// cookie `doc_rt` (un `refreshToken` en el cuerpo, retirado en H1, se ignora).
const refreshDataSchema = z.object({
  tokens: z.object({ accessToken: z.string().min(1), expiresIn: z.number().positive() }),
});

export type RefreshOutcome = { ok: true } | { ok: false; reason: SessionEndReason | "network"; error?: unknown };

let refreshing: Promise<RefreshOutcome> | null = null;

async function doRefresh(): Promise<RefreshOutcome> {
  let res: Response;
  try {
    // Solo la cookie `doc_rt`: el cuerpo va vacío.
    res = await send("/v1/auth/refresh", { method: "POST", body: {} }, null);
  } catch (error) {
    return { ok: false, reason: "network", error };
  }
  if (!res.ok) {
    const error = await parseError(res, "/v1/auth/refresh");
    return { ok: false, reason: SESSION_ENDED_CODES.includes(error.code) ? "revoked" : "expired", error };
  }
  try {
    const envelope = successEnvelope.parse(await res.json());
    const { tokens } = refreshDataSchema.parse(envelope.data);
    setSession({ accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "expired", error };
  }
}

/**
 * Rota la sesión con `POST /v1/auth/refresh`. Una sola renovación en vuelo: las peticiones que
 * fallan a la vez esperan la misma promesa. No cierra la sesión: lo decide quien llama.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

let booting: Promise<void> | null = null;

/**
 * Arranque: sin acceso en memoria, intenta renovar con la cookie para recuperar la sesión tras
 * una recarga. Sin cookie válida la sesión queda anónima sin aviso; si la sesión de la cookie fue
 * revocada (bloqueo, reutilización del refresco), queda anónima con el motivo para que el login
 * avise "Tu sesión se cerró por seguridad". No redirige: una página pública sigue donde está.
 * Idempotente.
 */
export function bootstrapSession(): Promise<void> {
  if (getSessionStatus() !== "unknown") return Promise.resolve();
  booting ??= (async () => {
    purgeLegacyStorage();
    const outcome = await refreshSession();
    // Si mientras tanto alguien inició sesión, no se toca.
    if (!outcome.ok && getSessionStatus() === "unknown") {
      clearSession(outcome.reason === "revoked" ? "revoked" : null);
    }
  })().finally(() => {
    booting = null;
  });
  return booting;
}

/** Cierra la sesión local y avisa a la app una sola vez aunque fallen varias peticiones. */
function endSession(reason: SessionEndReason) {
  if (getSessionStatus() === "anonymous") return;
  clearSession(reason);
  onSessionEnded(reason);
}

/** Renueva antes de tiempo si el acceso está a punto de caducar. */
async function ensureFreshAccess() {
  if (getSessionStatus() === "unknown") await bootstrapSession();
  const token = getAccessToken();
  if (token && getAccessExpiresAt() - Date.now() < RENEW_BEFORE_MS) {
    const outcome = await refreshSession();
    if (!outcome.ok && outcome.reason !== "network") endSession(outcome.reason);
  }
}

/**
 * `POST /v1/auth/logout`: pide al backend que revoque la sesión y borre la cookie, y después
 * cierra la sesión local. Se espera a la respuesta para que una recarga inmediata no recupere
 * la sesión; un fallo de red no impide salir.
 */
export async function logoutSession(): Promise<void> {
  const token = getAccessToken();
  try {
    const res = await send("/v1/auth/logout", { method: "POST" }, token);
    if (!res.ok && res.status !== 401) console.warn(`[api] logout respondió ${res.status}`);
  } catch {
    // Sin red: la cookie caducará sola; la sesión local se cierra igual.
  } finally {
    clearSession();
  }
}

// ---------------------------------------------------------------------------
// Petición
// ---------------------------------------------------------------------------

/**
 * Llama al backend y devuelve `data` ya validado.
 * Lanza ApiError (respuesta de error), NetworkError (sin conexión) o ContractError (forma inesperada).
 */
export async function api<T = unknown>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const useAuth = opts.auth ?? true;
  if (useAuth) await ensureFreshAccess();

  const sentToken = useAuth ? getAccessToken() : null;
  let res = await send(path, opts as RequestOptions<unknown>, sentToken);

  if (res.status === 401 && useAuth && sentToken) {
    const error = await parseError(res.clone(), path);
    if (SESSION_ENDED_CODES.includes(error.code)) {
      // Sesión revocada (bloqueo, reutilización): no se intenta renovar.
      endSession("revoked");
      throw error;
    }
    // Otra petición ya cerró la sesión mientras esta viajaba.
    if (getSessionStatus() === "anonymous") throw error;
    // Otra petición ya renovó mientras esta viajaba: se reintenta sin rotar de nuevo.
    const current = getAccessToken();
    if (current === null || current === sentToken) {
      const outcome = await refreshSession();
      if (!outcome.ok) {
        if (outcome.reason === "network") throw new NetworkError(outcome.error);
        endSession(outcome.reason);
        throw outcome.error instanceof ApiError ? outcome.error : error;
      }
    }
    res = await send(path, opts as RequestOptions<unknown>, getAccessToken());
    if (res.status === 401) {
      const again = await parseError(res.clone(), path);
      endSession(SESSION_ENDED_CODES.includes(again.code) ? "revoked" : "expired");
    }
  }

  if (!res.ok) throw await parseError(res, path);
  if (res.status === 204) return undefined as T;

  const envelope = successEnvelope.safeParse(await res.json());
  if (!envelope.success) throw new ContractError(path, envelope.error.issues);
  if (!opts.schema) return envelope.data.data as T;

  const data = opts.schema.safeParse(envelope.data.data);
  if (!data.success) {
    if (process.env.NODE_ENV !== "production") console.error(`[api] ${path}`, data.error.issues);
    throw new ContractError(path, data.error.issues);
  }
  return data.data;
}
