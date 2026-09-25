import type { z } from "zod";
import { env } from "@/lib/env";
import { ApiError, ContractError, NetworkError } from "./errors";
import { errorEnvelope, successEnvelope } from "./envelope";
import { clearTokens, getTokens, setTokens } from "./session";

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

/** Se llama cuando la sesión caduca y no se puede renovar (la app redirige al login). */
let onSessionExpired: () => void = () => {};
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export function buildUrl(path: string, query?: Query): string {
  const base = env.apiUrl.replace(/\/$/, "");
  const url = new URL(`${base}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  // Con base vacía (mocks o mismo origen) se devuelve la ruta relativa.
  return base ? url.toString() : `${url.pathname}${url.search}`;
}

async function send(path: string, opts: RequestOptions<unknown>, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "es",
    "X-Correlation-ID": crypto.randomUUID(),
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
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new NetworkError(cause);
  }
}

// Una sola renovación en vuelo aunque fallen varias peticiones a la vez.
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await send("/v1/auth/refresh", { method: "POST", body: { refreshToken: tokens.refreshToken } }, null);
      if (!res.ok) return false;
      const json = successEnvelope.parse(await res.json());
      const data = json.data as { tokens?: { accessToken: string; refreshToken: string; expiresIn: number } } & {
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: number;
      };
      const next = data.tokens ?? data;
      if (!next.accessToken || !next.refreshToken) return false;
      setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken, expiresIn: next.expiresIn ?? 3600 });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function parseError(res: Response, path: string): Promise<ApiError> {
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
    });
  }
  return new ApiError({ status: res.status, code: `HTTP_${res.status}`, message: res.statusText || "Error", path });
}

/**
 * Llama al backend y devuelve `data` ya validado.
 * Lanza ApiError (respuesta de error), NetworkError (sin conexión) o ContractError (forma inesperada).
 */
export async function api<T = unknown>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const useAuth = opts.auth ?? true;
  let res = await send(path, opts as RequestOptions<unknown>, useAuth ? (getTokens()?.accessToken ?? null) : null);

  if (res.status === 401 && useAuth && getTokens()) {
    if (await refresh()) {
      res = await send(path, opts as RequestOptions<unknown>, getTokens()?.accessToken ?? null);
    }
    if (res.status === 401) {
      clearTokens();
      onSessionExpired();
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
