import type { ComplianceIssue } from "@drinks-on-chain/mocks";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { parseRuleViolations } from "@/lib/api/rule-violations";
import { COMPLIANCE_SOURCE } from "@/lib/erp/labels";
import { fmtDate } from "@/lib/format";

/**
 * Incidencias de cumplimiento abiertas del lote (contrato de la Ola 2 §2.6): lo que la revisión
 * de integridad encontró al migrar los datos, o tras una corrección o un cambio de reglas. No se
 * corrigen solas: bloquean embotellar y cerrar el expediente hasta resolverlas con una corrección.
 */
export function ComplianceIssues({ issues }: { issues: ComplianceIssue[] }) {
  const open = issues.filter((i) => !i.resolvedAt);
  if (open.length === 0) return null;
  return (
    <section aria-label="Incidencias de cumplimiento" className="grid gap-3">
      <h2 className="m-0 font-ui text-lg font-semibold">
        {open.length === 1
          ? "1 incidencia de cumplimiento abierta"
          : `${open.length} incidencias de cumplimiento abiertas`}
      </h2>
      <p className="m-0 text-sm text-fg-muted">
        Bloquean el embotellado y el cierre del expediente. Se resuelven con una corrección compensatoria (nada se edita
        ni se borra) o descartando el lote.
      </p>
      {open.map((issue) => {
        const details = parseRuleViolations(issue.details).map((v) => ({ ...v, code: v.code ?? issue.code }));
        return (
          <RuleViolationNotice
            key={issue.id}
            title={`${issue.message} · ${COMPLIANCE_SOURCE[issue.source]} el ${fmtDate(issue.detectedAt)}`}
            violations={
              details.length > 0
                ? details
                : [
                    {
                      field: null,
                      message: issue.message,
                      code: issue.code,
                      rule: null,
                      expected: undefined,
                      actual: undefined,
                      meta: {},
                    },
                  ]
            }
          />
        );
      })}
    </section>
  );
}
