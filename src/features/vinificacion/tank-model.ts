import {
  DO_MIN_ALTITUDE_MASL as DO_MIN,
  DO_VARIETY as DO_VARIETY_NAME,
  doEligibility as baseDoEligibility,
} from "@/features/origen/do-eligibility";
import type {
  DestinationType,
  FermentationLog,
  FermentationTankResponse,
  HarvestBatchResponse,
  ProductionBatchResponse,
  TankStatus,
  TerroirResponse,
  WineAgingResponse,
} from "@drinks-on-chain/mocks";
import { TEMP_ALERT_C } from "@/features/dashboard/build-dashboard";
import { isAfter, parseDecimal, type FieldErrors } from "./form-utils";

// Cálculos puros de vinificación (03 §4, 1C; 09 §3 filas 4.1–4.3): mapa de tanques,
// bitácora, aptitud para singani y validación de los formularios.

const DAY = 86_400_000;
const dayStart = (d: Date | string) => {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

export { TEMP_ALERT_C };

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

export function latestLog<T extends Pick<FermentationLog, "recordedAt">>(
  logs: readonly T[] | undefined,
): T | undefined {
  return sortLogsDesc(logs)[0];
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

// La regla vive en features/origen/do-eligibility (≥ 1.600 m, como el backend y 09 §4);
// aquí solo se traduce a frases para explicar por qué no se ofrece la destilación.
export { DO_VARIETY, DO_MIN_ALTITUDE_MASL as DO_MIN_ALTITUDE_M } from "@/features/origen/do-eligibility";

export type DoEligibility = { eligible: boolean; reasons: string[] };

export function doEligibility(
  t: Pick<TerroirResponse, "varietyName" | "altitudeMasl" | "isDoEligible"> | undefined,
): DoEligibility {
  if (!t) return { eligible: false, reasons: ["No se encontró la parcela de origen del lote."] };
  const result = baseDoEligibility(t);
  const reasons = result.reasons.map((r) =>
    r === "variety"
      ? `La D.O. Singani exige ${DO_VARIETY_NAME}; este lote es ${t.varietyName}.`
      : r === "altitude"
        ? `La parcela está a ${t.altitudeMasl.toLocaleString("es-BO")} m; la D.O. exige al menos ${DO_MIN.toLocaleString("es-BO")} m s. n. m.`
        : "La parcela no está certificada como apta para la D.O.",
  );
  return { eligible: result.eligible, reasons };
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
 * Qué viene después según el destino fijado al llenar el tanque. El backend no documenta cómo
 * pasa un tanque a COMPLETED o TRANSFERRED (09 §8 punto 4): se ofrece continuar desde
 * FERMENTING, COMPLETED o TRANSFERRED sin cambiar el estado del tanque.
 */
export function nextStep(
  tank: Pick<FermentationTankResponse, "id" | "status" | "destinationType">,
  agings: readonly Pick<WineAgingResponse, "id" | "fermentationTankId" | "containerCode" | "containerType">[],
  productions: readonly Pick<ProductionBatchResponse, "id" | "fermentationTankId" | "equipmentIdentifier">[],
): NextStep | null {
  const available = tank.status === "FERMENTING" || tank.status === "COMPLETED" || tank.status === "TRANSFERRED";
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

export type NewTankValues = {
  harvestBatchId: string;
  tankCode: string;
  capacityLiters: string;
  material: string;
  volumeFilledLiters: string;
  status: "FILLING" | "FERMENTING";
  startDate: string;
};
export type NewTankField = keyof NewTankValues;

/** Validación del alta de tanque (CreateFermentationTankDto + reglas de la pantalla). */
export function validateNewTank(
  v: NewTankValues,
  ctx: { approvedHarvestIds: ReadonlySet<string>; activeCodes: readonly string[]; today: Date },
): FieldErrors<NewTankField> {
  const e: FieldErrors<NewTankField> = {};
  if (!v.harvestBatchId) e.harvestBatchId = "Elige el lote de vendimia que entra al tanque.";
  else if (!ctx.approvedHarvestIds.has(v.harvestBatchId))
    e.harvestBatchId = "Solo se vinifican lotes con dictamen fitosanitario aprobado.";

  const code = v.tankCode.trim();
  if (!code) e.tankCode = "Indica el código del tanque.";
  else if (ctx.activeCodes.some((c) => c.toLowerCase() === code.toLowerCase()))
    e.tankCode = `${code} está en uso. Vacía el tanque o usa otro código.`;

  const cap = parseDecimal(v.capacityLiters);
  if (cap === null) e.capacityLiters = "Indica la capacidad en litros.";
  else if (cap <= 0) e.capacityLiters = "La capacidad debe ser mayor que cero.";

  const vol = parseDecimal(v.volumeFilledLiters);
  if (vol === null) e.volumeFilledLiters = "Indica los litros de mosto que entran.";
  else if (vol < 0) e.volumeFilledLiters = "El volumen no puede ser negativo.";
  else if (cap !== null && cap > 0 && vol > cap) e.volumeFilledLiters = "El volumen supera la capacidad del tanque.";

  if (!v.startDate) e.startDate = "Indica la fecha de inicio.";
  else if (isAfter(v.startDate, ctx.today)) e.startDate = "La fecha no puede ser futura.";
  return e;
}

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
