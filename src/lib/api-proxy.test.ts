// @vitest-environment node
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  CLIENT_IP_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  canonicalPathWithQuery,
  clientIpFrom,
  proxyApiRequest,
  proxySecret,
  upstreamUrl,
} from "./api-proxy";

// Valores solo de prueba
const SECRET = "test-proxy-secret-0123456789abcdef-aaaa";
const ORIGIN = "https://api.ejemplo.bo";
const NOW = 1_790_000_000_000;
const env = { API_ORIGIN: ORIGIN, PROXY_SHARED_SECRET: SECRET };

function req(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new NextRequest(`https://erp.ejemplo.bo${path}`, init);
}

/** Cabecera que la reescritura manda al backend (`x-middleware-request-*`). */
function upstreamHeader(res: Response, name: string): string | null {
  const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
  if (!overridden.includes(name)) return null;
  return res.headers.get(`x-middleware-request-${name}`);
}

function expectedSignature(method: string, path: string, ip: string, ts: string, secret = SECRET) {
  return createHmac("sha256", secret).update(`${method}|${path}|${ip}|${ts}`).digest("hex");
}

describe("proxy de la API con la IP del cliente firmada (O1-OPS-1)", () => {
  it("reescribe /api/v1/* a ${API_ORIGIN}/v1/* con la misma ruta y query", () => {
    const res = proxyApiRequest(req("/api/v1/lots/L%2001?limit=20&q=a%20b"), { env, now: NOW });
    expect(res.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/v1/lots/L%2001?limit=20&q=a%20b`);
    expect(upstreamUrl(new URL("https://x.bo/api/v1/auth/login"), ORIGIN).href).toBe(`${ORIGIN}/v1/auth/login`);
  });

  it("reenvía Cookie, Authorization, Content-Type, Idempotency-Key, X-Correlation-ID y X-Client-App", () => {
    const headers = {
      cookie: "doc_rt=abc; otra=1",
      authorization: "Bearer token-de-prueba",
      "content-type": "application/json",
      "idempotency-key": "idem-1",
      "x-correlation-id": "corr-1",
      "x-client-app": "ERP",
    };
    const res = proxyApiRequest(req("/api/v1/auth/refresh", { method: "POST", headers, body: "{}" }), {
      env,
      now: NOW,
    });
    for (const [name, value] of Object.entries(headers)) {
      expect(upstreamHeader(res, name)).toBe(value);
    }
    // No se toca la respuesta: Set-Cookie, Retry-After y Content-Disposition llegan del backend
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("firma MÉTODO|RUTA_CON_QUERY|IP|TIMESTAMP con la IP de la plataforma", () => {
    const res = proxyApiRequest(
      req("/api/v1/auth/login?next=%2Fpanel", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      }),
      { env, now: NOW },
    );
    const ts = String(NOW / 1000);
    expect(upstreamHeader(res, CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(upstreamHeader(res, TIMESTAMP_HEADER)).toBe(ts);
    expect(upstreamHeader(res, SIGNATURE_HEADER)).toBe(
      expectedSignature("POST", "/v1/auth/login?next=%2Fpanel", "203.0.113.7", ts),
    );
  });

  it("firma la query en forma canónica (Next la recodifica al reenviarla: %20 → +)", () => {
    expect(canonicalPathWithQuery("/v1/x")).toBe("/v1/x");
    expect(canonicalPathWithQuery("/v1/x%20y?q=a%20b&l=1")).toBe("/v1/x%20y?q=a+b&l=1");
    const res = proxyApiRequest(req("/api/v1/lots?q=a%20b"), { env, now: NOW });
    const ts = String(NOW / 1000);
    expect(upstreamHeader(res, SIGNATURE_HEADER)).toBe(expectedSignature("GET", "/v1/lots?q=a+b", "127.0.0.1", ts));
  });

  it("descarta las cabeceras X-DOC-* que manda el cliente", () => {
    const forged = { [CLIENT_IP_HEADER]: "1.2.3.4", [TIMESTAMP_HEADER]: "1", [SIGNATURE_HEADER]: "f".repeat(64) };
    const signed = proxyApiRequest(req("/api/v1/users/me", { headers: forged }), { env, now: NOW });
    expect(upstreamHeader(signed, CLIENT_IP_HEADER)).toBe("127.0.0.1");
    const unsigned = proxyApiRequest(req("/api/v1/users/me", { headers: forged }), {
      env: { API_ORIGIN: ORIGIN },
      now: NOW,
    });
    expect(unsigned.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/v1/users/me`);
    for (const name of [CLIENT_IP_HEADER, TIMESTAMP_HEADER, SIGNATURE_HEADER]) {
      expect(upstreamHeader(unsigned, name)).toBeNull();
    }
  });

  it("firma con el primer secreto si hay varios (formato de rotación del backend)", () => {
    expect(proxySecret(` ${SECRET} , otro`)).toBe(SECRET);
    expect(proxySecret("")).toBeNull();
    expect(proxySecret(undefined)).toBeNull();
  });

  it("IP del cliente: x-real-ip, luego x-forwarded-for, si no 127.0.0.1", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIpFrom(new Headers({ "x-real-ip": "no-es-ip" }))).toBe("127.0.0.1");
    expect(clientIpFrom(new Headers())).toBe("127.0.0.1");
  });

  it("con mocks y sin API_ORIGIN no reescribe (MSW responde en el navegador)", () => {
    const res = proxyApiRequest(req("/api/v1/users/me"), { env: { NEXT_PUBLIC_MOCKS: "1" }, now: NOW });
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sin API_ORIGIN ni mocks responde 503 con el envoltorio de error", async () => {
    const res = proxyApiRequest(req("/api/v1/users/me"), { env: {}, now: NOW });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("no toca rutas fuera de /api/v1", () => {
    const res = proxyApiRequest(req("/api/v10/x"), { env, now: NOW });
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
