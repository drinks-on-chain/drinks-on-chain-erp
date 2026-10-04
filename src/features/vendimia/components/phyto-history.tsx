"use client";

import type { PhytoDecision } from "@drinks-on-chain/mocks";
import { Tag, cn } from "@drinks-on-chain/ui";
import { VoidedBadge } from "@/components/voided";
import { CorrectRecordButton } from "@/features/lotes/components/correction-dialog";
import { isVoided } from "@/lib/erp/voided";
import { StoredFileLink } from "@/components/stored-file-link";
import { roleLabel } from "@/lib/erp/permissions";
import { fmtDateTime } from "@/lib/format";
import { sortDecisions } from "../phyto";
import { PhytoBadge } from "./phyto-badge";

/**
 * Historial de dictámenes del pesaje (contrato de la Ola 2 §3.4): cada dictamen con su fecha,
 * quién lo dio y con qué rol, el motivo y el informe de inspección. El más reciente es el vigente.
 */
export function PhytoHistory({
  decisions,
  lotId,
  lotLabel,
}: {
  decisions: readonly PhytoDecision[] | undefined;
  /** Lote del pesaje: sin lote no hay correcciones (van por la ruta del lote). */
  lotId: string | null | undefined;
  lotLabel: string;
}) {
  const items = sortDecisions(decisions);
  // El vigente es el más reciente sin anular; un dictamen anulado queda tachado en el historial.
  const currentId = items.find((d) => !isVoided(d))?.id;
  if (items.length === 0) {
    return <p className="m-0 text-sm text-fg-muted">Aún no hay dictámenes: la uva está pendiente de inspección.</p>;
  }
  return (
    <ol aria-label="Historial de dictámenes" className="m-0 grid list-none gap-3 p-0">
      {items.map((d) => (
        <li
          key={d.id}
          data-voided={isVoided(d) || undefined}
          className={cn("grid gap-1 rounded-md border border-border p-3", isVoided(d) && "bg-bg-sunken")}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(isVoided(d) && "opacity-60")}>
              <PhytoBadge status={d.decision} strong={d.id === currentId} />
            </span>
            {d.id === currentId && <span className="text-sm text-fg-muted">Vigente</span>}
            {isVoided(d) && <VoidedBadge />}
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
          <div className="justify-self-start">
            <CorrectRecordButton
              lotId={lotId}
              lotLabel={lotLabel}
              voided={isVoided(d)}
              record={{ id: d.id, type: "PHYTO_DECISION", label: `Dictamen del ${fmtDateTime(d.decidedAt)}` }}
            >
              Anular dictamen
            </CorrectRecordButton>
          </div>
        </li>
      ))}
    </ol>
  );
}
