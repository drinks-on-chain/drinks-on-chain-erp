import type { FermentationTankResponse, WineAgingResponse } from "@drinks-on-chain/mocks";
import { isAfter, type FieldErrors } from "@/features/vinificacion/form-utils";
import { parseDecimal } from "@/lib/format";
import { lotName, terroirOfHarvest, type LotLookup } from "@/features/vinificacion/tank-model";

// Crianza del vino (contrato de la Ola 2 §5.1): el candado (fecha de liberación, días que faltan
// y regla aplicada) lo evalúa el servidor con la instantánea del lote y su reloj (`lock`). Aquí
// solo se arma su vista; el cálculo local queda para las respuestas que no traen `lock`.

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
  /** Inicio del candado. */
  startDate: string;
  unlockAt: string;
  totalDays: number;
  daysRemaining: number;
  /** 0–100 */
  progress: number;
  released: boolean;
};

type AgingLockInput = Pick<WineAgingResponse, "lockUntilDate" | "plannedMonths" | "agingStatus"> &
  Partial<Pick<WineAgingResponse, "lock" | "startDate">>;

/**
 * Candado de una crianza. Con `lock` (rutas de crianza), los días que faltan y si está liberado
 * son los del servidor; sin él (respuestas anidadas), se estiman con `lockUntilDate` y `today`.
 */
export function agingLock(a: AgingLockInput, today: Date): LockProgress {
  const unlockAt = a.lock ? `${a.lock.unlockDate}T00:00:00Z` : a.lockUntilDate;
  const start = a.startDate ? new Date(`${a.startDate.slice(0, 10)}T00:00:00Z`) : addMonths(unlockAt, -a.plannedMonths);
  const end = dayStart(unlockAt);
  const totalDays = Math.max(1, Math.round((end - start.getTime()) / DAY));
  const remaining = a.lock ? a.lock.daysRemaining : Math.max(0, Math.ceil((end - dayStart(today)) / DAY));
  const released = (a.lock ? a.lock.released : remaining === 0) || a.agingStatus !== "AGING";
  const progress = released ? 100 : Math.round(((totalDays - remaining) / totalDays) * 100);
  return {
    startDate: start.toISOString(),
    unlockAt,
    totalDays,
    daysRemaining: a.agingStatus === "AGING" ? remaining : 0,
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

/**
 * Tanques que pueden iniciar crianza: fermentación completada con destino vino y sin crianza
 * previa (una por tanque).
 */
export function agingCandidates(
  tanks: readonly FermentationTankResponse[],
  agings: readonly Pick<WineAgingResponse, "fermentationTankId">[],
): FermentationTankResponse[] {
  const aged = new Set(agings.map((a) => a.fermentationTankId));
  return tanks.filter((t) => t.destinationType === "WINE_AGING" && t.status === "COMPLETED" && !aged.has(t.id));
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
  containerCount: string;
  volumeLiters: string;
  plannedMonths: string;
  startDate: string;
  notes: string;
};
export type AgingField = keyof AgingValues;

/**
 * Validación de forma del alta de crianza (`CreateWineAgingBatchDto`). El mínimo de meses de la
 * instantánea del lote y el volumen disponible del tanque los comprueba el servidor
 * (`TRC_AGING_BELOW_MINIMUM`, `TRC_VOLUME_EXCEEDS_AVAILABLE`).
 */
export function validateAging(
  v: AgingValues,
  ctx: { candidateIds: ReadonlySet<string>; today: Date },
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
  if (v.containerCount.trim()) {
    const n = parseDecimal(v.containerCount);
    if (n === null || !Number.isInteger(n) || n < 1)
      e.containerCount = "El número de recipientes es un entero desde 1.";
  }
  const vol = parseDecimal(v.volumeLiters);
  if (vol === null) e.volumeLiters = "Indica los litros que pasan a crianza.";
  else if (vol <= 0) e.volumeLiters = "El volumen debe ser mayor que cero.";
  const months = parseDecimal(v.plannedMonths);
  if (months === null) e.plannedMonths = "Indica los meses de crianza.";
  else if (!Number.isInteger(months) || months < 0) e.plannedMonths = "Los meses son un número entero, sin decimales.";

  if (v.startDate && isAfter(v.startDate, ctx.today)) e.startDate = "La fecha de inicio no puede ser futura.";
  return e;
}
