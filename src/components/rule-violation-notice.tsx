import type { ReactNode } from "react";
import { Alert } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { isRuleError, ruleViolationsOf, type RuleViolation } from "@/lib/api/rule-violations";
import { explainViolation } from "@/lib/erp/rule-violations";

// Pendiente de mover a @drinks-on-chain/ui.

type Props = {
  /** Error de una escritura (ApiError 409/422 con código `TRC_…`); cualquier otro se muestra tal cual. */
  error?: unknown;
  /** Violaciones ya leídas (vista previa del embotellado, incidencias del lote). */
  violations?: RuleViolation[];
  /** Título del aviso; por defecto el mensaje del error. */
  title?: ReactNode;
  /** Campos que el formulario ya marca con `details[].field` (solo para errores que no son de regla). */
  fields?: readonly string[];
  className?: string;
};

/**
 * RuleViolationNotice (contrato de la Ola 2 §13): explica cada regla de la trazabilidad que el
 * servidor rechaza (qué regla de la instantánea, qué exige, qué se registró y cuándo o cómo se
 * podrá hacer). No recalcula nada: solo traduce `code`, `rule`, `expected`, `actual` y `meta`.
 * Un error que no es de regla se muestra como el aviso de error habitual del formulario.
 */
export function RuleViolationNotice({ error, violations, title, fields = [], className }: Props) {
  const items = violations ?? (error ? ruleViolationsOf(error) : []);

  if (items.length === 0) {
    if (!error) return null;
    // No es una regla de la trazabilidad: validación, permisos, red…
    const { formErrors } = fieldErrorsFrom(error, fields);
    return (
      <Alert tone="danger" title={title ?? errorMessage(error)} className={className}>
        {formErrors.length > 0 && (
          <ul className="m-0 pl-4">
            {formErrors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </Alert>
    );
  }

  const heading = title ?? (error && isRuleError(error) ? error.message : "El servidor no admite este registro");
  return (
    <Alert tone="warning" title={heading} className={className} data-testid="rule-violation-notice">
      <ul className="m-0 grid list-none gap-3 p-0">
        {items.map((item, i) => {
          const v = explainViolation(item);
          return (
            <li key={`${v.code}-${i}`} data-code={v.code || undefined} className="grid gap-1">
              <p className="font-medium">{v.title}</p>
              {v.message && v.message !== heading && <p>{v.message}</p>}
              {v.rule && (
                <p className="text-sm">
                  <span className="text-fg-muted">Regla del lote: </span>
                  {v.rule}
                </p>
              )}
              {v.facts.length > 0 && (
                <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {v.facts.map((f) => (
                    <div key={f.label} className="flex gap-1.5">
                      <dt className="text-fg-muted">{f.label}:</dt>
                      <dd className="m-0 font-medium tabular-nums">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {v.hint && <p className="text-sm">{v.hint}</p>}
              {v.code && <p className="text-fg-muted font-mono text-xs">{v.code}</p>}
            </li>
          );
        })}
      </ul>
    </Alert>
  );
}
