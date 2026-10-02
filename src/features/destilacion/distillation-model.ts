import {
  CloseDistillationSchema,
  CreateDistillationBatchSchema,
  type CloseDistillationDto,
  type CreateDistillationBatchDto,
  type FermentationTankResponse,
  type LotLockInfo,
  type ProductionBatchResponse,
} from "@drinks-on-chain/mocks";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { omitNulls } from "@/lib/erp/omit-nulls";
import { isAfter, type FieldErrors } from "@/features/vinificacion/form-utils";
import { parseDecimal } from "@/lib/format";
import { lotName, type LotLookup } from "@/features/vinificacion/tank-model";

// Destilación y reposo del singani (contrato de la Ola 2 §5.2): la destilación se abre con el vino
// base que entra al alambique y se cierra con sus cortes; el reposo cuenta desde el cierre y su
// candado (días de la instantánea del lote, fecha de liberación, días que faltan) lo evalúa el
// servidor (`lock`). Aquí solo se arma la vista y se valida la forma de los formularios.

const DAY = 86_400_000;
const dayStart = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

export type Cuts = { head: number | null; heart: number | null; tail: number | null };

type CutsSource = Pick<ProductionBatchResponse, "headsLiters" | "heartLiters" | "tailsLiters" | "additionalParams">;

/** Cortes de la destilación; en registros antiguos, los de `additionalParams`. */
export function cutsOf(p: CutsSource): Cuts {
  const legacy = p.additionalParams;
  return {
    head: p.headsLiters ?? legacy?.headDiscardLiters ?? null,
    heart: p.heartLiters ?? legacy?.heartYieldLiters ?? null,
    tail: p.tailsLiters ?? legacy?.tailDiscardLiters ?? null,
  };
}

/** Parte de cada corte sobre el total de cortes (0–100), para la barra de proporciones. */
export function cutShares(c: Cuts): { head: number; heart: number; tail: number } {
  const total = (c.head ?? 0) + (c.heart ?? 0) + (c.tail ?? 0);
  if (total <= 0) return { head: 0, heart: 0, tail: 0 };
  const pct = (n: number | null) => Math.round(((n ?? 0) / total) * 1000) / 10;
  return { head: pct(c.head), heart: pct(c.heart), tail: pct(c.tail) };
}

/** La destilación sigue abierta: aún no se registraron sus cortes. */
export const isOpenDistillation = (p: Pick<ProductionBatchResponse, "processEndDate" | "restStatus">) =>
  !p.processEndDate && p.restStatus !== "DISCARDED" && p.restStatus !== "BOTTLED";

export type RestState = "open" | "resting" | "ready" | "bottled" | "discarded" | "none";

export type RestView = {
  state: RestState;
  /** Días que faltan (0 si ya se cumplió o no aplica). */
  daysRemaining: number;
  /** Fecha de liberación (ISO), si hay candado. */
  unlockAt: string | null;
  /** Inicio del reposo: el cierre de la destilación. */
  startDate: string | null;
  /** 0–100 */
  progress: number;
  /** Días de reposo de la instantánea del lote, si el servidor los da. */
  restDays: number | null;
  lock: LotLockInfo | null;
};

type RestSource = Pick<
  ProductionBatchResponse,
  "processEndDate" | "restStatus" | "mandatoryRestUntil" | "processStartDate"
> &
  Partial<Pick<ProductionBatchResponse, "lock">>;

/**
 * Reposo de una destilación. Con `lock` (rutas de destilación), los días que faltan y si está
 * cumplido son los del servidor; sin él, se estiman con `mandatoryRestUntil` y `today`.
 */
export function restView(p: RestSource, today: Date): RestView {
  const base = {
    daysRemaining: 0,
    unlockAt: null,
    startDate: p.processEndDate ?? null,
    progress: 100,
    restDays: null,
    lock: null,
  };
  if (p.restStatus === "BOTTLED") return { ...base, state: "bottled" };
  if (p.restStatus === "DISCARDED") return { ...base, state: "discarded" };
  if (!p.processEndDate) return { ...base, state: "open", progress: 0 };

  const lock = p.lock ?? null;
  const unlockAt = lock ? `${lock.unlockDate}T00:00:00Z` : (p.mandatoryRestUntil ?? null);
  if (!unlockAt) return { ...base, state: "none" };

  const remaining = lock
    ? lock.daysRemaining
    : Math.max(0, Math.ceil((dayStart(unlockAt) - dayStart(today.toISOString())) / DAY));
  const released = lock ? lock.released : remaining === 0 || p.restStatus === "READY";
  const total = Math.max(1, Math.round((dayStart(unlockAt) - dayStart(p.processEndDate)) / DAY));
  return {
    state: released ? "ready" : "resting",
    daysRemaining: released ? 0 : remaining,
    unlockAt,
    startDate: p.processEndDate,
    progress: released ? 100 : Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100))),
    restDays: lock ? lock.rule.applied : total,
    lock,
  };
}

/** Con el reposo cumplido el lote puede embotellarse. */
export const restAllowsBottling = (r: Pick<RestView, "state">) => r.state === "ready" || r.state === "none";

export type ProductionRowModel = {
  id: string;
  lotId: string | null;
  lotName: string;
  tankCode: string | null;
  equipment: string;
  /** Cierre de la destilación, o su inicio si sigue abierta. */
  date: string;
  heartLiters: number | null;
  heartAbv: number | null;
  isDoEligible: boolean;
  rest: RestView;
};

const ORDER: Record<RestState, number> = { open: 0, resting: 1, ready: 2, none: 3, bottled: 4, discarded: 5 };

/** Filas de la tabla de destilaciones: primero lo abierto y lo que reposa, por días que faltan. */
export function buildProductionRows(input: {
  productions: readonly ProductionBatchResponse[];
  tanks: readonly FermentationTankResponse[];
  lookup: LotLookup;
  today: Date;
}): ProductionRowModel[] {
  const tankById = new Map(input.tanks.map((t) => [t.id, t]));
  return input.productions
    .map((p) => {
      const tank = tankById.get(p.fermentationTankId);
      return {
        id: p.id,
        lotId: p.lotId,
        lotName: tank ? lotName(input.lookup, tank.harvestBatchId) : "Lote sin datos",
        tankCode: tank?.tankCode ?? null,
        equipment: p.equipmentIdentifier,
        date: p.processEndDate ?? p.processStartDate,
        heartLiters: cutsOf(p).heart,
        heartAbv: p.heartAbvPercent ?? null,
        isDoEligible: p.isDoEligible,
        rest: restView(p, input.today),
      };
    })
    .sort((a, b) => ORDER[a.rest.state] - ORDER[b.rest.state] || a.rest.daysRemaining - b.rest.daysRemaining);
}

/** Tanques que pueden ir al alambique: fermentación completada con destino singani (admite varias tandas). */
export const distillationCandidates = (tanks: readonly FermentationTankResponse[]) =>
  tanks.filter((t) => t.destinationType === "SINGANI_DIST" && t.status === "COMPLETED");

// ---------- Abrir la destilación ----------

export type DistillationValues = {
  fermentationTankId: string;
  equipmentIdentifier: string;
  processStartDate: string;
  inputVolumeLiters: string;
  initialAlcoholPercentage: string;
  /** Última destilación del tanque: lo que quede en él pasa a merma de trasiego. */
  closeTank: boolean;
  notes: string;
};
export type DistillationField = keyof DistillationValues;

type OpenResult = { ok: true; dto: CreateDistillationBatchDto } | { ok: false; errors: FieldErrors<DistillationField> };

/**
 * `POST /v1/production-batches/distillation`: abre la destilación con el vino base que entra. La
 * D.O. del lote, el estado y el destino del tanque y su volumen disponible los comprueba el
 * servidor (`TRC_DO_NOT_ELIGIBLE`, `TRC_TANK_NOT_COMPLETED`, `TRC_DESTINATION_MISMATCH`,
 * `TRC_VOLUME_EXCEEDS_AVAILABLE`); `isDoEligible` no se envía.
 */
export function toOpenDistillationDto(v: DistillationValues, ctx: { today: Date }): OpenResult {
  const e: FieldErrors<DistillationField> = {};
  if (!v.fermentationTankId) e.fermentationTankId = "Elige el tanque de vino base.";
  if (!v.equipmentIdentifier.trim()) e.equipmentIdentifier = "Indica el alambique.";
  if (!v.processStartDate) e.processStartDate = "Indica la fecha de inicio.";
  else if (isAfter(v.processStartDate, ctx.today)) e.processStartDate = "La fecha no puede ser futura.";

  const input = parseDecimal(v.inputVolumeLiters);
  if (input === null) e.inputVolumeLiters = "Indica los litros de vino base que entran al alambique.";
  else if (input <= 0) e.inputVolumeLiters = "El volumen de entrada debe ser mayor que cero.";
  const abv = v.initialAlcoholPercentage.trim() ? parseDecimal(v.initialAlcoholPercentage) : null;
  if (v.initialAlcoholPercentage.trim() && (abv === null || abv < 0 || abv > 100)) {
    e.initialAlcoholPercentage = "El grado va de 0 a 100 % vol.";
  }
  if (Object.keys(e).length > 0) return { ok: false, errors: e };

  const dto = omitNulls<CreateDistillationBatchDto>({
    fermentationTankId: v.fermentationTankId,
    equipmentIdentifier: v.equipmentIdentifier.trim(),
    processStartDate: v.processStartDate,
    inputVolumeLiters: input!,
    initialAlcoholPercentage: abv,
    closeTank: v.closeTank ? true : null,
    notes: v.notes.trim() || null,
  });
  const parsed = CreateDistillationBatchSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "") as DistillationField;
      if (key in v) e[key] ??= issue.message;
    }
    return { ok: false, errors: e };
  }
  return { ok: true, dto };
}

export const DISTILLATION_FIELDS: readonly DistillationField[] = [
  "fermentationTankId",
  "equipmentIdentifier",
  "processStartDate",
  "inputVolumeLiters",
  "initialAlcoholPercentage",
  "notes",
];

// ---------- Cerrar la destilación (cortes) ----------

export type CloseValues = {
  processEndDate: string;
  headsLiters: string;
  heartLiters: string;
  tailsLiters: string;
  heartAbvPercent: string;
  vinasseLiters: string;
  notes: string;
};
export type CloseField = keyof CloseValues;

export const emptyClose = (endDate: string): CloseValues => ({
  processEndDate: endDate,
  headsLiters: "",
  heartLiters: "",
  tailsLiters: "",
  heartAbvPercent: "",
  vinasseLiters: "",
  notes: "",
});

type CloseResult = { ok: true; dto: CloseDistillationDto } | { ok: false; errors: FieldErrors<CloseField> };

const liters = (s: string, label: string): [number | null, string | undefined] => {
  if (!s.trim()) return [null, undefined];
  const n = parseDecimal(s);
  if (n === null || n < 0) return [null, `${label} debe ser un número positivo.`];
  return [n, undefined];
};

/**
 * `POST /v1/production-batches/{id}/close`: fin de la destilación, cortes y grado del corazón. Que
 * los cortes no superen la entrada (balance de masa) lo comprueba el servidor
 * (`TRC_MASS_BALANCE_EXCEEDED`).
 */
export function toCloseDistillationDto(v: CloseValues, today: Date): CloseResult {
  const e: FieldErrors<CloseField> = {};
  if (!v.processEndDate) e.processEndDate = "Indica la fecha de fin: el reposo cuenta desde ese día.";
  else if (isAfter(v.processEndDate, today)) e.processEndDate = "La fecha no puede ser futura.";

  const [heads, headsErr] = liters(v.headsLiters, "Las cabezas");
  const [heart, heartErr] = liters(v.heartLiters, "El corazón");
  const [tails, tailsErr] = liters(v.tailsLiters, "Las colas");
  const [vinasse, vinasseErr] = liters(v.vinasseLiters, "La vinaza");
  if (headsErr) e.headsLiters = headsErr;
  else if (heads === null) e.headsLiters = "Indica las cabezas (0 si no hubo).";
  if (heartErr) e.heartLiters = heartErr;
  else if (heart === null || heart === 0) e.heartLiters = "El corazón es el singani del lote: indícalo.";
  if (tailsErr) e.tailsLiters = tailsErr;
  else if (tails === null) e.tailsLiters = "Indica las colas (0 si no hubo).";
  if (vinasseErr) e.vinasseLiters = vinasseErr;

  const abv = parseDecimal(v.heartAbvPercent);
  if (abv === null) e.heartAbvPercent = "Indica el grado del corazón.";
  else if (abv <= 0 || abv > 100) e.heartAbvPercent = "El grado va de 0 a 100 % vol.";
  if (v.notes.length > 2000) e.notes = "Las notas admiten hasta 2.000 caracteres.";
  if (Object.keys(e).length > 0) return { ok: false, errors: e };

  const dto = omitNulls<CloseDistillationDto>({
    processEndDate: v.processEndDate,
    cuts: { headsLiters: heads!, heartLiters: heart!, tailsLiters: tails! },
    heartAbvPercent: abv!,
    vinasseLiters: vinasse,
    notes: v.notes.trim() || null,
  });
  const parsed = CloseDistillationSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = closeField(issue.path.map(String).join("."));
      if (key) e[key] ??= issue.message;
    }
    return { ok: false, errors: e };
  }
  return { ok: true, dto };
}

const CLOSE_FIELDS: readonly CloseField[] = [
  "processEndDate",
  "headsLiters",
  "heartLiters",
  "tailsLiters",
  "heartAbvPercent",
  "vinasseLiters",
  "notes",
];

function closeField(field: string): CloseField | undefined {
  const leaf = field.startsWith("cuts.") ? field.slice(5) : field;
  // El balance de masa llega en `cuts`: se marca en el corazón, el corte que decide el lote.
  if (field === "cuts") return "heartLiters";
  return (CLOSE_FIELDS as readonly string[]).includes(leaf) ? (leaf as CloseField) : undefined;
}

/** `details[].field` de un 409/422 del cierre → campos del formulario (`cuts.heartLiters` → corazón). */
export const closeFieldErrors = (error: unknown): FieldErrors<CloseField> =>
  fieldErrorsFrom<CloseField>(error, closeField).fieldErrors;

export const CLOSE_ERROR_FIELDS: readonly string[] = [...CLOSE_FIELDS, "cuts"];
