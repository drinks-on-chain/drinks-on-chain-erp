import {
  CompleteFermentationTankSchema,
  CreateFermentationTankSchema,
  type BifurcationDestination,
  type CompleteFermentationTankDto,
  type CreateFermentationTankDto,
  type CreateLotDto,
  type DestinationType,
  type FermentationLog,
  type FermentationTankResponse,
  type HarvestBatchResponse,
  type ProductionBatchResponse,
  type TankStatus,
  type TerroirResponse,
  type WineAgingResponse,
} from "@drinks-on-chain/mocks";
import {
  emptyLotForm,
  lotFieldErrors,
  toCreateLotDto,
  type LotFormErrors,
  type LotFormValues,
} from "@/features/lotes/lot-model";
import { doCheckText, failedChecks, isDoApt, type DoSubject } from "@/features/origen/do-eligibility";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { omitNulls } from "@/lib/erp/omit-nulls";
import { isAfter, type FieldErrors } from "./form-utils";
import { parseDecimal } from "@/lib/format";

// Cálculos puros de vinificación (03 §4, 1C; contrato de la Ola 2 §4): mapa de tanques, bitácora,
// alta con entradas por pesaje, transiciones por acciones y bifurcación al completar.

const DAY = 86_400_000;
const dayStart = (d: Date | string) => {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

/**
 * Temperatura de fermentación a partir de la cual el mapa de tanques avisa (°C). La alerta del
 * panel (> 32 °C o 48 h sin lecturas) la calcula el servidor.
 */
export const TEMP_ALERT_C = 26;

import { activeOnly, type Voidable } from "@/lib/erp/voided";

/** Porcentaje de llenado (0–100) a partir de `volumeFilledLiters / capacityLiters`. */
export function fillPercent(t: Pick<FermentationTankResponse, "capacityLiters" | "volumeFilledLiters">): number {
  const cap = t.capacityLiters ?? 0;
  const vol = t.volumeFilledLiters ?? 0;
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((vol / cap) * 100)));
}

/** Lecturas de la más reciente a la más antigua. */
export function sortLogsDesc<T extends Pick<FermentationLog, "recordedAt">>(logs: readonly T[] | undefined): T[] {
  return [...(logs ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

/** Última lectura que cuenta: las anuladas por una corrección quedan fuera. */
export function latestLog<T extends Pick<FermentationLog, "recordedAt"> & Voidable>(
  logs: readonly T[] | undefined,
): T | undefined {
  return sortLogsDesc(activeOnly(logs))[0];
}

/** Temperatura por encima del umbral del panel (> 26 °C). */
export const isHot = (log: Pick<FermentationLog, "temperatureCelsius"> | undefined) =>
  !!log && log.temperatureCelsius > TEMP_ALERT_C;

/** Día de fermentación (el día de inicio es el día 1). null si el tanque no fermenta. */
export function fermentationDay(t: Pick<FermentationTankResponse, "status" | "startDate">, today: Date): number | null {
  if (t.status !== "FERMENTING") return null;
  return Math.max(1, Math.floor((dayStart(today) - dayStart(t.startDate)) / DAY) + 1);
}

// ---------- Nombre del lote ----------

export type LotLookup = {
  harvestById: Map<string, HarvestBatchResponse>;
  terroirById: Map<string, TerroirResponse>;
};

export function lotLookup(
  harvestBatches: readonly HarvestBatchResponse[] = [],
  terroirs: readonly TerroirResponse[] = [],
): LotLookup {
  return {
    harvestById: new Map(harvestBatches.map((h) => [h.id, h])),
    terroirById: new Map(terroirs.map((t) => [t.id, t])),
  };
}

export function terroirOfHarvest(lookup: LotLookup, harvestBatchId: string): TerroirResponse | undefined {
  const h = lookup.harvestById.get(harvestBatchId);
  return h ? lookup.terroirById.get(h.terroirId) : undefined;
}

/** "Cuartel 2 · Los Sauces · Moscatel de Alejandría" o, si falta el terroir, el código del lote. */
export function lotName(lookup: LotLookup, harvestBatchId: string): string {
  const t = terroirOfHarvest(lookup, harvestBatchId);
  if (t) return `${t.parcelName} · ${t.varietyName}`;
  return lookup.harvestById.get(harvestBatchId)?.harvestBatchCode ?? "Lote sin datos";
}

// ---------- Mapa de tanques ----------

export type TankCardModel = {
  id: string;
  tankCode: string;
  status: TankStatus;
  destination: DestinationType | null;
  lotName: string;
  harvestBatchCode: string | null;
  fillPct: number;
  volumeLiters: number | null;
  capacityLiters: number | null;
  /** Última temperatura (solo tanques en fermentación con lecturas). */
  temperature: number | null;
  lastReadingAt: string | null;
  hot: boolean;
  day: number | null;
};

export function buildTankCards(input: {
  tanks: readonly FermentationTankResponse[];
  lookup: LotLookup;
  /** Lecturas por tanque (solo de los que se pidió el detalle). */
  logsByTank: Map<string, readonly FermentationLog[]>;
  today: Date;
}): TankCardModel[] {
  const { tanks, lookup, logsByTank, today } = input;
  return sortTanks(tanks).map((t) => {
    const last = t.status === "FERMENTING" ? latestLog(logsByTank.get(t.id)) : undefined;
    return {
      id: t.id,
      tankCode: t.tankCode,
      status: t.status,
      destination: t.destinationType ?? null,
      lotName: lotName(lookup, t.harvestBatchId),
      harvestBatchCode: lookup.harvestById.get(t.harvestBatchId)?.harvestBatchCode ?? null,
      fillPct: fillPercent(t),
      volumeLiters: t.volumeFilledLiters ?? null,
      capacityLiters: t.capacityLiters ?? null,
      temperature: last?.temperatureCelsius ?? null,
      lastReadingAt: last?.recordedAt ?? null,
      hot: isHot(last),
      day: fermentationDay(t, today),
    };
  });
}

const STATUS_ORDER: Record<TankStatus, number> = {
  FERMENTING: 0,
  FILLING: 1,
  COMPLETED: 2,
  TRANSFERRED: 3,
  CLEANED: 4,
};

/** Primero lo que está vivo (fermentando, llenando, por continuar); dentro, por código. */
export function sortTanks<T extends Pick<FermentationTankResponse, "status" | "tankCode">>(tanks: readonly T[]): T[] {
  return [...tanks].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.tankCode.localeCompare(b.tankCode, "es", { numeric: true }),
  );
}

export type TankFilter = { status: TankStatus | "ALL"; destination: DestinationType | "ALL" };

export function filterTanks<T extends { status: TankStatus; destination: DestinationType | null }>(
  tanks: readonly T[],
  f: TankFilter,
): T[] {
  return tanks.filter(
    (t) =>
      (f.status === "ALL" || t.status === f.status) && (f.destination === "ALL" || t.destination === f.destination),
  );
}

// ---------- Aptitud D.O. Singani ----------

export type DoEligibility = { eligible: boolean; reasons: string[] };

/**
 * Aptitud D.O. de la parcela tal como la calcula el servidor (`doEvaluation`), en frases. Solo
 * orienta: quien decide es el servidor, con la instantánea del lote, al completar la fermentación
 * y al destilar (422 `TRC_DO_NOT_ELIGIBLE`).
 */
export function doEligibility(t: (DoSubject & Pick<TerroirResponse, "parcelName">) | undefined): DoEligibility {
  if (!t) return { eligible: false, reasons: ["No se encontró la parcela de origen del lote."] };
  const reasons = failedChecks(t).map((c) => `${t.parcelName}: ${doCheckText(c)}`);
  return { eligible: isDoApt(t), reasons };
}

// ---------- Siguiente paso tras la fermentación ----------

export type NextStep = {
  kind: "crianza" | "destilacion";
  label: string;
  /** Alta de la etapa siguiente con el tanque preseleccionado. */
  href: string;
  /** Crianzas o destilaciones que ya salieron de este tanque. */
  existing: { id: string; href: string; label: string }[];
  /** false si el tanque aún no puede continuar (llenando o vacío). */
  available: boolean;
};

/**
 * Qué viene después según el destino decidido al completar la fermentación (bifurcación, contrato
 * de la Ola 2 §4.3): crianza del vino o destilación del singani. Solo desde un tanque `COMPLETED`
 * (o `TRANSFERRED` con volumen aún por destilar); sin destino no hay paso.
 */
export function nextStep(
  tank: Pick<FermentationTankResponse, "id" | "status" | "destinationType">,
  agings: readonly Pick<WineAgingResponse, "id" | "fermentationTankId" | "containerCode" | "containerType">[],
  productions: readonly Pick<ProductionBatchResponse, "id" | "fermentationTankId" | "equipmentIdentifier">[],
): NextStep | null {
  const available = tank.status === "COMPLETED" || tank.status === "TRANSFERRED";
  if (tank.destinationType === "WINE_AGING") {
    const existing = agings
      .filter((a) => a.fermentationTankId === tank.id)
      .map((a) => ({ id: a.id, href: `/crianza/${a.id}`, label: a.containerCode ?? a.containerType }));
    return {
      kind: "crianza",
      label: "Pasar a crianza",
      href: `/crianza/nueva?tanque=${tank.id}`,
      existing,
      // Una crianza por tanque: si ya existe, se va a verla.
      available: available && existing.length === 0,
    };
  }
  if (tank.destinationType === "SINGANI_DIST") {
    const existing = productions
      .filter((p) => p.fermentationTankId === tank.id)
      .map((p) => ({ id: p.id, href: `/destilacion/${p.id}`, label: p.equipmentIdentifier }));
    return {
      kind: "destilacion",
      label: "Pasar a destilación",
      href: `/destilacion/nueva?tanque=${tank.id}`,
      existing,
      // Un tanque puede pasar por el alambique en varias tandas.
      available,
    };
  }
  return null;
}

// ---------- Formularios ----------

/** Siguiente código libre "TK-NN" a partir de los existentes. */
export function suggestTankCode(codes: readonly string[]): string {
  const nums = codes
    .map((c) => /^TK-(\d+)$/i.exec(c)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `TK-${String(next).padStart(2, "0")}`;
}

/** `auto`: el lote de la uva elegida; `new`: crea el lote desde el tanque; o el id de un lote abierto. */
export type TankLotChoice = "auto" | "new" | (string & {});

export type NewTankValues = {
  /** Kilos que entran de cada pesaje elegido (por su id), tal como se escriben. */
  inputs: Record<string, string>;
  lotChoice: TankLotChoice;
  tankCode: string;
  capacityLiters: string;
  material: string;
  volumeFilledLiters: string;
  /** `true`: el tanque nace fermentando; `false`: llenando. */
  startFermentation: boolean;
  startDate: string;
};
export type NewTankField = "inputs" | "lotChoice" | "tankCode" | "capacityLiters" | "volumeFilledLiters" | "startDate";

type TankHarvest = Pick<HarvestBatchResponse, "id" | "lotId" | "harvestYear" | "availableKg" | "netWeightKg">;

type NewTankResult =
  | { ok: true; dto: CreateFermentationTankDto }
  | { ok: false; errors: FieldErrors<NewTankField>; inputErrors: Record<string, string>; lotErrors: LotFormErrors };

/** Lote que ya tiene la uva elegida (el primero que aparezca), o `null` si es uva sin lote. */
export function lotOfInputs(inputs: Record<string, string>, harvests: readonly TankHarvest[]): string | null {
  return harvests.find((h) => h.id in inputs && h.lotId)?.lotId ?? null;
}

/**
 * Valores del formulario → `POST /v1/fermentation-tanks` (contrato de la Ola 2 §4.1). Solo valida
 * forma y que no falte nada: dictamen, mezcla de lotes, kilos disponibles, capacidad y código en
 * uso los decide el servidor y los explica `RuleViolationNotice`. El destino no se envía: se
 * decide al completar la fermentación.
 */
export function toCreateTankDto(
  v: NewTankValues,
  ctx: { harvests: readonly TankHarvest[]; today: Date; newLot?: LotFormValues },
): NewTankResult {
  const errors: FieldErrors<NewTankField> = {};
  const inputErrors: Record<string, string> = {};
  let lotErrors: LotFormErrors = {};
  const chosen = ctx.harvests.filter((h) => h.id in v.inputs);

  if (chosen.length === 0) errors.inputs = "Elige al menos un pesaje: es la uva que entra al tanque.";
  const inputs = chosen.map((h) => {
    const raw = v.inputs[h.id] ?? "";
    const kg = raw.trim() ? parseDecimal(raw) : null;
    if (raw.trim() && (kg === null || kg <= 0)) inputErrors[h.id] = "Indica los kilos que entran (mayor que cero).";
    // Sin cifra, entra todo lo disponible del pesaje (lo calcula el servidor).
    return omitNulls<{ harvestBatchId: string; kg?: number }>({ harvestBatchId: h.id, kg });
  });

  const code = v.tankCode.trim();
  if (!code) errors.tankCode = "Indica el código del tanque.";
  const cap = v.capacityLiters.trim() ? parseDecimal(v.capacityLiters) : null;
  if (v.capacityLiters.trim() && (cap === null || cap <= 0))
    errors.capacityLiters = "La capacidad debe ser mayor que cero.";
  const vol = parseDecimal(v.volumeFilledLiters);
  if (vol === null) errors.volumeFilledLiters = "Indica los litros de mosto que entran.";
  else if (vol < 0) errors.volumeFilledLiters = "El volumen no puede ser negativo.";
  if (!v.startDate) errors.startDate = "Indica la fecha de inicio.";
  else if (isAfter(v.startDate, ctx.today)) errors.startDate = "La fecha no puede ser futura.";

  const existingLot = lotOfInputs(v.inputs, ctx.harvests);
  let newLot: CreateLotDto | null = null;
  let lotId: string | null = null;
  if (!existingLot && chosen.length > 0) {
    if (v.lotChoice === "new") {
      // El lote nace con la añada de la uva que entra.
      const year = String(chosen[0]!.harvestYear);
      const result = toCreateLotDto({ ...(ctx.newLot ?? emptyLotForm(ctx.today)), harvestYear: year }, ctx.today);
      if (result.ok) newLot = result.dto;
      else lotErrors = result.errors;
    } else if (v.lotChoice === "auto") {
      errors.lotChoice = "La uva elegida no tiene lote: elige uno o crea uno nuevo.";
    } else {
      lotId = v.lotChoice;
    }
  }

  const failed =
    Object.keys(errors).length > 0 || Object.keys(inputErrors).length > 0 || Object.keys(lotErrors).length > 0;
  if (failed) return { ok: false, errors, inputErrors, lotErrors };

  const dto = omitNulls<CreateFermentationTankDto>({
    lotId,
    newLot,
    inputs,
    tankCode: code,
    capacityLiters: cap,
    material: v.material.trim() || null,
    volumeFilledLiters: vol!,
    startFermentation: v.startFermentation,
    startDate: v.startDate,
  });
  const parsed = CreateFermentationTankSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = tankField(issue.path.map(String).join("."));
      if (key) errors[key] ??= issue.message;
    }
    return { ok: false, errors, inputErrors, lotErrors };
  }
  return { ok: true, dto };
}

const TANK_FIELDS: readonly NewTankField[] = [
  "inputs",
  "lotChoice",
  "tankCode",
  "capacityLiters",
  "volumeFilledLiters",
  "startDate",
];

function tankField(field: string): NewTankField | undefined {
  if (field === "lotId") return "lotChoice";
  const root = field.split(".")[0]!;
  // `harvestBatchId` es la entrada única de la ruta legada.
  if (root === "harvestBatchId") return "inputs";
  return (TANK_FIELDS as readonly string[]).includes(root) ? (root as NewTankField) : undefined;
}

/** `details[].field` de un 409/422 → campos del alta de tanque (`inputs.0.kg` marca la uva). */
export const tankFieldErrors = (error: unknown): FieldErrors<NewTankField> =>
  fieldErrorsFrom<NewTankField>(error, tankField).fieldErrors;

/** Errores del lote nuevo (`newLot.name`…) de un 422 del alta de tanque. */
export const tankLotErrors = (error: unknown): LotFormErrors => lotFieldErrors(error, "newLot");

/** Campos que el formulario marca junto al control (lo demás va al aviso). */
export const TANK_ERROR_FIELDS: readonly string[] = [...TANK_FIELDS, "lotId", "harvestBatchId", "newLot"];

// ---------- Completar la fermentación (bifurcación) ----------

export type CompleteTankValues = { endDate: string; finalVolumeLiters: string };
export type CompleteTankField = keyof CompleteTankValues;

type CompleteResult =
  { ok: true; dto: CompleteFermentationTankDto } | { ok: false; errors: FieldErrors<CompleteTankField> };

/** `POST …/complete`: fin de la fermentación, volumen final y destino (vino o singani). */
export function toCompleteTankDto(
  v: CompleteTankValues,
  destination: BifurcationDestination,
  today: Date,
): CompleteResult {
  const errors: FieldErrors<CompleteTankField> = {};
  const volume = parseDecimal(v.finalVolumeLiters);
  if (volume === null) errors.finalVolumeLiters = "Indica los litros que quedan en el tanque.";
  else if (volume < 0) errors.finalVolumeLiters = "El volumen no puede ser negativo.";
  if (!v.endDate) errors.endDate = "Indica la fecha en que terminó la fermentación.";
  else if (isAfter(v.endDate, today)) errors.endDate = "La fecha no puede ser futura.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const dto: CompleteFermentationTankDto = { endDate: v.endDate, finalVolumeLiters: volume!, destination };
  const parsed = CompleteFermentationTankSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "") as CompleteTankField;
      if (key in v) errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, dto };
}

export const COMPLETE_TANK_FIELDS: readonly CompleteTankField[] = ["endDate", "finalVolumeLiters"];

export const completeTankFieldErrors = (error: unknown): FieldErrors<CompleteTankField> =>
  fieldErrorsFrom<CompleteTankField>(error, COMPLETE_TANK_FIELDS).fieldErrors;

export type LogValues = {
  temperatureCelsius: string;
  specificGravity: string;
  phValue: string;
  co2Observations: string;
  recordedAt: string;
  notes: string;
};
export type LogField = keyof LogValues;

/** Validación de la lectura diaria (CreateFermentationLogDto). */
export function validateLog(v: LogValues, today: Date): FieldErrors<LogField> {
  const e: FieldErrors<LogField> = {};
  const temp = parseDecimal(v.temperatureCelsius);
  if (temp === null) e.temperatureCelsius = "La temperatura es obligatoria.";
  else if (temp < -10 || temp > 50) e.temperatureCelsius = "Revisa la temperatura: debe estar entre −10 y 50 °C.";

  if (v.specificGravity.trim()) {
    // La densidad lleva tres decimales: "1.048" es 1,048, no mil cuarenta y ocho.
    const sg = parseDecimal(v.specificGravity, { grouping: false });
    if (sg === null || sg < 0.9 || sg > 1.2) e.specificGravity = "La densidad va de 0,900 a 1,200 (p. ej. 1,048).";
  }
  if (v.phValue.trim()) {
    const ph = parseDecimal(v.phValue);
    if (ph === null || ph < 0 || ph > 14) e.phValue = "El pH va de 0 a 14.";
  }
  if (!v.recordedAt) e.recordedAt = "Indica la fecha y hora de la lectura.";
  else if (isAfter(v.recordedAt, new Date(today.getTime() + 60_000))) e.recordedAt = "La lectura no puede ser futura.";
  return e;
}

export type TreatmentValues = {
  treatmentType: string;
  additiveName: string;
  additiveSupplier: string;
  dosageAppliedGPerHl: string;
  totalAppliedG: string;
  regulatoryAuthCode: string;
  appliedAt: string;
  notes: string;
};
export type TreatmentField = keyof TreatmentValues;

/** Validación del tratamiento enológico (CreateEnologicalTreatmentDto). */
export function validateTreatment(v: TreatmentValues, today: Date): FieldErrors<TreatmentField> {
  const e: FieldErrors<TreatmentField> = {};
  if (!v.treatmentType) e.treatmentType = "Elige el tipo de tratamiento.";
  if (!v.additiveName.trim()) e.additiveName = "Indica el aditivo aplicado.";
  const dose = parseDecimal(v.dosageAppliedGPerHl);
  if (dose === null) e.dosageAppliedGPerHl = "Indica la dosis en g/hL.";
  else if (dose < 0) e.dosageAppliedGPerHl = "La dosis no puede ser negativa.";
  if (v.totalAppliedG.trim()) {
    const total = parseDecimal(v.totalAppliedG);
    if (total === null || total < 0) e.totalAppliedG = "El total debe ser un número positivo.";
  }
  if (!v.regulatoryAuthCode.trim()) e.regulatoryAuthCode = "El código de autorización SENASAG es obligatorio.";
  if (!v.appliedAt) e.appliedAt = "Indica la fecha de aplicación.";
  else if (isAfter(v.appliedAt, today)) e.appliedAt = "La fecha no puede ser futura.";
  return e;
}

/** Total aplicado sugerido: dosis (g/hL) × volumen (L) / 100. */
export const suggestedTotalG = (doseGPerHl: number, volumeLiters: number) =>
  Math.round(((doseGPerHl * volumeLiters) / 100) * 10) / 10;
