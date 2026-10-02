import type { LotSummary } from "@drinks-on-chain/mocks";
import { Badge } from "@drinks-on-chain/ui";
import { stageView } from "../lot-model";

/** Etapa del lote (la calcula el servidor) con su color de familia (01-erp §1). */
export function LotStageBadge({
  lot,
  withDetail = false,
}: {
  lot: Pick<LotSummary, "stage" | "awaitingBifurcation" | "phyto">;
  /** Añade el matiz de la etapa ("Dictamen pendiente") tras el nombre. */
  withDetail?: boolean;
}) {
  const view = stageView(lot);
  return (
    <Badge tone={view.tone} variant={view.strong ? "strong" : "soft"}>
      {view.label}
      {withDetail && view.detail && !view.strong ? ` · ${view.detail.toLowerCase()}` : ""}
    </Badge>
  );
}
