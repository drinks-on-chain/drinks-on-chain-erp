import { CreateHarvestBatchSchema, type CreateHarvestBatchDto, type CreateLotDto } from "@drinks-on-chain/mocks";
import {
  emptyLotForm,
  lotFieldErrors,
  toCreateLotDto,
  type LotFormErrors,
  type LotFormValues,
} from "@/features/lotes/lot-model";
import { parseDecimal } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { omitNulls } from "@/lib/erp/omit-nulls";

// Pesaje (contrato de la Ola 2 §3.2): valores del formulario tal como se escriben, neto en vivo y
// conversión al cuerpo de POST /v1/harvest-batches. El pesaje va separado del análisis de madurez
// (opcional aquí; se registra aparte) y del dictamen fitosanitario (nunca en el alta). La uva
// entra a un lote existente, crea uno (`newLot`) o queda recibida sin lote.

/** `none`: uva recibida sin lote; `new`: crea el lote desde el pesaje; o el id de un lote abierto. */
export type LotChoice = "none" | "new" | (string & {});

export type WeighInValues = {
  lotChoice: LotChoice;
  terroirId: string;
  harvestYear: string;
  /** `YYYY-MM-DDTHH:mm` en UTC (las fechas del ERP se muestran en UTC). */
  intakeDate: string;
  grossWeightKg: string;
  tareWeightKg: string;
  /** Análisis de madurez opcional: o los tres valores, o ninguno. */
  brixDegrees: string;
  initialPh: string;
  initialAcidityGl: string;
  temperatureAtIntakeC: string;
  notes: string;
};

export type WeighInField = keyof WeighInValues;
export type WeighInErrors = Partial<Record<WeighInField, string>>;

/** Valor de un `datetime-local` (UTC, al minuto) para una fecha. */
export const toDateTimeInput = (d: Date) => d.toISOString().slice(0, 16);

export function emptyWeighIn(now: Date, terroirId = "", lotChoice: LotChoice = "none"): WeighInValues {
  return {
    lotChoice,
    terroirId,
    harvestYear: String(now.getUTCFullYear()),
    intakeDate: toDateTimeInput(now),
    grossWeightKg: "",
    tareWeightKg: "",
    brixDegrees: "",
    initialPh: "",
    initialAcidityGl: "",
    temperatureAtIntakeC: "",
    notes: "",
  };
}

/** Lote nuevo desde el pesaje: hereda la añada del pesaje. */
export const emptyWeighInLot = (now: Date): LotFormValues => emptyLotForm(now);

/** Peso neto = bruto − tara; null mientras falte alguno de los dos. */
export function netWeight(gross: string | number, tare: string | number): number | null {
  const g = parseDecimal(gross);
  const t = parseDecimal(tare);
  if (g == null || t == null) return null;
  return Math.round((g - t) * 100) / 100;
}

type Result = { ok: true; dto: CreateHarvestBatchDto } | { ok: false; errors: WeighInErrors; lotErrors: LotFormErrors };

export function toHarvestDto(v: WeighInValues, now: Date, newLot?: LotFormValues): Result {
  const errors: WeighInErrors = {};
  let lotErrors: LotFormErrors = {};
  const year = parseDecimal(v.harvestYear, { grouping: false });
  const gross = parseDecimal(v.grossWeightKg);
  const tare = parseDecimal(v.tareWeightKg);
  const brix = parseDecimal(v.brixDegrees);
  const ph = parseDecimal(v.initialPh, { grouping: false });
  const acidity = parseDecimal(v.initialAcidityGl);
  const temperature = parseDecimal(v.temperatureAtIntakeC, { grouping: false });
  const intake = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.intakeDate) ? new Date(`${v.intakeDate}:00Z`) : null;

  if (!v.terroirId) errors.terroirId = "Elige la parcela de origen.";
  if (year == null || !Number.isInteger(year) || year < 1900 || year > 2100) {
    errors.harvestYear = "Indica el año de cosecha (p. ej. 2026).";
  }
  if (!intake || Number.isNaN(intake.getTime())) errors.intakeDate = "Indica la fecha y hora del ingreso.";
  else if (intake.getTime() > now.getTime() + 60_000) errors.intakeDate = "El ingreso no puede ser posterior a ahora.";

  if (gross == null || gross <= 0) errors.grossWeightKg = "Escribe el peso bruto de la báscula.";
  if (tare == null || tare < 0) errors.tareWeightKg = "Escribe la tara (0 si no hay).";
  else if (gross != null && gross <= tare) errors.tareWeightKg = "La tara debe ser menor que el peso bruto.";

  // El análisis es opcional, pero se registra completo: Brix, pH y acidez juntos.
  const readings = [v.brixDegrees, v.initialPh, v.initialAcidityGl].map((s) => s.trim() !== "");
  const anyReading = readings.some(Boolean);
  if (anyReading) {
    if (brix == null) errors.brixDegrees = "Falta el Brix: el análisis se registra completo.";
    else if (brix < 0 || brix > 40) errors.brixDegrees = "Los grados Brix van de 0 a 40.";
    if (ph == null) errors.initialPh = "Falta el pH: el análisis se registra completo.";
    else if (ph < 2 || ph > 5) errors.initialPh = "El pH de la uva va de 2 a 5.";
    if (acidity == null) errors.initialAcidityGl = "Falta la acidez: el análisis se registra completo.";
    else if (acidity < 0 || acidity > 30) errors.initialAcidityGl = "La acidez va de 0 a 30 g/L.";
  }

  if (v.temperatureAtIntakeC.trim() && (temperature == null || temperature < -10 || temperature > 60)) {
    errors.temperatureAtIntakeC = "La temperatura debe estar entre −10 y 60 °C.";
  }

  let lot: CreateLotDto | null = null;
  if (v.lotChoice === "new") {
    // El lote nace con la añada del pesaje.
    const result = toCreateLotDto({ ...(newLot ?? emptyLotForm(now)), harvestYear: v.harvestYear }, now);
    if (result.ok) lot = result.dto;
    else {
      const { harvestYear, ...rest } = result.errors;
      lotErrors = rest;
      if (harvestYear) errors.harvestYear ??= harvestYear;
    }
  }
  if (Object.keys(errors).length > 0 || Object.keys(lotErrors).length > 0) return { ok: false, errors, lotErrors };

  const dto = omitNulls<CreateHarvestBatchDto>({
    lotId: v.lotChoice !== "none" && v.lotChoice !== "new" ? v.lotChoice : null,
    newLot: lot,
    terroirId: v.terroirId,
    intakeDate: intake!.toISOString(),
    harvestYear: year!,
    grossWeightKg: gross!,
    tareWeightKg: tare!,
    maturity: anyReading ? { brixDegrees: brix!, ph: ph!, acidityGl: acidity! } : null,
    temperatureAtIntakeC: temperature,
    notes: v.notes.trim() || null,
  });
  const parsed = CreateHarvestBatchSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = weighInField(issue.path.map(String).join("."));
      if (key) errors[key] ??= issue.message;
    }
    return { ok: false, errors, lotErrors };
  }
  return { ok: true, dto };
}

const FIELDS = new Set<string>(Object.keys(emptyWeighIn(new Date(0))));

/** Campo del formulario para un `field` del backend (`maturity.ph` → pH, `lotId` → lote…). */
function weighInField(field: string): WeighInField | undefined {
  const map: Record<string, WeighInField> = {
    lotId: "lotChoice",
    "maturity.brixDegrees": "brixDegrees",
    "maturity.ph": "initialPh",
    "maturity.acidityGl": "initialAcidityGl",
  };
  if (map[field]) return map[field];
  return FIELDS.has(field) ? (field as WeighInField) : undefined;
}

/** Lleva los `details[].field` de un 422 del backend a los campos del pesaje. */
export function weighInFieldErrors(error: unknown): WeighInErrors {
  return fieldErrorsFrom<WeighInField>(error, weighInField).fieldErrors;
}

/** Errores del lote nuevo (`newLot.name`…) de un 422 del pesaje. */
export const weighInLotErrors = (error: unknown): LotFormErrors => lotFieldErrors(error, "newLot");

/** Campos que el formulario marca junto al control (los demás detalles van al aviso). */
export const WEIGH_IN_ERROR_FIELDS: readonly string[] = [
  ...FIELDS,
  "lotId",
  "maturity.brixDegrees",
  "maturity.ph",
  "maturity.acidityGl",
  "newLot",
];
