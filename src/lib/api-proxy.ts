import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { API_BASE, resolveApiOrigin } from "./env";

/**
 * Proxy de la API con la IP real del cliente (O1-OPS-1, contrato O1 §11 bis). Solo servidor:
 * lo usa `src/proxy.ts`.
 *
 * El navegador llama a `/api/v1/*` del propio origen (P-1) y esto lo reescribe a
 * `${API_ORIGIN}/v1/*` (reescritura externa: método, cuerpo en streaming, cookies y la respuesta
 * —estado, `Set-Cookie` múltiples, `Retry-After`, `Content-Disposition`— pasan tal cual, sin
 * límite de tamaño de una función). En Vercel la conexión al backend sale de Vercel, así que se
 * añaden cabeceras firmadas con la IP del cliente:
 *
 * - `X-DOC-Client-IP`: la IP que da la plataforma (`x-real-ip` / `x-forwarded-for`);
 * - `X-DOC-Proxy-Timestamp`: segundos Unix;
 * - `X-DOC-Proxy-Signature`: HMAC-SHA256 hexadecimal, con `PROXY_SHARED_SECRET`, de
 *   `MÉTODO|RUTA_CON_QUERY|IP|TIMESTAMP` (la ruta tal como llega al backend, `/v1/…?…`, con la
 *   query en forma canónica: ver `canonicalPathWithQuery`).
 *
 * El backend solo cree la IP si la firma vale (±60 s); sin secreto aquí no se firma y el
 * backend usa la IP de la conexión, como antes. Las cabeceras `X-DOC-*` que mande el cliente
 * se descartan siempre.
 */

export const CLIENT_IP_HEADER = "x-doc-client-ip";
export const TIMESTAMP_HEADER = "x-doc-proxy-timestamp";
export const SIGNATURE_HEADER = "x-doc-proxy-signature";
const PROXY_HEADERS = [CLIENT_IP_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER] as const;

/** Prefijo que el navegador usa (`/api/v1`) y el que recibe el backend (`/v1`). */
const PUBLIC_PREFIX = `${API_BASE}/v1`;

/**
 * Secreto con el que firma la app (`PROXY_SHARED_SECRET`, variable de servidor, nunca
 * `NEXT_PUBLIC_`). Si trae varios separados por comas (el formato del backend para rotar), la
 * app firma con el primero. Vacío = sin firma.
 */
export function proxySecret(raw: string | undefined): string | null {
  const first = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  return first ?? null;
}

/**
 * IP del cliente según la plataforma. En Vercel, `x-real-ip` y `x-forwarded-for` los pone la
 * propia plataforma (sustituye los que manda el cliente). En local (`next dev`/`next start`)
 * Next rellena `x-forwarded-for` con la IP del socket; sin nada, `127.0.0.1`. Fuera de Vercel
 * hace falta un proxy delante que reescriba `x-forwarded-for`.
 */
export function clientIpFrom(headers: Headers): string {
  const candidates = [headers.get("x-real-ip"), headers.get("x-forwarded-for")?.split(",")[0]];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip && isIP(ip) !== 0) return ip;
  }
  return "127.0.0.1";
}

/**
 * Ruta con la query en forma canónica (igual que el backend): la ruta tal cual y la query
 * reserializada con `URLSearchParams` (mismo orden; espacio → `+`). Next y Vercel pueden volver
 * a codificar la query al reenviarla (`%20` ↔ `+`); así la firma no depende de ello.
 */
export function canonicalPathWithQuery(pathWithQuery: string): string {
  const index = pathWithQuery.indexOf("?");
  if (index === -1) return pathWithQuery;
  const query = new URLSearchParams(pathWithQuery.slice(index + 1)).toString();
  const path = pathWithQuery.slice(0, index);
  return query === "" ? path : `${path}?${query}`;
}

/** HMAC-SHA256 hexadecimal de `MÉTODO|RUTA_CON_QUERY|IP|TIMESTAMP` (ruta canónica). */
export function signProxyRequest(
  secret: string,
  method: string,
  pathWithQuery: string,
  ip: string,
  timestamp: string,
): string {
  return createHmac("sha256", secret)
    .update(`${method.toUpperCase()}|${canonicalPathWithQuery(pathWithQuery)}|${ip}|${timestamp}`)
    .digest("hex");
}

/** `/api/v1/x?y` → `${origin}/v1/x?y`, conservando la ruta y la query tal como llegaron. */
export function upstreamUrl(url: URL, origin: string): URL {
  const path = url.pathname.slice(API_BASE.length); // "/v1/…"
  return new URL(`${origin}${path}${url.search}`);
}

type ProxyEnv = { API_ORIGIN?: string; NEXT_PUBLIC_MOCKS?: string; PROXY_SHARED_SECRET?: string };

export type ProxyOptions = {
  env?: ProxyEnv;
  /** Milisegundos Unix (inyectable en las pruebas). */
  now?: number;
};

/** Reescribe una petición a `/api/v1/*` al backend con las cabeceras firmadas. */
export function proxyApiRequest(request: NextRequest, options: ProxyOptions = {}): NextResponse {
  const env = options.env ?? {
    API_ORIGIN: process.env.API_ORIGIN,
    NEXT_PUBLIC_MOCKS: process.env.NEXT_PUBLIC_MOCKS,
    PROXY_SHARED_SECRET: process.env.PROXY_SHARED_SECRET,
  };
  const { pathname } = request.nextUrl;
  if (pathname !== PUBLIC_PREFIX && !pathname.startsWith(`${PUBLIC_PREFIX}/`)) {
    return NextResponse.next();
  }

  let origin: string | null;
  try {
    origin = resolveApiOrigin(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        success: false,
        statusCode: 503,
        error: { code: "SERVICE_UNAVAILABLE", message: "La API no está configurada en este despliegue." },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  // Con mocks y sin backend, MSW responde en el navegador: aquí no hay nada que reenviar.
  if (!origin) return NextResponse.next();

  const target = upstreamUrl(request.nextUrl, origin);
  const headers = new Headers(request.headers);
  for (const name of PROXY_HEADERS) headers.delete(name);

  const secret = proxySecret(env.PROXY_SHARED_SECRET);
  if (secret) {
    const ip = clientIpFrom(request.headers);
    const timestamp = String(Math.floor((options.now ?? Date.now()) / 1000));
    headers.set(CLIENT_IP_HEADER, ip);
    headers.set(TIMESTAMP_HEADER, timestamp);
    headers.set(
      SIGNATURE_HEADER,
      signProxyRequest(secret, request.method, `${target.pathname}${target.search}`, ip, timestamp),
    );
  }

  return NextResponse.rewrite(target, { request: { headers } });
}
