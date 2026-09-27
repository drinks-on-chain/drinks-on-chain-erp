import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { clearSession, getAccessToken, resetSessionForTests, setSession } from "@/lib/api/session";
import { MFA_NOT_SUPPORTED, acceptInvitation, login, meFromUpdate, switchOrganization, updateMe } from "./api";

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, statusCode: status, timestamp: "", path: "/x", data }), { status });

const user = {
  id: "u1",
  email: "ana@altos.test",
  fullName: "Ana",
  userRole: "ENOLOGIST",
  preferredLocale: "es",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  wineryMemberships: [],
  audience: "STAFF",
};
const meResponse = { user, memberships: [], activeOrganizationId: null };
const session = {
  user: { ...user, wineryId: null },
  memberships: [],
  activeOrganizationId: "w1",
  tokens: { accessToken: "a2", tokenType: "Bearer", expiresIn: 900, refreshToken: "r2" },
};

describe("cuenta (contrato de la Ola 1 §1–§2)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init! }));

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    resetSessionForTests();
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("PATCH /users/me acepta el perfil suelto o `me` completo", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(user));
    expect(await updateMe({ preferredLocale: "en" })).toBeNull();
    fetchMock.mockResolvedValueOnce(ok(meResponse));
    expect(await updateMe({ preferredLocale: "en" })).toMatchObject({ user: { id: "u1" }, activeOrganizationId: null });
    expect(meFromUpdate({ id: "u1" })).toBeNull();
  });

  it("el reto de segundo factor no abre sesión en el ERP", async () => {
    clearSession();
    fetchMock.mockResolvedValueOnce(ok({ mfa: { required: true, enrolled: true, mfaToken: "mfa_1" } }));
    const error = await login({ email: "gestor@drinksonchain.test", password: "demo1234" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(MFA_NOT_SUPPORTED);
    expect(getAccessToken()).toBeNull();
  });

  it("aceptar una invitación con cuenta nueva va sin Bearer y guarda la sesión nueva", async () => {
    setSession({ accessToken: "otra", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await acceptInvitation("tok/1", { fullName: "Rosa", password: "vendimia-2026" }, false);
    const [call] = calls();
    expect(call!.url).toBe("/api/v1/invitations/tok%2F1/accept");
    expect((call!.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(getAccessToken()).toBe("a2");
  });

  it("cambiar de organización envía el refresco de la sesión (cookie y, hasta H1, cuerpo)", async () => {
    setSession({ accessToken: "a1", expiresIn: 900, refreshToken: "sid.1.secreto" });
    fetchMock.mockResolvedValueOnce(ok(session));
    await switchOrganization("w1");
    const [call] = calls();
    expect(call!.init.credentials).toBe("include");
    expect(JSON.parse(String(call!.init.body))).toEqual({ organizationId: "w1", refreshToken: "sid.1.secreto" });

    setSession({ accessToken: "a3", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await switchOrganization("w2");
    expect(JSON.parse(String(calls()[1]!.init.body))).toEqual({ organizationId: "w2" });
  });
});
