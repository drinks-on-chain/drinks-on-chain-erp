import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "./client";
import { ApiError, ContractError, NetworkError } from "./errors";
import { toPage } from "./envelope";
import { clearTokens, getTokens, setTokens } from "./session";

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, statusCode: status, timestamp: "", path: "/x", data }), { status });
const fail = (status: number, code: string, message: string) =>
  new Response(
    JSON.stringify({ success: false, statusCode: status, timestamp: "", path: "/x", error: { code, message } }),
    { status },
  );

describe("api", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    clearTokens();
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("desempaqueta data y valida con el esquema", async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: "1", name: "Tannat" }));
    const data = await api("/v1/x", { schema: z.object({ id: z.string(), name: z.string() }) });
    expect(data).toEqual({ id: "1", name: "Tannat" });
  });

  it("envía el Bearer y la query", async () => {
    setTokens({ accessToken: "a1", refreshToken: "r1", expiresIn: 60 });
    fetchMock.mockResolvedValueOnce(ok([]));
    await api("/v1/terroirs", { query: { limit: 10, offset: 0, varietyName: undefined } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/v1/terroirs?limit=10&offset=0");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer a1");
  });

  it("convierte el envoltorio de error en ApiError", async () => {
    fetchMock.mockResolvedValueOnce(fail(422, "LOCK_NOT_MET", "El candado de crianza sigue activo."));
    const err = await api("/v1/bottling", { method: "POST", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "LOCK_NOT_MET", isValidation: true });
  });

  it("renueva el token una vez ante un 401 y reintenta", async () => {
    setTokens({ accessToken: "viejo", refreshToken: "r1", expiresIn: 60 });
    fetchMock
      .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Token caducado"))
      .mockResolvedValueOnce(ok({ accessToken: "nuevo", refreshToken: "r2", tokenType: "Bearer", expiresIn: 60 }))
      .mockResolvedValueOnce(ok({ ok: true }));
    await expect(api("/v1/users/me")).resolves.toEqual({ ok: true });
    expect(getTokens()?.accessToken).toBe("nuevo");
    const retried = fetchMock.mock.calls[2]![1]!.headers as Record<string, string>;
    expect(retried.Authorization).toBe("Bearer nuevo");
  });

  it("cierra la sesión si la renovación falla", async () => {
    setTokens({ accessToken: "viejo", refreshToken: "r1", expiresIn: 60 });
    fetchMock
      .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Token caducado"))
      .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Refresh inválido"));
    await expect(api("/v1/users/me")).rejects.toBeInstanceOf(ApiError);
    expect(getTokens()).toBeNull();
  });

  it("distingue fallo de red y contrato roto", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("/v1/x")).rejects.toBeInstanceOf(NetworkError);
    fetchMock.mockResolvedValueOnce(ok({ id: 1 }));
    await expect(api("/v1/x", { schema: z.object({ id: z.string() }) })).rejects.toBeInstanceOf(ContractError);
  });
});

describe("toPage", () => {
  const item = z.object({ id: z.string() });
  it("acepta un array", () => {
    expect(toPage([{ id: "a" }], item, { limit: 20, offset: 0 })).toEqual({
      items: [{ id: "a" }],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });
  it("acepta { items, total, limit, offset }", () => {
    expect(toPage({ items: [{ id: "a" }], total: 9, limit: 1, offset: 3 }, item)).toEqual({
      items: [{ id: "a" }],
      total: 9,
      limit: 1,
      offset: 3,
    });
  });
});
