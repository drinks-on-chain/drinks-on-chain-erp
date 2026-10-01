import { describe, expect, it } from "vitest";
import { LoginResponseSchema, MfaEnrollConfirmResponseSchema, isMfaChallenge } from "./schemas";

const session = {
  user: { id: "u1", email: "a@b.test", fullName: "A", preferredLocale: "es", audience: "STAFF" },
  memberships: [],
  activeOrganizationId: null,
  tokens: { accessToken: "a1", tokenType: "Bearer", expiresIn: 900 },
};

describe("esquemas de sesión (H1)", () => {
  it("el login es una sesión (solo el acceso en tokens) o un reto de segundo factor", () => {
    const parsed = LoginResponseSchema.parse(session);
    expect(isMfaChallenge(parsed)).toBe(false);
    expect(parsed).toEqual(session);

    const challenge = LoginResponseSchema.parse({ mfa: { required: true, enrolled: true, mfaToken: "t" } });
    expect(isMfaChallenge(challenge)).toBe(true);
  });

  it("la confirmación del segundo factor trae la sesión y 10 códigos", () => {
    const codes = Array.from({ length: 10 }, (_, i) => `c${i}`);
    expect(MfaEnrollConfirmResponseSchema.parse({ ...session, recoveryCodes: codes }).recoveryCodes).toHaveLength(10);
  });
});
