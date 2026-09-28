import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { clearSession, getAccessToken, resetSessionForTests, setSession } from "@/lib/api/session";
import { MFA_NOT_SUPPORTED, acceptInvitation, login, switchOrganization, updateMe } from "./api";

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, statusCode: status, timestamp: "", path: "/x", data }), { status });

const user = {
  id: "u1",
  email: "ana@altos.test",
  fullName: "Ana",
  preferredLocale: "es",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  wineryMemberships: [],
  audience: "STAFF",
};
const membership = {
  id: "m1",
  organizationId: "w1",
  organizationType: "WINERY",
  organizationName: "Bodega Altos de Calamuchita",
  organizationStatus: "ACTIVE",
  role: "ENOLOGIST",
  status: "ACTIVE",
};
const meResponse = { user, memberships: [membership], activeOrganizationId: "w1" };
/** Respuesta de sesión tras H1: sin `refreshToken` ni `userRole/wineryId/memberRole`. */
const session = {
  user: { id: "u1", email: "ana@altos.test", fullName: "Ana", preferredLocale: "es", audience: "STAFF" },
  memberships: [membership],
  activeOrganizationId: "w1",
  tokens: { accessToken: "a2", tokenType: "Bearer", expiresIn: 900 },
};

describe("cuenta (contrato de la Ola 1 §1–§2, tras H1)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init! }));
  const bodyOf = (i: number) => JSON.parse(String(calls()[i]!.init.body));

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    resetSessionForTests();
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("PATCH /users/me devuelve `me` completo; el perfil suelto ya no vale", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(meResponse));
    expect(await updateMe({ preferredLocale: "en" })).toMatchObject({ user: { id: "u1" }, activeOrganizationId: "w1" });
    fetchMock.mockResolvedValueOnce(ok(user));
    await expect(updateMe({ preferredLocale: "en" })).rejects.toThrow(/contrato/);
  });

  it("el login guarda el acceso de la sesión (sin refreshToken en el cuerpo)", async () => {
    clearSession();
    fetchMock.mockResolvedValueOnce(ok(session));
    const res = await login({ email: "ana@altos.test", password: "demo1234" });
    expect(res).toMatchObject({ activeOrganizationId: "w1" });
    expect(res.tokens).not.toHaveProperty("refreshToken");
    expect(getAccessToken()).toBe("a2");
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
    expect(bodyOf(0)).toEqual({ fullName: "Rosa", password: "vendimia-2026" });
    expect(getAccessToken()).toBe("a2");
  });

  it("aceptar con cuenta existente envía `{}` con la sesión (sin refresco en el cuerpo)", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await acceptInvitation("tok", {}, true);
    expect(calls()[0]!.init.credentials).toBe("include");
    expect(bodyOf(0)).toEqual({});
  });

  it("cambiar de organización envía solo { organizationId }: el refresco va en la cookie", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await switchOrganization("w1");
    const [call] = calls();
    expect(call!.url).toBe("/api/v1/auth/switch-organization");
    expect(call!.init.credentials).toBe("include");
    expect(bodyOf(0)).toEqual({ organizationId: "w1" });
    expect(getAccessToken()).toBe("a2");
  });
});
