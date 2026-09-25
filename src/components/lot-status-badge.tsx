import type { LotStage } from "@drinks-on-chain/mocks";
import { Badge } from "@drinks-on-chain/ui";
import { LOT_STAGE } from "@/lib/erp/labels";

/** Etapa de la vista "Lote" con su color de familia (01-erp §1). */
export function LotStatusBadge({ stage, locked }: { stage: LotStage; locked?: boolean }) {
  const { label, tone } = LOT_STAGE[stage];
  return (
    <Badge tone={tone} variant={stage === "bifurcacion" ? "strong" : "soft"}>
      {label}
      {locked ? " · bloqueado" : ""}
    </Badge>
  );
}
