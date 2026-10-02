import type { PhytoDecision } from "@drinks-on-chain/mocks";
import { Tag } from "@drinks-on-chain/ui";
import { StoredFileLink } from "@/components/stored-file-link";
import { roleLabel } from "@/lib/erp/permissions";
import { fmtDateTime } from "@/lib/format";
import { sortDecisions } from "../phyto";
import { PhytoBadge } from "./phyto-badge";

/**
 * Historial de dictámenes del pesaje (contrato de la Ola 2 §3.4): cada dictamen con su fecha,
 * quién lo dio y con qué rol, el motivo y el informe de inspección. El más reciente es el vigente.
 */
export function PhytoHistory({ decisions }: { decisions: readonly PhytoDecision[] | undefined }) {
  const items = sortDecisions(decisions);
  if (items.length === 0) {
    return <p className="m-0 text-sm text-fg-muted">Aún no hay dictámenes: la uva está pendiente de inspección.</p>;
  }
  return (
    <ol aria-label="Historial de dictámenes" className="m-0 grid list-none gap-3 p-0">
      {items.map((d, i) => (
        <li key={d.id} className="grid gap-1 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <PhytoBadge status={d.decision} strong={i === 0} />
            {i === 0 && <span className="text-sm text-fg-muted">Vigente</span>}
            {d.source === "MIGRATION" && <Tag>Migrado</Tag>}
            <span className="ml-auto text-sm whitespace-nowrap text-fg-muted">{fmtDateTime(d.decidedAt)}</span>
          </div>
          <p className="m-0 text-sm">
            {d.decidedBy ? (
              <>
                <span className="font-medium">{d.decidedBy.fullName}</span>
                <span className="text-fg-muted"> · {roleLabel(d.decidedBy.role)}</span>
              </>
            ) : (
              <span className="text-fg-muted">Autor no registrado</span>
            )}
          </p>
          {d.notes && <p className="m-0 text-sm text-fg-muted">{d.notes}</p>}
          {d.inspectionReport && (
            <StoredFileLink reference={d.inspectionReport.key}>Informe de inspección</StoredFileLink>
          )}
        </li>
      ))}
    </ol>
  );
}
