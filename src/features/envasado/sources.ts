import {
  deriveRestStatus,
  type FermentationTankResponse,
  type HarvestBatchResponse,
  type LotChain,
  type ProductionBatchResponse,
  type TerroirResponse,
  type WineAgingResponse,
} from "@drinks-on-chain/mocks";

// Fuentes que se pueden embotellar (09 §3 fila 6.1): una crianza (vino) o una destilación
// (singani). El backend responde 422 si el candado no se cumplió; aquí se anticipa.

export type SourceKind = "crianza" | "destilacion";

export type BottlingSource = {
  /** Clave única para el selector: "crianza:<id>" o "destilacion:<id>". */
  key: string;
  kind: SourceKind;
  id: string;
  productType: "WINE" | "SINGANI";
  /** Recipiente o equipo: "BAR-FR-2023-11" o "Alambique de cobre AL-02". */
  container: string;
  harvest: HarvestBatchResponse | null;
  terroir: TerroirResponse | null;
  tank: FermentationTankResponse | null;
  aging: WineAgingResponse | null;
  production: ProductionBatchResponse | null;
  /** Ya tiene un embotellado o su estado es BOTTLED: no se ofrece. */
  bottled: boolean;
  /** El candado (crianza o reposo de 180 días) no ha llegado a cero. */
  locked: boolean;
  /** Fecha de liberación (ISO) si se conoce. */
  unlockAt: string | null;
  /** Días que faltan (0 si está liberado). */
  daysRemaining: number;
};

const DAY_MS = 86_400_000;
const dayOf = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
};

export const sourceKey = (kind: SourceKind, id: string) => `${kind}:${id}`;

/** Todas las crianzas y destilaciones de la cadena con su candado calculado a `today`. */
export function bottlingSources(chain: LotChain, today: Date): BottlingSource[] {
  const tankOf = (id: string) => chain.tanks.find((t) => t.id === id) ?? null;
  const harvestOf = (tank: FermentationTankResponse | null) =>
    (tank && chain.harvestBatches.find((h) => h.id === tank.harvestBatchId)) ?? null;
  const terroirOf = (h: HarvestBatchResponse | null) => (h && chain.terroirs.find((t) => t.id === h.terroirId)) ?? null;
  const todayDay = dayOf(today);

  const agings = chain.wineAgings
    .filter((a) => a.agingStatus !== "DISCARDED")
    .map<BottlingSource>((a) => {
      const tank = tankOf(a.fermentationTankId);
      const harvest = harvestOf(tank);
      const remaining = Math.max(0, dayOf(a.lockUntilDate) - todayDay);
      return {
        key: sourceKey("crianza", a.id),
        kind: "crianza",
        id: a.id,
        productType: "WINE",
        container: a.containerCode ?? a.containerType,
        harvest,
        terroir: terroirOf(harvest),
        tank,
        aging: a,
        production: null,
        bottled: a.agingStatus === "BOTTLED" || chain.bottlings.some((b) => b.wineAgingBatchId === a.id),
        locked: remaining > 0,
        unlockAt: a.lockUntilDate,
        daysRemaining: remaining,
      };
    });

  const productions = chain.productionBatches
    .filter((p) => p.restStatus !== "DISCARDED" && p.processType === "SINGANI_DISTILLATION")
    .map<BottlingSource>((p) => {
      const tank = tankOf(p.fermentationTankId);
      const harvest = harvestOf(tank);
      const rest = deriveRestStatus(p, { today });
      const locked = p.restStatus !== "NOT_REQUIRED" && !rest.isRestCompleted;
      return {
        key: sourceKey("destilacion", p.id),
        kind: "destilacion",
        id: p.id,
        productType: "SINGANI",
        container: p.equipmentIdentifier,
        harvest,
        terroir: terroirOf(harvest),
        tank,
        aging: null,
        production: p,
        bottled: p.restStatus === "BOTTLED" || chain.bottlings.some((b) => b.productionBatchId === p.id),
        locked,
        unlockAt: p.mandatoryRestUntil ?? null,
        daysRemaining: locked ? rest.daysRemaining : 0,
      };
    });

  return [...agings, ...productions];
}

export type SourcePreselect = { crianza?: string; destilacion?: string; lote?: string };

/**
 * Fuente indicada por la URL (`?crianza=`, `?destilacion=` o `?lote=<harvestBatchId>`).
 * Con `lote` se elige la primera fuente sin embotellar de ese lote, preferiblemente liberada.
 */
export function resolvePreselected(sources: BottlingSource[], q: SourcePreselect): BottlingSource | null {
  if (q.crianza) return sources.find((s) => s.key === sourceKey("crianza", q.crianza!)) ?? null;
  if (q.destilacion) return sources.find((s) => s.key === sourceKey("destilacion", q.destilacion!)) ?? null;
  if (q.lote) {
    const mine = sources.filter((s) => s.harvest?.id === q.lote && !s.bottled);
    return mine.find((s) => !s.locked) ?? mine[0] ?? null;
  }
  return null;
}
