import {
  AuthTokensSchema,
  MfaChallengeSchema,
  SessionResponseSchema as MocksSessionResponseSchema,
  type MfaChallenge,
} from "@drinks-on-chain/mocks";
import { z } from "zod";

// Respuestas de sesión y de `me` tras la retirada de H1 (contrato de la Ola 1 §11): los esquemas
// de `@drinks-on-chain/mocks` 0.4.0-rc.2 ya no llevan `userRole`, `wineryId` ni `memberRole`
// (los permisos salen de la membresía activa) y se reexportan tal cual. Lo único propio es que
// la app no lee `tokens.refreshToken`: los mocks lo mantienen opcional y obsoleto hasta 0.5, y
// la renovación viaja solo en la cookie `doc_rt`. Cuando los mocks lo borren, `SessionTokensSchema`
// y los esquemas de sesión también se reducen a reexportarlos.

export {
  AuthUserSchema as SessionUserSchema,
  MeResponseSchema,
  MeUserSchema,
  type AuthUser as SessionUser,
  type MeResponse,
  type MeUser,
} from "@drinks-on-chain/mocks";

/** Tokens de login, refresh y switch-organization: solo el acceso (15 min). */
export const SessionTokensSchema = AuthTokensSchema.omit({ refreshToken: true });
export type SessionTokensResponse = z.infer<typeof SessionTokensSchema>;

/** Respuesta de login (sin segundo factor), refresh, switch-organization y aceptar invitación. */
export const SessionResponseSchema = MocksSessionResponseSchema.extend({ tokens: SessionTokensSchema });
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * `POST /v1/auth/login` y aceptar una invitación: la sesión o, para el personal de plataforma,
 * el reto de segundo factor (contrato de la Ola 1 §1).
 */
export const LoginResponseSchema = z.union([SessionResponseSchema, MfaChallengeSchema]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** ¿Es un reto de segundo factor (y no una sesión)? */
export function isMfaChallenge(data: LoginResponse): data is MfaChallenge {
  return "mfa" in data;
}

/** `POST /v1/auth/mfa/enroll/confirm`: la sesión + 10 códigos de recuperación (se muestran una vez). */
export const MfaEnrollConfirmResponseSchema = SessionResponseSchema.extend({
  recoveryCodes: z.array(z.string()).length(10),
});
export type MfaEnrollConfirmResponse = z.infer<typeof MfaEnrollConfirmResponseSchema>;
