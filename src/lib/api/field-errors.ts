import { ApiError } from "./errors";

// Errores de validación del backend junto a cada campo (contrato de la Ola 0 §1):
// `details: [{ field, message }]`, con `field` en notación de puntos (`items.0.quantity`)
// o `null` si el error no es de un campo concreto.

export type ValidationIssue = { field: string | null; message: string };

/** Lee los `details: [{ field, message }]` de un error; lo que no tenga esa forma se ignora. */
export function validationIssues(details: unknown): ValidationIssue[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d): ValidationIssue[] => {
    if (d && typeof d === "object" && "message" in d && typeof d.message === "string") {
      const field = "field" in d && typeof d.field === "string" && d.field ? d.field : null;
      return [{ field, message: d.message }];
    }
    return [];
  });
}

export type FieldErrorsResult<F extends string> = {
  /** Primer mensaje de cada campo del formulario. */
  fieldErrors: Partial<Record<F, string>>;
  /** Mensajes que no corresponden a ningún campo del formulario (se muestran arriba). */
  formErrors: string[];
};

/**
 * Reparte los `details` de un 422 (validación o regla de negocio) entre los campos del
 * formulario. `fields` es la lista de campos (se busca el nombre exacto y, si no, el prefijo
 * más largo: `items.0.quantity` → `items.0` → `items`) o una función que traduce el nombre
 * del backend al del formulario. Cualquier otro error devuelve listas vacías.
 */
export function fieldErrorsFrom<F extends string>(
  error: unknown,
  fields: readonly F[] | ((field: string) => F | undefined),
): FieldErrorsResult<F> {
  const result: FieldErrorsResult<F> = { fieldErrors: {}, formErrors: [] };
  if (!(error instanceof ApiError) || !error.isValidation) return result;
  const resolve =
    typeof fields === "function"
      ? fields
      : (field: string): F | undefined => {
          const parts = field.split(".");
          for (let n = parts.length; n > 0; n--) {
            const candidate = parts.slice(0, n).join(".");
            if ((fields as readonly string[]).includes(candidate)) return candidate as F;
          }
          return undefined;
        };
  for (const issue of validationIssues(error.details)) {
    const key = issue.field ? resolve(issue.field) : undefined;
    if (key === undefined) result.formErrors.push(issue.message);
    else result.fieldErrors[key] ??= issue.message;
  }
  return result;
}
