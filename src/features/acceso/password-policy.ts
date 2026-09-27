import { PASSWORD_MIN_LENGTH } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import { validationIssues } from "@/lib/api/field-errors";

// Política de contraseñas del contrato de la Ola 1 §1 (IAM-06): al menos 10 caracteres y no
// estar en la lista de comunes. El backend decide (422 `AUTH_WEAK_PASSWORD` con `details`); aquí
// se muestran los requisitos mientras se escribe y se evita enviar lo que sin duda fallará.

export const PASSWORD_MIN = PASSWORD_MIN_LENGTH;

/** Muestra de contraseñas comunes; la lista completa vive en el backend. */
const COMMON = new Set([
  "1234567890",
  "12345678910",
  "0123456789",
  "password123",
  "password1234",
  "contraseña",
  "contraseña123",
  "contrasena123",
  "qwertyuiop",
  "qwerty12345",
  "abcdefghij",
  "drinksonchain",
]);

export const isCommonPassword = (password: string) => COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password);

export type PasswordRule = { id: "length" | "common" | "match"; label: string; ok: boolean };

/** Requisitos visibles bajo el campo; `confirm` añade el de coincidir. */
export function passwordRules(password: string, confirm?: string): PasswordRule[] {
  const rules: PasswordRule[] = [
    { id: "length", label: `Al menos ${PASSWORD_MIN} caracteres`, ok: password.length >= PASSWORD_MIN },
    {
      id: "common",
      label: "Que no sea una contraseña común ni un solo carácter repetido",
      ok: password.length > 0 && !isCommonPassword(password),
    },
  ];
  if (confirm !== undefined) {
    rules.push({
      id: "match",
      label: "Las dos contraseñas coinciden",
      ok: password.length > 0 && password === confirm,
    });
  }
  return rules;
}

export type NewPasswordErrors = { password?: string; confirm?: string };

/** Errores de una contraseña nueva con su confirmación (vacío si se puede enviar). */
export function validateNewPassword(password: string, confirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (!password) errors.password = "Escribe la contraseña nueva.";
  else if (password.length < PASSWORD_MIN) errors.password = `Debe tener al menos ${PASSWORD_MIN} caracteres.`;
  else if (isCommonPassword(password)) errors.password = "Es una contraseña demasiado común: elige otra.";
  if (!confirm) errors.confirm = "Repite la contraseña nueva.";
  else if (password !== confirm) errors.confirm = "Las contraseñas no coinciden.";
  return errors;
}

/**
 * Errores de un 422 de contraseñas (`AUTH_WEAK_PASSWORD` con un detalle por problema,
 * `AUTH_INVALID_CURRENT_PASSWORD`, `AUTH_RESET_TOKEN_INVALID` en `token`…) repartidos por campo;
 * los varios mensajes de un mismo campo se unen. Lo que no es de un campo va a `formError`.
 */
export function passwordApiErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
): { errors: Partial<Record<F, string>>; formError: string | null } {
  const errors: Partial<Record<F, string>> = {};
  if (!(error instanceof ApiError) || !error.isValidation) return { errors, formError: null };
  const rest: string[] = [];
  for (const issue of validationIssues(error.details)) {
    const field = fields.find((f) => f === issue.field);
    if (!field) rest.push(issue.message);
    else errors[field] = errors[field] ? `${errors[field]}. ${issue.message}` : issue.message;
  }
  const formError = rest.length ? rest.join(" ") : Object.keys(errors).length ? null : error.message;
  return { errors, formError };
}
