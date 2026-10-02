import {
  CreateMaturityAnalysisSchema,
  type CreateMaturityAnalysisDto,
  type MaturityAnalysis,
} from "@drinks-on-chain/mocks";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { omitNulls } from "@/lib/erp/omit-nulls";
import { parseDecimal } from "@/lib/format";

// Análisis de madurez de un pesaje (contrato de la Ola 2 §3.3): se registra aparte del pesaje,
// solo por inserción; el último por fecha de medición es el vigente.

export type MaturityValues = {
  brixDegrees: string;
  ph: string;
  acidityGl: string;
  /** `YYYY-MM-DDTHH:mm` en UTC. */
  measuredAt: string;
  notes: string;
};

export type MaturityField = keyof MaturityValues;
export type MaturityErrors = Partial<Record<MaturityField, string>>;

export const emptyMaturity = (now: Date): MaturityValues => ({
  brixDegrees: "",
  ph: "",
  acidityGl: "",
  measuredAt: now.toISOString().slice(0, 16),
  notes: "",
});

type Result = { ok: true; dto: CreateMaturityAnalysisDto } | { ok: false; errors: MaturityErrors };

/** Valores del formulario → `POST …/maturity-analyses`. Rangos del contrato: Brix 0–40, pH 2–5, acidez 0–30 g/L. */
export function toMaturityDto(v: MaturityValues, now: Date): Result {
  const errors: MaturityErrors = {};
  const brix = parseDecimal(v.brixDegrees);
  const ph = parseDecimal(v.ph, { grouping: false });
  const acidity = parseDecimal(v.acidityGl);
  const measured = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.measuredAt) ? new Date(`${v.measuredAt}:00Z`) : null;

  if (brix == null) errors.brixDegrees = "Mide los grados Brix.";
  else if (brix < 0 || brix > 40) errors.brixDegrees = "Los grados Brix van de 0 a 40.";
  if (ph == null) errors.ph = "Mide el pH.";
  else if (ph < 2 || ph > 5) errors.ph = "El pH de la uva va de 2 a 5.";
  if (acidity == null) errors.acidityGl = "Mide la acidez total.";
  else if (acidity < 0 || acidity > 30) errors.acidityGl = "La acidez va de 0 a 30 g/L.";
  if (!measured || Number.isNaN(measured.getTime())) errors.measuredAt = "Indica cuándo se midió.";
  else if (measured.getTime() > now.getTime() + 60_000) errors.measuredAt = "La medición no puede ser futura.";
  if (v.notes.length > 2000) errors.notes = "Las notas admiten hasta 2.000 caracteres.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const dto = omitNulls<CreateMaturityAnalysisDto>({
    brixDegrees: brix!,
    ph: ph!,
    acidityGl: acidity!,
    measuredAt: measured!.toISOString(),
    notes: v.notes.trim() || null,
  });
  const parsed = CreateMaturityAnalysisSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "") as MaturityField;
      if (key in v) errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, dto };
}

export const MATURITY_FIELDS: readonly MaturityField[] = ["brixDegrees", "ph", "acidityGl", "measuredAt", "notes"];

/** `details[].field` de un 422 → campos del análisis. */
export const maturityFieldErrors = (error: unknown): MaturityErrors =>
  fieldErrorsFrom<MaturityField>(error, MATURITY_FIELDS).fieldErrors;

/** Análisis del más reciente al más antiguo por fecha de medición: el primero es el vigente. */
export function sortAnalyses(items: readonly MaturityAnalysis[] | undefined): MaturityAnalysis[] {
  return [...(items ?? [])].sort(
    (a, b) => b.measuredAt.localeCompare(a.measuredAt) || b.recordedAt.localeCompare(a.recordedAt),
  );
}
