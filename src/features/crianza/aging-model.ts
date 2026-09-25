import type { FermentationTankResponse, WineAgingResponse } from "@drinks-on-chain/mocks";
import { isAfter, parseDecimal, type FieldErrors } from "@/features/vinificacion/form-utils";
import { lotName, terroirOfHarvest, type LotLookup } from "@/features/vinificacion/tank-model";

// Cálculos puros de crianza (03 §4, 1D; 09 §3 fila 5.1A): candado hasta `lockUntilDate`.

const DAY = 86_400_000;
const dayStart = (d: Date | string) => {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

/** Suma meses a una fecha (UTC); si el día no existe en el mes destino, usa el último del mes. */
export function addMonths(iso: string, months: number): Date {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/**
 * Fecha de liberación prevista (inicio + meses), para mostrarla antes de enviar. La definitiva
 * la calcula el backend (`lockUntilDate`).
 */
export const computeUnlockDate = (startDate: string, plannedMonths: number) => addMonths(startDate, plannedMonths);

export type LockProgress = {
  /** Inicio del candado (derivado: la respuesta no trae `startDate`). */
  startDate: string;
  unlockAt: string;
  totalDays: number;
  daysRemaining: number;
  /** 0–100 */
  progress: number;
  released: boolean;
};

/** Progreso del candado de una crianza a partir de `lockUntilDate` y `plannedMonths`. */
export function agingLock(
  a: Pick<WineAgingResponse, "lockUntilDate" | "plannedMonths" | "agingStatus">,
  today: Date,
): LockProgress {
  const start = addMonths(a.lockUntilDate, -a.plannedMonths);
  const end = dayStart(a.lockUntilDate);
  const totalDays = Math.max(1, Math.round((end - start.getTime()) / DAY));
  const daysRemaining = Math.max(0, Math.ceil((end - dayStart(today)) / DAY));
  const released = daysRemaining === 0 || a.agingStatus !== "AGING";
  const progress = released ? 100 : Math.round(((totalDays - daysRemaining) / totalDays) * 100);
  return {
    startDate: start.toISOString(),
    unlockAt: a.lockUntilDate,
    totalDays,
    daysRemaining: a.agingStatus === "AGING" ? daysRemaining : 0,
    progress: Math.max(0, Math.min(100, progress)),
    released,
  };
}

export type BarrelRowModel = {
  id: string;
  lotName: string;
  harvestBatchCode: string | null;
  tankCode: string | null;
  containerType: string;
  containerMaterial: string | null;
  containerCode: string | null;
  useCycle: number | null;
  volumeLiters: number | null;
  plannedMonths: number;
  status: WineAgingResponse["agingStatus"];
  lock: LockProgress;
};

export function buildBarrelRows(input: {
  agings: readonly WineAgingResponse[];
  tanks: readonly FermentationTankResponse[];
  lookup: LotLookup;
  today: Date;
}): BarrelRowModel[] {
  const tankById = new Map(input.tanks.map((t) => [t.id, t]));
  return input.agings
    .map((a) => {
      const tank = tankById.get(a.fermentationTankId);
      return {
        id: a.id,
        lotName: tank ? lotName(input.lookup, tank.harvestBatchId) : "Lote sin datos",
        harvestBatchCode: tank ? (input.lookup.harvestById.get(tank.harvestBatchId)?.harvestBatchCode ?? null) : null,
        tankCode: tank?.tankCode ?? null,
        containerType: a.containerType,
        containerMaterial: a.containerMaterial ?? null,
        containerCode: a.containerCode ?? null,
        useCycle: a.barrelUseCycle ?? null,
        volumeLiters: a.volumeLiters ?? null,
        plannedMonths: a.plannedMonths,
        status: a.agingStatus,
        lock: agingLock(a, input.today),
      };
    })
    .sort(
      (a, b) =>
        Number(a.status !== "AGING") - Number(b.status !== "AGING") || a.lock.daysRemaining - b.lock.daysRemaining,
    );
}

/** Tanques que pueden iniciar crianza: destino vino, no vacíos y sin crianza previa. */
export function agingCandidates(
  tanks: readonly FermentationTankResponse[],
  agings: readonly Pick<WineAgingResponse, "fermentationTankId">[],
): FermentationTankResponse[] {
  const aged = new Set(agings.map((a) => a.fermentationTankId));
  return tanks.filter((t) => t.destinationType === "WINE_AGING" && t.status !== "CLEANED" && !aged.has(t.id));
}

/** Variedad del tanque para el título ("Tannat"). */
export const tankVariety = (lookup: LotLookup, tank: Pick<FermentationTankResponse, "harvestBatchId">) =>
  terroirOfHarvest(lookup, tank.harvestBatchId)?.varietyName ?? null;

export type AgingValues = {
  fermentationTankId: string;
  containerType: string;
  containerMaterial: string;
  containerCode: string;
  barrelUseCycle: string;
  volumeLiters: string;
  plannedMonths: string;
  startDate: string;
  notes: string;
};
export type AgingField = keyof AgingValues;

/** Validación del alta de crianza (CreateWineAgingBatchDto + reglas de la pantalla). */
export function validateAging(
  v: AgingValues,
  ctx: { candidateIds: ReadonlySet<string>; tankVolume: number | null; today: Date },
): FieldErrors<AgingField> {
  const e: FieldErrors<AgingField> = {};
  if (!v.fermentationTankId) e.fermentationTankId = "Elige el tanque de vino que pasa a crianza.";
  else if (!ctx.candidateIds.has(v.fermentationTankId))
    e.fermentationTankId = "Este tanque no tiene destino crianza o ya inició su crianza.";
  if (!v.containerType.trim()) e.containerType = "Indica el tipo de recipiente.";

  if (v.barrelUseCycle.trim()) {
    const c = parseDecimal(v.barrelUseCycle);
    if (c === null || !Number.isInteger(c) || c < 1) e.barrelUseCycle = "El ciclo de uso es un entero desde 1.";
  }
  if (v.volumeLiters.trim()) {
    const vol = parseDecimal(v.volumeLiters);
    if (vol === null || vol <= 0) e.volumeLiters = "El volumen debe ser mayor que cero.";
    else if (ctx.tankVolume !== null && vol > ctx.tankVolume)
      e.volumeLiters = `Supera el volumen del tanque (${ctx.tankVolume.toLocaleString("es-BO")} L).`;
  }
  const months = parseDecimal(v.plannedMonths);
  if (months === null) e.plannedMonths = "Indica los meses de crianza.";
  else if (!Number.isInteger(months) || months < 1 || months > 120)
    e.plannedMonths = "Los meses van de 1 a 120, sin decimales.";

  if (v.startDate && isAfter(v.startDate, ctx.today)) e.startDate = "La fecha de inicio no puede ser futura.";
  return e;
}
