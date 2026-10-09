import { ApiError } from "./errors";

// Errores de reglas (contrato de la Ola 2 §0 y §13, y de la Ola 3 §9 para los `TOK_…`): el backend responde 409
// (estado del recurso) o 422 (regla incumplida) con un código `TRC_…` estable y `details` ampliados
// de forma aditiva con `code`, `rule`, `expected`, `actual` y `meta`. Aquí solo se leen; el texto
// para la persona lo arma `src/lib/erp/rule-violations.ts`.

export type RuleViolation = {
  /** Campo del formulario (notación de puntos) o `null` si no es de un campo. */
  field: string | null;
  /** Mensaje del servidor, en español. */
  message: string;
  /** `TRC_…` de esta violación (una respuesta puede traer varias). */
  code: string | null;
  /** Clave del parámetro de la instantánea del lote. */
  rule: string | null;
  expected: unknown;
  actual: unknown;
  meta: Record<string, unknown>;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lee una lista de detalles ampliados; lo que no tenga `message` se ignora. */
export function parseRuleViolations(details: unknown): RuleViolation[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d): RuleViolation[] => {
    if (!isRecord(d) || typeof d.message !== "string") return [];
    return [
      {
        field: typeof d.field === "string" && d.field ? d.field : null,
        message: d.message,
        code: typeof d.code === "string" && d.code ? d.code : null,
        rule: typeof d.rule === "string" && d.rule ? d.rule : null,
        expected: d.expected,
        actual: d.actual,
        meta: isRecord(d.meta) ? d.meta : {},
      },
    ];
  });
}

/**
 * Códigos de reglas: los de la trazabilidad (`TRC_…`), los de la tokenización (`TOK_…`, Ola 3 §9) y
 * el único anterior a la Ola 2 que sigue vivo.
 */
export const isRuleCode = (code: string | null | undefined): boolean =>
  !!code && (code.startsWith("TRC_") || code.startsWith("TOK_") || code === "FERMENTATION_TANK_ALREADY_TRANSFERRED");

/** El error es una regla de la trazabilidad (por su código o por el de alguno de sus detalles). */
export function isRuleError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  if (isRuleCode(error.code)) return true;
  return parseRuleViolations(error.details).some((v) => isRuleCode(v.code));
}

/**
 * Violaciones de un error de regla. Si el servidor no manda detalles, se devuelve una con el
 * código y el mensaje del propio error, para que la pantalla siempre tenga algo que explicar.
 */
export function ruleViolationsOf(error: unknown): RuleViolation[] {
  if (!isRuleError(error)) return [];
  const parsed = parseRuleViolations(error.details).map((v) => ({ ...v, code: v.code ?? error.code }));
  if (parsed.length > 0) return parsed;
  return [
    {
      field: null,
      message: error.message,
      code: error.code,
      rule: null,
      expected: undefined,
      actual: undefined,
      meta: {},
    },
  ];
}
