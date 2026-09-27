import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, bootstrapSession, logoutSession, setSessionEndedHandler } from "./client";
import { ApiError, ContractError, NetworkError } from "./errors";
import { toPage } from "./envelope";
import { fetchAllPages } from "./pagination";
import {
  clearSession,
  getAccessToken,
  getLegacyRefreshToken,
  getSessionStatus,
  resetSessionForTests,
  setSession,
} from "./session";

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, statusCode: status, timestamp: "", path: "/x", data }), { status });
const fail = (status: number, code: string, message = code, details: unknown = null) =>
  new Response(
    JSON.stringify({
      success: false,
      statusCode: status,
      timestamp: "",
      path: "/x",
      error: { code, message, details },
    }),
    { status },
  );
/** Respuesta de login/refresh/switch del contrato (§5). */
const session = (accessToken: string, refreshToken?: string) =>
  ok({
    user: { id: "u1" },
    memberships: [],
    activeOrganizationId: null,
    tokens: { accessToken, tokenType: "Bearer", expiresIn: 900, ...(refreshToken ? { refreshToken } : {}) },
  });

type Call = { url: string; init: RequestInit };
const auth = (c: Call) => (c.init.headers as Record<string, string>).Authorization;
const body = (c: Call) => (c.init.body ? JSON.parse(String(c.init.body)) : undefined);

describe("api", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const ended = vi.fn();
  const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init! }));
  const refreshCalls = () => calls().filter((c) => c.url === "/api/v1/auth/refresh");

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    resetSessionForTests();
    setSessionEndedHandler(ended);
  });
  afterEach(() => {
    fetchMock.mockReset();
    ended.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("desempaqueta data y valida con el esquema", async () => {
    clearSession();
    fetchMock.mockResolvedValueOnce(ok({ id: "1", name: "Tannat" }));
    const data = await api("/v1/x", { schema: z.object({ id: z.string(), name: z.string() }) });
    expect(data).toEqual({ id: "1", name: "Tannat" });
  });

  it("llama a /api/v1 del propio origen con Bearer, query y cookies", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok({ items: [], total: 0, limit: 10, offset: 0 }));
    await api("/v1/terroirs", { query: { limit: 10, offset: 0, varietyName: undefined } });
    const [call] = calls();
    expect(call!.url).toBe("/api/v1/terroirs?limit=10&offset=0");
    expect(auth(call!)).toBe("Bearer a1");
    expect(call!.init.credentials).toBe("include");
  });

  it("convierte el envoltorio de error en ApiError con sus details", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(
      fail(422, "VALIDATION_ERROR", "Validation failed", [
        { field: "grossWeightKg", message: "Debe ser mayor que la tara" },
      ]),
    );
    const err = (await api("/v1/harvest-batches", { method: "POST", body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "VALIDATION_ERROR", isValidation: true });
    expect(err.details).toEqual([{ field: "grossWeightKg", message: "Debe ser mayor que la tara" }]);
  });

  describe("arranque", () => {
    it("recupera la sesión con la cookie (refresh sin cuerpo) y no guarda nada en sessionStorage", async () => {
      fetchMock.mockResolvedValueOnce(session("nuevo"));
      await bootstrapSession();
      expect(getSessionStatus()).toBe("authenticated");
      expect(getAccessToken()).toBe("nuevo");
      expect(getLegacyRefreshToken()).toBeNull();
      expect(body(refreshCalls()[0]!)).toEqual({});
      expect(window.sessionStorage.length).toBe(0);
    });

    it("sin cookie queda anónima y sin aviso", async () => {
      fetchMock.mockResolvedValueOnce(fail(401, "UNAUTHORIZED"));
      await bootstrapSession();
      expect(getSessionStatus()).toBe("anonymous");
      expect(ended).not.toHaveBeenCalled();
    });

    it("borra la sesión que guardaba la plantilla 0.1 en sessionStorage", async () => {
      window.sessionStorage.setItem("doc.session", JSON.stringify({ refreshToken: "r-viejo" }));
      fetchMock.mockResolvedValueOnce(fail(401, "UNAUTHORIZED"));
      await bootstrapSession();
      expect(window.sessionStorage.getItem("doc.session")).toBeNull();
    });

    it("una petición durante el arranque espera a la renovación", async () => {
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith("/auth/refresh") ? session("recuperado") : ok({ ok: true }),
      );
      await Promise.all([bootstrapSession(), api("/v1/users/me"), bootstrapSession()]);
      expect(refreshCalls()).toHaveLength(1);
      const me = calls().find((c) => c.url === "/api/v1/users/me")!;
      expect(auth(me)).toBe("Bearer recuperado");
    });
  });

  describe("renovación silenciosa", () => {
    it("renueva una vez ante un 401 y reintenta con el acceso nuevo", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900 });
      fetchMock
        .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Token caducado"))
        .mockResolvedValueOnce(session("nuevo"))
        .mockResolvedValueOnce(ok({ ok: true }));
      await expect(api("/v1/users/me")).resolves.toEqual({ ok: true });
      expect(getAccessToken()).toBe("nuevo");
      expect(auth(calls()[2]!)).toBe("Bearer nuevo");
      expect(ended).not.toHaveBeenCalled();
    });

    it("varias peticiones que fallan a la vez comparten una sola renovación", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900 });
      let release: () => void = () => {};
      const refreshed = new Promise<void>((r) => (release = r));
      fetchMock.mockImplementation(async (url, init) => {
        if (String(url).endsWith("/auth/refresh")) {
          await refreshed;
          return session("nuevo");
        }
        const token = (init!.headers as Record<string, string>).Authorization;
        return token === "Bearer nuevo" ? ok({ url: String(url) }) : fail(401, "UNAUTHORIZED");
      });
      const pending = Promise.all([api("/v1/a"), api("/v1/b"), api("/v1/c")]);
      await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
      release();
      await expect(pending).resolves.toHaveLength(3);
      expect(refreshCalls()).toHaveLength(1);
    });

    it("renueva antes de que caduque el acceso", async () => {
      setSession({ accessToken: "casi", expiresIn: 10 });
      fetchMock.mockResolvedValueOnce(session("fresco")).mockResolvedValueOnce(ok({ ok: true }));
      await api("/v1/users/me");
      expect(calls().map((c) => c.url)).toEqual(["/api/v1/auth/refresh", "/api/v1/users/me"]);
      expect(auth(calls()[1]!)).toBe("Bearer fresco");
    });

    it("tolerancia hasta H1: guarda en memoria el refresco del cuerpo y lo reenvía", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900, refreshToken: "r1" });
      fetchMock
        .mockResolvedValueOnce(fail(401, "UNAUTHORIZED"))
        .mockResolvedValueOnce(session("nuevo", "r2"))
        .mockResolvedValueOnce(ok({ ok: true }));
      await api("/v1/users/me");
      expect(body(refreshCalls()[0]!)).toEqual({ refreshToken: "r1" });
      expect(getLegacyRefreshToken()).toBe("r2");
      expect(window.sessionStorage.length).toBe(0);
      expect(window.localStorage.length).toBe(0);
    });

    it("acepta el refresh anterior al contrato (tokens sueltos en data)", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900, refreshToken: "r1" });
      fetchMock
        .mockResolvedValueOnce(fail(401, "UNAUTHORIZED"))
        .mockResolvedValueOnce(ok({ accessToken: "nuevo", refreshToken: "r2", tokenType: "Bearer", expiresIn: 60 }))
        .mockResolvedValueOnce(ok({ ok: true }));
      await expect(api("/v1/users/me")).resolves.toEqual({ ok: true });
      expect(getAccessToken()).toBe("nuevo");
    });
  });

  describe("fin de la sesión", () => {
    it("reutilización del refresco (AUTH_REFRESH_REUSED): cierra la sesión con aviso de revocación una sola vez", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900 });
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith("/auth/refresh") ? fail(401, "AUTH_REFRESH_REUSED") : fail(401, "UNAUTHORIZED"),
      );
      const results = await Promise.allSettled([api("/v1/a"), api("/v1/b")]);
      expect(results.every((r) => r.status === "rejected")).toBe(true);
      expect((results[0] as PromiseRejectedResult).reason).toMatchObject({ code: "AUTH_REFRESH_REUSED" });
      expect(getSessionStatus()).toBe("anonymous");
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith("revoked");
      expect(refreshCalls()).toHaveLength(1);
    });

    it("sesión revocada (AUTH_SESSION_REVOKED) en una petición: no intenta renovar", async () => {
      setSession({ accessToken: "a1", expiresIn: 900 });
      fetchMock.mockResolvedValueOnce(fail(401, "AUTH_SESSION_REVOKED", "La sesión fue revocada"));
      await expect(api("/v1/terroirs")).rejects.toMatchObject({ code: "AUTH_SESSION_REVOKED" });
      expect(refreshCalls()).toHaveLength(0);
      expect(ended).toHaveBeenCalledWith("revoked");
      expect(getAccessToken()).toBeNull();
    });

    it("renovación caducada: cierra la sesión con aviso de caducidad", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900 });
      fetchMock
        .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Token caducado"))
        .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Refresh inválido"));
      await expect(api("/v1/users/me")).rejects.toBeInstanceOf(ApiError);
      expect(getSessionStatus()).toBe("anonymous");
      expect(ended).toHaveBeenCalledWith("expired");
    });

    it("sin red durante la renovación no cierra la sesión", async () => {
      setSession({ accessToken: "viejo", expiresIn: 900 });
      fetchMock
        .mockResolvedValueOnce(fail(401, "UNAUTHORIZED"))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(api("/v1/users/me")).rejects.toBeInstanceOf(NetworkError);
      expect(getSessionStatus()).toBe("authenticated");
      expect(ended).not.toHaveBeenCalled();
    });

    it("logout llama al endpoint con el acceso y cierra la sesión aunque falle", async () => {
      setSession({ accessToken: "a1", expiresIn: 900 });
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await logoutSession();
      const [call] = calls();
      expect(call!.url).toBe("/api/v1/auth/logout");
      expect(call!.init.method).toBe("POST");
      expect(auth(call!)).toBe("Bearer a1");
      expect(getSessionStatus()).toBe("anonymous");
      expect(ended).not.toHaveBeenCalled();
    });
  });

  it("distingue fallo de red y contrato roto", async () => {
    clearSession();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("/v1/x")).rejects.toBeInstanceOf(NetworkError);
    fetchMock.mockResolvedValueOnce(ok({ id: 1 }));
    await expect(api("/v1/x", { schema: z.object({ id: z.string() }) })).rejects.toBeInstanceOf(ContractError);
  });
});

describe("toPage", () => {
  const item = z.object({ id: z.string() });
  it("acepta un array (backend anterior a O0-BE-2)", () => {
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

describe("fetchAllPages", () => {
  const all = Array.from({ length: 234 }, (_, i) => i);
  const pageOf = ({ limit, offset }: { limit: number; offset: number }) =>
    Promise.resolve({ items: all.slice(offset, offset + limit), total: all.length, limit, offset });

  it("recorre páginas de 100 como máximo hasta reunir el total", async () => {
    const fetchPage = vi.fn(pageOf);
    const page = await fetchAllPages(fetchPage, { pageSize: 500 });
    expect(page.items).toEqual(all);
    expect(page.total).toBe(234);
    expect(fetchPage.mock.calls.map(([p]) => p)).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 100, offset: 200 },
    ]);
  });

  it("se detiene si una página llega vacía o con el array plano del backend anterior", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1, 2, 3], total: 3, limit: 3, offset: 0 }));
    await expect(fetchAllPages(fetchPage)).resolves.toMatchObject({ items: [1, 2, 3], total: 3 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    const empty = vi.fn(async () => ({ items: [], total: 50, limit: 100, offset: 0 }));
    await expect(fetchAllPages(empty)).resolves.toMatchObject({ items: [] });
    expect(empty).toHaveBeenCalledTimes(1);
  });
});
