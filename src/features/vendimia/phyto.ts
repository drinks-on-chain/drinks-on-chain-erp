import type {
  HarvestBatchResponse,
  PhytoDecision as PhytoDecisionRecord,
  PhytosanitaryStatus,
} from "@drinks-on-chain/mocks";

// Dictamen fitosanitario (contrato de la Ola 2 §3.4): qué decisiones se ofrecen, cuáles piden
// motivo, el historial y los filtros de la lista de vendimia. El servidor decide si un dictamen
// aún se admite (409 `TRC_PHYTO_DECISION_FINAL`).

export type PhytoDecision = Exclude<PhytosanitaryStatus, "PENDING_INSPECTION">;

/** Rechazar y poner en cuarentena exigen el motivo (`notes`). */
export const requiresReason = (decision: PhytoDecision) => decision === "REJECTED" || decision === "QUARANTINE";

/** Dictámenes del más reciente al más antiguo: el primero es el vigente. */
export function sortDecisions(items: readonly PhytoDecisionRecord[] | undefined): PhytoDecisionRecord[] {
  return [...(items ?? [])].sort(
    (a, b) => b.decidedAt.localeCompare(a.decidedAt) || b.recordedAt.localeCompare(a.recordedAt),
  );
}

export const PHYTO_DECISIONS: Record<
  PhytoDecision,
  { action: string; title: string; confirm: string; done: string; variant: "destructive" | "secondary" | "success" }
> = {
  REJECTED: {
    action: "Rechazar lote",
    title: "Rechazar el lote",
    confirm: "Sí, rechazar",
    done: "Lote rechazado",
    variant: "destructive",
  },
  QUARANTINE: {
    action: "Poner en cuarentena",
    title: "Poner el lote en cuarentena",
    confirm: "Sí, poner en cuarentena",
    done: "Lote en cuarentena",
    variant: "secondary",
  },
  APPROVED: {
    action: "Aprobar lote",
    title: "Aprobar el lote",
    confirm: "Sí, aprobar",
    done: "Lote aprobado",
    variant: "success",
  },
};

/** Se dictamina un lote pendiente o en cuarentena; aprobado y rechazado son definitivos. */
export function canDecidePhyto(status: PhytosanitaryStatus): boolean {
  return status === "PENDING_INSPECTION" || status === "QUARANTINE";
}

/** Decisiones que ofrece cada estado (en cuarentena no se vuelve a poner en cuarentena). */
export function availableDecisions(status: PhytosanitaryStatus): PhytoDecision[] {
  if (!canDecidePhyto(status)) return [];
  return status === "QUARANTINE" ? ["REJECTED", "APPROVED"] : ["REJECTED", "QUARANTINE", "APPROVED"];
}

export type HarvestFilters = { status?: PhytosanitaryStatus | null; year?: number | null };

export function filterHarvests<T extends HarvestBatchResponse>(items: readonly T[], f: HarvestFilters): T[] {
  return items
    .filter((h) => (!f.status || h.phytosanitaryStatus === f.status) && (!f.year || h.harvestYear === f.year))
    .sort((a, b) => b.intakeDate.localeCompare(a.intakeDate));
}

/** Años de cosecha presentes, del más reciente al más antiguo. */
export function harvestYears(items: readonly HarvestBatchResponse[]): number[] {
  return [...new Set(items.map((h) => h.harvestYear))].sort((a, b) => b - a);
}

export function countByStatus(items: readonly HarvestBatchResponse[]): Record<PhytosanitaryStatus, number> {
  const counts: Record<PhytosanitaryStatus, number> = {
    PENDING_INSPECTION: 0,
    QUARANTINE: 0,
    APPROVED: 0,
    REJECTED: 0,
  };
  for (const h of items) counts[h.phytosanitaryStatus] += 1;
  return counts;
}
