import { CreateHarvestBatchSchema, type CreateHarvestBatchDto } from "@drinks-on-chain/mocks";
import { parseDecimal } from "@/lib/format";
import { detailPairs } from "@/features/origen/api-details";

// Pesaje (3.1): valores del formulario tal como se escriben, neto en vivo y conversión al
// DTO de POST /v1/harvest-batches. Brix, pH y acidez son obligatorios (09 §8 punto 6).

export type WeighInValues = {
  terroirId: string;
  harvestYear: string;
  /** `YYYY-MM-DDTHH:mm` en UTC (las fechas del ERP se muestran en UTC). */
  intakeDate: string;
  grossWeightKg: string;
  tareWeightKg: string;
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

export function emptyWeighIn(now: Date, terroirId = ""): WeighInValues {
  return {
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

/** Peso neto = bruto − tara; null mientras falte alguno de los dos. */
export function netWeight(gross: string | number, tare: string | number): number | null {
  const g = parseDecimal(gross);
  const t = parseDecimal(tare);
  if (g == null || t == null) return null;
  return Math.round((g - t) * 100) / 100;
}

type Result = { ok: true; dto: CreateHarvestBatchDto } | { ok: false; errors: WeighInErrors };

export function toHarvestDto(v: WeighInValues, now: Date): Result {
  const errors: WeighInErrors = {};
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

  if (brix == null) errors.brixDegrees = "Obligatorio: mide los grados Brix.";
  else if (brix < 0 || brix > 40) errors.brixDegrees = "Los grados Brix van de 0 a 40.";
  if (ph == null) errors.initialPh = "Obligatorio: mide el pH.";
  else if (ph < 0 || ph > 14) errors.initialPh = "El pH va de 0 a 14.";
  if (acidity == null) errors.initialAcidityGl = "Obligatorio: mide la acidez total.";
  else if (acidity < 0 || acidity > 30) errors.initialAcidityGl = "La acidez va de 0 a 30 g/L.";

  if (v.temperatureAtIntakeC.trim() && (temperature == null || temperature < -10 || temperature > 60)) {
    errors.temperatureAtIntakeC = "La temperatura debe estar entre −10 y 60 °C.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const dto: CreateHarvestBatchDto = {
    terroirId: v.terroirId,
    intakeDate: intake!.toISOString(),
    harvestYear: year!,
    grossWeightKg: gross!,
    tareWeightKg: tare!,
    brixDegrees: brix!,
    initialPh: ph!,
    initialAcidityGl: acidity!,
    temperatureAtIntakeC: temperature,
    notes: v.notes.trim() || null,
  };
  const parsed = CreateHarvestBatchSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "") as WeighInField;
      if (key in v) errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, dto };
}

const FIELDS = new Set<string>(Object.keys(emptyWeighIn(new Date(0))));

/** Asigna los `details` de un 400/422 del backend a los campos del pesaje. */
export function weighInFieldErrors(details: unknown): WeighInErrors {
  const errors: WeighInErrors = {};
  for (const [field, message] of detailPairs(details)) {
    if (FIELDS.has(field)) errors[field as WeighInField] ??= message;
  }
  return errors;
}
