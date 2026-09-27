import { z } from "zod";
import {
  InvitationPreviewSchema,
  LoginResponseSchema,
  MeResponseSchema,
  MeUserSchema,
  SessionResponseSchema,
  isMfaChallenge,
  type AcceptInvitationDto,
  type ChangePasswordDto,
  type ForgotPasswordDto,
  type LoginDto,
  type MeResponse,
  type ResetPasswordDto,
  type SessionResponse,
  type UpdateUserDto,
} from "@drinks-on-chain/mocks";
import { api, logoutSession } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { getLegacyRefreshToken, setSession } from "@/lib/api/session";

// Sesión, perfil y cuenta (contratos de la Ola 0 §5 y de la Ola 1 §1–§2). Las pantallas usan
// los hooks de hooks.ts.

/** Código propio del ERP cuando el login pide segundo factor (personal de la plataforma). */
export const MFA_NOT_SUPPORTED = "ERP_MFA_NOT_SUPPORTED";

/**
 * `POST /v1/auth/login`: guarda el acceso en memoria; la renovación llega en la cookie.
 * El personal de la plataforma recibe un reto de segundo factor (`{ mfa }`, contrato de la
 * Ola 1 §1) que se completa en el Backoffice: aquí se rechaza con un mensaje claro.
 */
export async function login(credentials: LoginDto): Promise<SessionResponse> {
  const res = await api("/v1/auth/login", {
    method: "POST",
    body: credentials,
    schema: LoginResponseSchema,
    auth: false,
  });
  if (isMfaChallenge(res)) {
    throw new ApiError({
      status: 403,
      code: MFA_NOT_SUPPORTED,
      message: "Tu cuenta es del equipo de Drinks on Chain y entra con segundo factor por el Backoffice.",
    });
  }
  setSession(res.tokens);
  return res;
}

/** `POST /v1/auth/logout`: revoca la sesión en el backend y la cierra aquí. */
export function logout() {
  return logoutSession();
}

/**
 * `POST /v1/auth/switch-organization`: tokens nuevos de la misma sesión con otra organización
 * activa. El backend exige el refresco de esa sesión (O0-BE-4) y lo rota: viaja en la cookie
 * `doc_rt` (`credentials: 'include'`) y, hasta H1, también en el cuerpo si llegó así en el login.
 */
export async function switchOrganization(organizationId: string) {
  const refreshToken = getLegacyRefreshToken();
  const res = await api("/v1/auth/switch-organization", {
    method: "POST",
    body: refreshToken ? { organizationId, refreshToken } : { organizationId },
    schema: SessionResponseSchema,
  });
  setSession(res.tokens);
  return res;
}

/** `GET /v1/users/me`: `{ user, memberships, activeOrganizationId }`. */
export function fetchMe(signal?: AbortSignal) {
  return api("/v1/users/me", { schema: MeResponseSchema, signal });
}

/**
 * Respuesta de `PATCH /v1/users/me`: el contrato de la Ola 1 §1 devuelve
 * `{ user, memberships, activeOrganizationId }`; los mocks 0.3.0-rc.1 (y el backend anterior)
 * devuelven solo el perfil. Se aceptan las dos formas (§11 bis).
 */
const updateMeResponseSchema = z.union([MeResponseSchema, MeUserSchema.partial().passthrough()]);

/** `me` completo si la respuesta lo trae; `null` si solo trae el perfil (hay que volver a leer). */
export function meFromUpdate(data: unknown): MeResponse | null {
  const parsed = MeResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** `PATCH /v1/users/me`: perfil y preferencias (idioma, avisos, promociones). */
export async function updateMe(body: UpdateUserDto): Promise<MeResponse | null> {
  const data = await api("/v1/users/me", { method: "PATCH", body, schema: updateMeResponseSchema });
  return meFromUpdate(data);
}

/** `POST /v1/users/me/password` → 204. Revoca las demás sesiones de la persona. */
export function changePassword(body: ChangePasswordDto) {
  return api<void>("/v1/users/me/password", { method: "POST", body });
}

/** `POST /v1/auth/forgot-password` → 202 siempre (no revela si el correo existe). */
export function forgotPassword(body: ForgotPasswordDto) {
  return api<void>("/v1/auth/forgot-password", { method: "POST", body, auth: false });
}

/** `POST /v1/auth/reset-password` → 204. Revoca todas las sesiones de la persona. */
export function resetPassword(body: ResetPasswordDto) {
  return api<void>("/v1/auth/reset-password", { method: "POST", body, auth: false });
}

/** `POST /v1/auth/verify-email` → 204. */
export function verifyEmail(token: string) {
  return api<void>("/v1/auth/verify-email", { method: "POST", body: { token }, auth: false });
}

/** `GET /v1/invitations/{token}` (público): bodega, rol, quién invita, caducidad y si la cuenta existe. */
export function fetchInvitation(token: string, signal?: AbortSignal) {
  return api(`/v1/invitations/${encodeURIComponent(token)}`, {
    schema: InvitationPreviewSchema,
    auth: false,
    signal,
  });
}

/**
 * `POST /v1/invitations/{token}/accept`. Cuenta nueva: `{ fullName, password }` sin sesión.
 * Cuenta existente: `{}` con la sesión de la persona invitada. Responde como el login, con la
 * organización invitada como activa: se guarda la sesión nueva.
 */
export async function acceptInvitation(token: string, body: AcceptInvitationDto, withSession: boolean) {
  const res = await api(`/v1/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body,
    schema: LoginResponseSchema,
    auth: withSession,
  });
  if (isMfaChallenge(res)) {
    throw new ApiError({
      status: 403,
      code: MFA_NOT_SUPPORTED,
      message: "Esta invitación es para el equipo de Drinks on Chain: acéptala desde el Backoffice.",
    });
  }
  setSession(res.tokens);
  return res;
}
