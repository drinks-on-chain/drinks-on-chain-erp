import { Check, X } from "lucide-react";
import type { DoEvaluation } from "@drinks-on-chain/mocks";
import { Badge } from "@drinks-on-chain/ui";
import { DO_STATUS } from "@/lib/erp/labels";
import { RULE_SETTINGS, formatRuleValue } from "@/lib/erp/rule-violations";

const CHECK_LABEL: Record<DoEvaluation["checks"][number]["rule"], string> = { ALTITUDE: "Altitud", VARIETY: "Cepa" };

/**
 * Aptitud D.O. Singani calculada por el servidor (contrato de la Ola 2 §3.1 y §4.3): el estado y
 * cada comprobación con lo exigido, el mínimo legal y lo que tiene la parcela. Nunca se declara.
 */
export function DoEvaluationView({
  evaluation,
  terroirNames = {},
}: {
  evaluation: DoEvaluation;
  /** Nombre de cada parcela por su id, para rotular las comprobaciones. */
  terroirNames?: Record<string, string>;
}) {
  const status = DO_STATUS[evaluation.status];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone} variant={evaluation.status === "ELIGIBLE" ? "strong" : "soft"}>
          {status.label}
        </Badge>
        <span className="text-sm text-fg-muted">
          {evaluation.rulesSource === "LOT_SNAPSHOT"
            ? "Calculada con las reglas del lote"
            : "Calculada con las reglas vigentes de la bodega"}
        </span>
      </div>
      {evaluation.status === "ELIGIBLE_BY_EXCEPTION" && (
        <p className="m-0 text-sm text-fg-muted">
          Cumple gracias a un valor de la bodega por debajo del mínimo legal, autorizado por administración.
        </p>
      )}
      {evaluation.checks.length > 0 && (
        <ul aria-label="Comprobaciones de la D.O." className="m-0 grid list-none gap-2 p-0">
          {evaluation.checks.map((c) => {
            const unit = RULE_SETTINGS[c.settingKey]?.unit ?? null;
            const exception = JSON.stringify(c.required) !== JSON.stringify(c.legalMinimum);
            return (
              <li key={`${c.terroirId}-${c.rule}`} className="flex items-start gap-2 text-sm">
                {c.pass ? (
                  <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success" />
                ) : (
                  <X aria-hidden size={16} className="mt-0.5 shrink-0 text-danger" />
                )}
                <span>
                  <span className="font-medium">
                    {CHECK_LABEL[c.rule]}
                    {terroirNames[c.terroirId] ? ` · ${terroirNames[c.terroirId]}` : ""}
                  </span>
                  <span className="sr-only">{c.pass ? " (cumple)" : " (no cumple)"}</span>
                  <span className="block text-fg-muted">
                    Tiene {formatRuleValue(c.actual, unit)} · exige {formatRuleValue(c.required, unit)}
                    {exception ? ` (mínimo legal: ${formatRuleValue(c.legalMinimum, unit)})` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
