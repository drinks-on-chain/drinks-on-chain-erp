import {
  CreateLotLabAnalysisSchema,
  LAB_UNITS,
  type BatchLabAnalysisResponse,
  type CreateLotLabAnalysisDto,
  type LabConformity,
} from "@drinks-on-chain/mocks";
import type { Tone } from "@drinks-on-chain/ui";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { omitNulls, type Nullable } from "@/lib/erp/omit-nulls";
import { fmtNumber, parseDecimal } from "@/lib/format";

// Laboratorio del lote (contrato de la Ola 2 §8): el análisis se registra sobre el lote embotellado
// y la conformidad la calcula el servidor con los límites de la instantánea de reglas. Aquí va la
// forma del formulario (con las unidades de cada cifra) y los textos de cada comprobación.

type LabCheck = LabConformity["checks"][number];

export const CONFORMITY: Record<LabConformity["status"], { label: string; tone: Tone; detail: string }> = {
  CONFORMING: {
    label: "Conforme",
    tone: "success",
    detail: "Todos los parámetros exigidos cumplen los límites del lote.",
  },
  NON_CONFORMING: {
    label: "No conforme",
    tone: "danger",
    detail: "Algún parámetro está fuera de los límites del lote: el expediente no se puede cerrar.",
  },
  INCOMPLETE: {
    label: "Incompleto",
    tone: "warning",
    detail: "Falta algún parámetro exigido: nunca se da por conforme lo que no se midió.",
  },
};

export const CHECK_RESULT: Record<LabCheck["result"], { label: string; tone: Tone }> = {
  PASS: { label: "Cumple", tone: "success" },
  FAIL: { label: "Fuera de límite", tone: "danger" },
  MISSING: { label: "No medido", tone: "warning" },
  UNIT_UNKNOWN: { label: "Unidad del límite desconocida", tone: "warning" },
};

const PARAMETER: Record<string, string> = {
  metanol: "Metanol",
  cobre: "Cobre",
  acidezVolatil: "Acidez volátil",
  grado: "Grado alcohólico",
};

/** Nombre de un parámetro de la conformidad (`metanol`, `cobre`…); los desconocidos, tal cual. */
export const parameterLabel = (parameter: string) => PARAMETER[parameter] ?? parameter;

const digitsOf = (n: number) => (Number.isInteger(n) ? 0 : 2);

/** "≤ 150 mg/100 mL a.a." · "38 a 46 % vol" · "Sin límite en las reglas del lote". */
export function limitText(limit: LabCheck["limit"]): string {
  if (!limit) return "Sin límite en las reglas del lote";
  const { min, max, unidad } = limit;
  const n = (x: number) => fmtNumber(x, digitsOf(x));
  if (min !== undefined && max !== undefined) return `${n(min)} a ${n(max)} ${unidad}`;
  if (max !== undefined) return `≤ ${n(max)} ${unidad}`;
  if (min !== undefined) return `≥ ${n(min)} ${unidad}`;
  return unidad;
}

export const checkValueText = (c: Pick<LabCheck, "value" | "unit">) =>
  c.value === null ? "No registrado" : `${fmtNumber(c.value, digitsOf(c.value))} ${c.unit}`.trim();

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

type NumberKey =
  | "actualAlcoholAbv"
  | "totalAlcoholAbv"
  | "totalAcidityTartaricGl"
  | "volatileAcidityAceticGl"
  | "freeSulfurDioxideMgL"
  | "totalSulfurDioxideMgL"
  | "reducingSugarsGl"
  | "methanolMg100mlAa"
  | "methanolContentMgL"
  | "copperContentMgL";

export type LabNumberField = {
  key: NumberKey;
  label: string;
  /** Sufijo corto del campo. */
  suffix: string;
  /** Unidad completa del contrato (§8.2), como ayuda. */
  unit: string;
  required?: boolean;
  max?: number;
};

/** Cifras del análisis, con la unidad exacta de cada una (las mismas que devuelve el servidor en `units`). */
export const LAB_NUMBER_FIELDS: readonly LabNumberField[] = [
  {
    key: "actualAlcoholAbv",
    label: "Grado alcohólico real",
    suffix: "% vol",
    unit: LAB_UNITS.actualAlcoholAbv,
    required: true,
    max: 100,
  },
  {
    key: "totalAcidityTartaricGl",
    label: "Acidez total",
    suffix: "g/L",
    unit: LAB_UNITS.totalAcidityTartaricGl,
    required: true,
  },
  {
    key: "volatileAcidityAceticGl",
    label: "Acidez volátil",
    suffix: "g/L",
    unit: LAB_UNITS.volatileAcidityAceticGl,
    required: true,
  },
  {
    key: "methanolMg100mlAa",
    label: "Metanol (alcohol anhidro)",
    suffix: "mg/100 mL a.a.",
    unit: LAB_UNITS.methanolMg100mlAa,
  },
  { key: "methanolContentMgL", label: "Metanol (producto)", suffix: "mg/L", unit: LAB_UNITS.methanolContentMgL },
  { key: "copperContentMgL", label: "Cobre", suffix: "mg/L", unit: LAB_UNITS.copperContentMgL },
  {
    key: "totalAlcoholAbv",
    label: "Grado alcohólico total",
    suffix: "% vol",
    unit: LAB_UNITS.totalAlcoholAbv,
    max: 100,
  },
  { key: "freeSulfurDioxideMgL", label: "SO₂ libre", suffix: "mg/L", unit: LAB_UNITS.freeSulfurDioxideMgL },
  { key: "totalSulfurDioxideMgL", label: "SO₂ total", suffix: "mg/L", unit: LAB_UNITS.totalSulfurDioxideMgL },
  { key: "reducingSugarsGl", label: "Azúcares reductores", suffix: "g/L", unit: LAB_UNITS.reducingSugarsGl },
];

export type LabValues = {
  certifiedLaboratoryName: string;
  accreditedLabCertificationCode: string;
  analysisRequestDate: string;
  testPerformedAt: string;
  /** Declarados por el laboratorio: no los verifica el servidor ni salen en el pasaporte. */
  conformsToEuStandards: boolean;
  conformsToUsaStandards: boolean;
  /** `key` del informe firmado (`POST /v1/uploads`). */
  laboratoryReportKey: string | null;
} & Record<NumberKey, string>;

export type LabField = keyof LabValues;
export type LabErrors = Partial<Record<LabField, string>>;

export const emptyLab = (today: string): LabValues => ({
  certifiedLaboratoryName: "",
  accreditedLabCertificationCode: "",
  analysisRequestDate: "",
  testPerformedAt: today,
  conformsToEuStandards: false,
  conformsToUsaStandards: false,
  laboratoryReportKey: null,
  actualAlcoholAbv: "",
  totalAlcoholAbv: "",
  totalAcidityTartaricGl: "",
  volatileAcidityAceticGl: "",
  freeSulfurDioxideMgL: "",
  totalSulfurDioxideMgL: "",
  reducingSugarsGl: "",
  methanolMg100mlAa: "",
  methanolContentMgL: "",
  copperContentMgL: "",
});

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type Result = { ok: true; dto: CreateLotLabAnalysisDto } | { ok: false; errors: LabErrors };

/**
 * Valores del formulario → `POST /v1/lots/{id}/lab-analyses`. La conformidad no se envía: la
 * calcula el servidor. Qué parámetros exige cada producto (metanol y cobre en singani, acidez
 * volátil en vino) también lo decide él: lo que falte deja el análisis «Incompleto».
 */
export function toLotLabDto(v: LabValues): Result {
  const errors: LabErrors = {};
  if (!v.certifiedLaboratoryName.trim()) errors.certifiedLaboratoryName = "Indica el laboratorio.";
  if (!v.accreditedLabCertificationCode.trim())
    errors.accreditedLabCertificationCode = "Indica el código de acreditación del laboratorio.";
  if (!isDay(v.testPerformedAt)) errors.testPerformedAt = "Indica la fecha del análisis.";
  if (v.analysisRequestDate && !isDay(v.analysisRequestDate)) errors.analysisRequestDate = "Fecha no válida.";
  else if (isDay(v.analysisRequestDate) && isDay(v.testPerformedAt) && v.analysisRequestDate > v.testPerformedAt)
    errors.analysisRequestDate = "La solicitud no puede ser posterior al análisis.";
  if (!v.laboratoryReportKey) errors.laboratoryReportKey = "Adjunta el informe firmado del laboratorio.";

  const numbers = {} as Record<NumberKey, number | null>;
  for (const f of LAB_NUMBER_FIELDS) {
    const raw = v[f.key];
    numbers[f.key] = null;
    if (!raw.trim()) {
      if (f.required) errors[f.key] = "Obligatorio.";
      continue;
    }
    const n = parseDecimal(raw);
    if (n === null || n < 0 || (f.max !== undefined && n > f.max)) {
      errors[f.key] = f.max !== undefined ? `Entre 0 y ${f.max}.` : "Debe ser un número positivo.";
    } else numbers[f.key] = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const draft: Nullable<CreateLotLabAnalysisDto> = {
    certifiedLaboratoryName: v.certifiedLaboratoryName.trim(),
    accreditedLabCertificationCode: v.accreditedLabCertificationCode.trim(),
    analysisRequestDate: v.analysisRequestDate || null,
    testPerformedAt: v.testPerformedAt,
    actualAlcoholAbv: numbers.actualAlcoholAbv!,
    totalAlcoholAbv: numbers.totalAlcoholAbv,
    totalAcidityTartaricGl: numbers.totalAcidityTartaricGl!,
    volatileAcidityAceticGl: numbers.volatileAcidityAceticGl!,
    freeSulfurDioxideMgL: numbers.freeSulfurDioxideMgL,
    totalSulfurDioxideMgL: numbers.totalSulfurDioxideMgL,
    reducingSugarsGl: numbers.reducingSugarsGl,
    methanolMg100mlAa: numbers.methanolMg100mlAa,
    methanolContentMgL: numbers.methanolContentMgL,
    copperContentMgL: numbers.copperContentMgL,
    conformsToEuStandards: v.conformsToEuStandards,
    conformsToUsaStandards: v.conformsToUsaStandards,
    laboratoryReportKey: v.laboratoryReportKey,
  };
  const dto = omitNulls<CreateLotLabAnalysisDto>(draft);
  const parsed = CreateLotLabAnalysisSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = labField(String(issue.path[0] ?? ""));
      if (key) errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, dto };
}

const FIELDS: readonly LabField[] = [
  "certifiedLaboratoryName",
  "accreditedLabCertificationCode",
  "analysisRequestDate",
  "testPerformedAt",
  "laboratoryReportKey",
  ...LAB_NUMBER_FIELDS.map((f) => f.key),
];

function labField(field: string): LabField | undefined {
  if (field === "laboratoryReportPdfUrl") return "laboratoryReportKey";
  return (FIELDS as readonly string[]).includes(field) ? (field as LabField) : undefined;
}

export const LAB_ERROR_FIELDS: readonly string[] = [...FIELDS, "laboratoryReportPdfUrl"];

/** `details[].field` de un 409/422 del análisis → campos del formulario. */
export const labFieldErrors = (error: unknown): LabErrors => fieldErrorsFrom<LabField>(error, labField).fieldErrors;

// ---------------------------------------------------------------------------
// Vista de un análisis
// ---------------------------------------------------------------------------

export type LabValueRow = { key: string; label: string; value: string; unit: string };

/** Cifras registradas de un análisis, cada una con la unidad que declara el servidor (`units`). */
export function labValueRows(lab: BatchLabAnalysisResponse): LabValueRow[] {
  const units = lab.units ?? LAB_UNITS;
  const rows: LabValueRow[] = [];
  for (const f of LAB_NUMBER_FIELDS) {
    const value = lab[f.key];
    if (value === null || value === undefined) continue;
    rows.push({ key: f.key, label: f.label, value: fmtNumber(value, digitsOf(value)), unit: units[f.key] });
  }
  return rows;
}

/** El vigente primero; después, los sustituidos del más reciente al más antiguo. */
export function sortLabs(items: readonly BatchLabAnalysisResponse[] | undefined): BatchLabAnalysisResponse[] {
  return [...(items ?? [])].sort(
    (a, b) =>
      Number(b.current ?? !b.supersededAt) - Number(a.current ?? !a.supersededAt) ||
      b.createdAt.localeCompare(a.createdAt),
  );
}
