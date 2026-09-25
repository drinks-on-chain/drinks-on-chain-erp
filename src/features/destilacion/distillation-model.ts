import {
  deriveRestStatus,
  SINGANI_REST_DAYS,
  type FermentationTankResponse,
  type ProductionBatchResponse,
  type RestStatusResponse,
} from "@drinks-on-chain/mocks";
import { isAfter, parseDecimal, type FieldErrors } from "@/features/vinificacion/form-utils";
import { lotName, type LotLookup } from "@/features/vinificacion/tank-model";

// Cálculos puros de destilación (03 §4, 1D; 09 §3 filas 5.1B y 5.2B): cortes del alambique
// y candado de reposo de 180 días desde el fin de la destilación.

export { SINGANI_REST_DAYS };

const DAY = 86_400_000;

export type Cuts = { head: number | null; heart: number | null; tail: number | null };

export function cutsOf(p: Pick<ProductionBatchResponse, "additionalParams">): Cuts {
  const a = p.additionalParams;
  return { head: a?.headDiscardLiters ?? null, heart: a?.heartYieldLiters ?? null, tail: a?.tailDiscardLiters ?? null };
}

/** Parte de cada corte sobre el total de cortes (0–100), para la barra de proporciones. */
export function cutShares(c: Cuts): { head: number; heart: number; tail: number } {
  const total = (c.head ?? 0) + (c.heart ?? 0) + (c.tail ?? 0);
  if (total <= 0) return { head: 0, heart: 0, tail: 0 };
  const pct = (n: number | null) => Math.round(((n ?? 0) / total) * 1000) / 10;
  return { head: pct(c.head), heart: pct(c.heart), tail: pct(c.tail) };
}

/** Inicio del reposo: fin de la destilación (o su inicio si no hay fin), como el backend. */
export const restStartOf = (p: Pick<ProductionBatchResponse, "processEndDate" | "processStartDate">) =>
  p.processEndDate ?? p.processStartDate;

/** Reposo listo para embotellar: cumplido, listo o no exigido. */
export const restAllowsBottling = (r: Pick<RestStatusResponse, "isRestCompleted" | "restStatus">) =>
  r.restStatus !== "BOTTLED" &&
  r.restStatus !== "DISCARDED" &&
  (r.isRestCompleted || r.restStatus === "READY" || r.restStatus === "NOT_REQUIRED");

/** Progreso del reposo (0–100) a partir de `daysElapsed`. */
export const restProgress = (r: Pick<RestStatusResponse, "daysElapsed" | "isRestCompleted">) =>
  r.isRestCompleted ? 100 : Math.max(0, Math.min(100, Math.round((r.daysElapsed / SINGANI_REST_DAYS) * 100)));

/** Fin del reposo previsto para el alta (fin de la destilación + 180 días). */
export function restUntilPreview(processStartDate: string, processEndDate: string): Date | null {
  const base = processEndDate || processStartDate;
  if (!base) return null;
  const ms = Date.parse(`${base.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms + SINGANI_REST_DAYS * DAY);
}

export type ProductionRowModel = {
  id: string;
  lotName: string;
  tankCode: string | null;
  equipment: string;
  endDate: string;
  heartLiters: number | null;
  initialAlcohol: number | null;
  isDoEligible: boolean;
  rest: RestStatusResponse;
};

/** Filas de la tabla de destilaciones. El reposo se deriva en cliente (igual que `rest-status`). */
export function buildProductionRows(input: {
  productions: readonly ProductionBatchResponse[];
  tanks: readonly FermentationTankResponse[];
  lookup: LotLookup;
  today: Date;
}): ProductionRowModel[] {
  const tankById = new Map(input.tanks.map((t) => [t.id, t]));
  const order = (r: RestStatusResponse) => (r.restStatus === "RESTING" ? 0 : r.restStatus === "READY" ? 1 : 2);
  return input.productions
    .map((p) => {
      const tank = tankById.get(p.fermentationTankId);
      return {
        id: p.id,
        lotName: tank ? lotName(input.lookup, tank.harvestBatchId) : "Lote sin datos",
        tankCode: tank?.tankCode ?? null,
        equipment: p.equipmentIdentifier,
        endDate: restStartOf(p),
        heartLiters: p.additionalParams?.heartYieldLiters ?? null,
        initialAlcohol: p.initialAlcoholPercentage ?? null,
        isDoEligible: p.isDoEligible,
        rest: deriveRestStatus(p, { today: input.today }),
      };
    })
    .sort((a, b) => order(a.rest) - order(b.rest) || a.rest.daysRemaining - b.rest.daysRemaining);
}

/** Tanques que pueden ir al alambique: destino singani y no vacíos (admite varias tandas). */
export const distillationCandidates = (tanks: readonly FermentationTankResponse[]) =>
  tanks.filter((t) => t.destinationType === "SINGANI_DIST" && t.status !== "CLEANED");

export type DistillationValues = {
  fermentationTankId: string;
  equipmentIdentifier: string;
  processStartDate: string;
  processEndDate: string;
  inputVolumeLiters: string;
  headDiscardLiters: string;
  heartYieldLiters: string;
  tailDiscardLiters: string;
  initialAlcoholPercentage: string;
  outputVolumeLiters: string;
  wasteVolumeLiters: string;
  isDoEligible: boolean;
  notes: string;
};
export type DistillationField = keyof DistillationValues;

const nonNegative = (s: string, label: string): [number | null, string | undefined] => {
  if (!s.trim()) return [null, undefined];
  const n = parseDecimal(s);
  if (n === null || n < 0) return [null, `${label} debe ser un número positivo.`];
  return [n, undefined];
};

/** Validación del alta de destilación (CreateDistillationBatchDto + cortes ≤ volumen de entrada). */
export function validateDistillation(
  v: DistillationValues,
  ctx: { candidateIds: ReadonlySet<string>; doAllowed: boolean; today: Date },
): FieldErrors<DistillationField> {
  const e: FieldErrors<DistillationField> = {};
  if (!v.fermentationTankId) e.fermentationTankId = "Elige el tanque de vino base.";
  else if (!ctx.candidateIds.has(v.fermentationTankId))
    e.fermentationTankId = "Este tanque no tiene destino destilación (singani).";
  if (!v.equipmentIdentifier.trim()) e.equipmentIdentifier = "Indica el alambique.";

  if (!v.processStartDate) e.processStartDate = "Indica la fecha de inicio.";
  else if (isAfter(v.processStartDate, ctx.today)) e.processStartDate = "La fecha no puede ser futura.";
  if (v.processEndDate) {
    if (isAfter(v.processEndDate, ctx.today)) e.processEndDate = "La fecha no puede ser futura.";
    else if (v.processStartDate && v.processEndDate < v.processStartDate)
      e.processEndDate = "El fin no puede ser anterior al inicio.";
  }

  const [input, inputErr] = nonNegative(v.inputVolumeLiters, "El volumen de entrada");
  if (inputErr) e.inputVolumeLiters = inputErr;
  else if (input === null) e.inputVolumeLiters = "Indica los litros de vino base que entran al alambique.";
  else if (input === 0) e.inputVolumeLiters = "El volumen de entrada debe ser mayor que cero.";

  const [head, headErr] = nonNegative(v.headDiscardLiters, "La cabeza");
  const [heart, heartErr] = nonNegative(v.heartYieldLiters, "El corazón");
  const [tail, tailErr] = nonNegative(v.tailDiscardLiters, "La cola");
  if (headErr) e.headDiscardLiters = headErr;
  if (tailErr) e.tailDiscardLiters = tailErr;
  if (heartErr) e.heartYieldLiters = heartErr;
  else if (heart === null || heart === 0) e.heartYieldLiters = "El corazón es el rendimiento del lote: indícalo.";
  const cutsTotal = (head ?? 0) + (heart ?? 0) + (tail ?? 0);
  if (input && !e.heartYieldLiters && cutsTotal > input)
    e.heartYieldLiters = `Los cortes suman ${cutsTotal.toLocaleString("es-BO")} L y superan la entrada (${input.toLocaleString("es-BO")} L).`;

  if (v.initialAlcoholPercentage.trim()) {
    const abv = parseDecimal(v.initialAlcoholPercentage);
    if (abv === null || abv < 0 || abv > 100) e.initialAlcoholPercentage = "El grado va de 0 a 100 % vol.";
  }
  const [out, outErr] = nonNegative(v.outputVolumeLiters, "El volumen de salida");
  if (outErr) e.outputVolumeLiters = outErr;
  else if (input && out !== null && out > input) e.outputVolumeLiters = "La salida no puede superar la entrada.";
  const [, wasteErr] = nonNegative(v.wasteVolumeLiters, "La merma");
  if (wasteErr) e.wasteVolumeLiters = wasteErr;

  if (v.isDoEligible && !ctx.doAllowed) e.isDoEligible = "La parcela de origen no cumple la D.O. Singani.";
  return e;
}
