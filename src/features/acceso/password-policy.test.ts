import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  PASSWORD_MIN,
  isCommonPassword,
  passwordApiErrors,
  passwordRules,
  validateNewPassword,
} from "./password-policy";

describe("política de contraseñas", () => {
  it("exige 10 caracteres y que no sea común", () => {
    expect(PASSWORD_MIN).toBe(10);
    expect(isCommonPassword("1234567890")).toBe(true);
    expect(isCommonPassword("Password123")).toBe(true);
    expect(isCommonPassword("aaaaaaaaaaaa")).toBe(true);
    expect(isCommonPassword("vendimia-2026")).toBe(false);
  });

  it("marca los requisitos mientras se escribe", () => {
    const rules = (p: string, c?: string) => Object.fromEntries(passwordRules(p, c).map((r) => [r.id, r.ok]));
    expect(rules("")).toEqual({ length: false, common: false });
    expect(rules("corta")).toEqual({ length: false, common: true });
    expect(rules("vendimia-2026", "vendimia-2026")).toEqual({ length: true, common: true, match: true });
    expect(rules("vendimia-2026", "vendimia")).toMatchObject({ match: false });
  });

  it("valida la contraseña nueva y su confirmación", () => {
    expect(validateNewPassword("vendimia-2026", "vendimia-2026")).toEqual({});
    expect(validateNewPassword("", "")).toEqual({
      password: "Escribe la contraseña nueva.",
      confirm: "Repite la contraseña nueva.",
    });
    expect(validateNewPassword("corta", "corta").password).toMatch(/10 caracteres/);
    expect(validateNewPassword("1234567890", "1234567890").password).toMatch(/común/);
    expect(validateNewPassword("vendimia-2026", "vendimia-2027").confirm).toMatch(/no coinciden/);
  });

  it("reparte los 422 del backend y une los mensajes de un mismo campo", () => {
    const weak = new ApiError({
      status: 422,
      code: "AUTH_WEAK_PASSWORD",
      message: "La contraseña no cumple la política",
      details: [
        { field: "newPassword", message: "Debe tener al menos 10 caracteres" },
        { field: "newPassword", message: "Es una contraseña demasiado común" },
      ],
    });
    expect(passwordApiErrors(weak, ["currentPassword", "newPassword"] as const)).toEqual({
      errors: { newPassword: "Debe tener al menos 10 caracteres. Es una contraseña demasiado común" },
      formError: null,
    });
    const token = new ApiError({
      status: 422,
      code: "AUTH_RESET_TOKEN_INVALID",
      message: "El enlace no es válido",
      details: [{ field: "token", message: "El enlace no es válido" }],
    });
    expect(passwordApiErrors(token, ["password"] as const)).toEqual({
      errors: {},
      formError: "El enlace no es válido",
    });
    expect(passwordApiErrors(new Error("x"), ["password"] as const)).toEqual({ errors: {}, formError: null });
  });
});
