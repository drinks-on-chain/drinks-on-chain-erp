import {
  CORRECTABLE_FIELDS,
  CreateLotCorrectionSchema,
  VOIDABLE_TARGET_TYPES,
  type Correction,
  type CreateLotCorrectionDto,
  type LotGraphNode,
} from "@drinks-on-chain/mocks";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import type { CorrectionTarget } from "@/lib/erp/permissions";
import { fmtDate, fmtNumber, parseDecimal } from "@/lib/format";

// Correcciones compensatorias (contrato de la Ola 2 §9): un registro no se edita ni se borra; se
// corrige con un registro nuevo que guarda el valor anterior, el nuevo, el motivo y quién lo hizo.
// La lista de campos corregibles es cerrada (la del OpenAPI); el servidor vuelve a validar las
// reglas del lote con cada corrección.

export const TARGET_LABEL: Record<CorrectionTarget, string> = {
  TERROIR: "Parcela",
  HARVEST_BATCH: "Pesaje",
  MATURITY_ANALYSIS: "Análisis de madurez",
  PHYTO_DECISION: "Dictamen fitosanitario",
  FERMENTATION_TANK: "Tanque",
  FERMENTATION_LOG: "Lectura de fermentación",
  TREATMENT: "Tratamiento",
  WINE_AGING: "Crianza",
  PRODUCTION_BATCH: "Destilación",
  BOTTLING: "Embotellado",
  LAB_ANALYSIS: "Análisis de laboratorio",
};

/** Tipo de registro corregible de cada nodo del grafo del lote. */
export const NODE_TARGET: Record<LotGraphNode["type"], CorrectionTarget> = {
  TERROIR: "TERROIR",
  HARVEST_BATCH: "HARVEST_BATCH",
  TANK: "FERMENTATION_TANK",
  WINE_AGING: "WINE_AGING",
  DISTILLATION: "PRODUCTION_BATCH",
  BOTTLING: "BOTTLING",
  LAB_ANALYSIS: "LAB_ANALYSIS",
};

export type FieldKind = "number" | "integer" | "date" | "text";
export type FieldSpec = { key: string; label: string; kind: FieldKind; unit?: string };

const SPEC: Record<string, Omit<FieldSpec, "key">> = {
  altitudeMasl: { label: "Altitud", kind: "number", unit: "m s. n. m." },
  varietyName: { label: "Cepa", kind: "text" },
  rawMaterialType: { label: "Materia prima", kind: "text" },
  grossWeightKg: { label: "Peso bruto", kind: "number", unit: "kg" },
  tareWeightKg: { label: "Tara", kind: "number", unit: "kg" },
  intakeDate: { label: "Fecha del pesaje", kind: "date" },
  temperatureAtIntakeC: { label: "Temperatura al ingreso", kind: "number", unit: "°C" },
  notes: { label: "Notas", kind: "text" },
  brixDegrees: { label: "Grados Brix", kind: "number", unit: "°Bx" },
  ph: { label: "pH", kind: "number" },
  acidityGl: { label: "Acidez total", kind: "number", unit: "g/L" },
  measuredAt: { label: "Fecha de la medición", kind: "date" },
  volumeFilledLiters: { label: "Volumen llenado", kind: "number", unit: "L" },
  finalVolumeLiters: { label: "Volumen final", kind: "number", unit: "L" },
  startDate: { label: "Fecha de inicio", kind: "date" },
  endDate: { label: "Fecha de fin", kind: "date" },
  temperatureCelsius: { label: "Temperatura", kind: "number", unit: "°C" },
  specificGravity: { label: "Densidad", kind: "number" },
  phValue: { label: "pH", kind: "number" },
  recordedAt: { label: "Fecha de la lectura", kind: "date" },
  dosageAppliedGPerHl: { label: "Dosis", kind: "number", unit: "g/hL" },
  totalAppliedG: { label: "Total aplicado", kind: "number", unit: "g" },
  additiveName: { label: "Aditivo", kind: "text" },
  appliedAt: { label: "Fecha de aplicación", kind: "date" },
  plannedMonths: { label: "Meses de crianza", kind: "integer", unit: "meses" },
  volumeLiters: { label: "Volumen", kind: "number", unit: "L" },
  inputVolumeLiters: { label: "Volumen de entrada", kind: "number", unit: "L" },
  headsLiters: { label: "Cabezas", kind: "number", unit: "L" },
  heartLiters: { label: "Corazón", kind: "number", unit: "L" },
  tailsLiters: { label: "Colas", kind: "number", unit: "L" },
  vinasseLiters: { label: "Vinaza", kind: "number", unit: "L" },
  heartAbvPercent: { label: "Grado del corazón", kind: "number", unit: "% vol" },
  processStartDate: { label: "Inicio de la destilación", kind: "date" },
  processEndDate: { label: "Fin de la destilación", kind: "date" },
  finalAlcoholAbv: { label: "Grado alcohólico final", kind: "number", unit: "% vol" },
  bottleType: { label: "Tipo de botella", kind: "text" },
  actualAlcoholAbv: { label: "Grado alcohólico real", kind: "number", unit: "% vol" },
  totalAlcoholAbv: { label: "Grado alcohólico total", kind: "number", unit: "% vol" },
  totalAcidityTartaricGl: { label: "Acidez total", kind: "number", unit: "g/L" },
  volatileAcidityAceticGl: { label: "Acidez volátil", kind: "number", unit: "g/L" },
  freeSulfurDioxideMgL: { label: "SO₂ libre", kind: "number", unit: "mg/L" },
  totalSulfurDioxideMgL: { label: "SO₂ total", kind: "number", unit: "mg/L" },
  reducingSugarsGl: { label: "Azúcares reductores", kind: "number", unit: "g/L" },
  methanolContentMgL: { label: "Metanol (producto)", kind: "number", unit: "mg/L" },
  methanolMg100mlAa: { label: "Metanol (alcohol anhidro)", kind: "number", unit: "mg/100 mL a.a." },
  copperContentMgL: { label: "Cobre", kind: "number", unit: "mg/L" },
  testPerformedAt: { label: "Fecha del análisis", kind: "date" },
};

/**
 * Campos corregibles de un tipo de registro, en el orden del contrato. El remanente del embotellado
 * (`leftover`, un objeto) no se ofrece en el formulario.
 */
export function correctableFields(target: CorrectionTarget): FieldSpec[] {
  return CORRECTABLE_FIELDS[target].filter((key) => key in SPEC).map((key) => ({ key, ...SPEC[key]! }));
}

/** Etiqueta de un campo de una corrección ya registrada (los desconocidos, por su clave). */
export const fieldLabel = (field: string) => SPEC[field]?.label ?? field;

/** Registros que se pueden anular (dejan de contar): análisis, dictámenes, lecturas y tratamientos. */
export const isVoidable = (target: CorrectionTarget) => (VOIDABLE_TARGET_TYPES as readonly string[]).includes(target);

export type CorrectionValues = {
  kind: "AMEND" | "VOID";
  /** Campo → valor nuevo escrito; vacío = sin cambios. */
  changes: Record<string, string>;
  reason: string;
};

export const emptyCorrection = (): CorrectionValues => ({ kind: "AMEND", changes: {}, reason: "" });

export type CorrectionErrors = { changes?: string; reason?: string; fields: Record<string, string> };

type Result = { ok: true; dto: CreateLotCorrectionDto } | { ok: false; errors: CorrectionErrors };

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** Valores del diálogo → `POST /v1/lots/{id}/corrections`. Solo viajan los campos con valor nuevo. */
export function toCorrectionDto(target: { type: CorrectionTarget; id: string }, v: CorrectionValues): Result {
  const errors: CorrectionErrors = { fields: {} };
  const changes: Record<string, unknown> = {};
  if (v.kind === "AMEND") {
    for (const spec of correctableFields(target.type)) {
      const raw = (v.changes[spec.key] ?? "").trim();
      if (!raw) continue;
      if (spec.kind === "text") changes[spec.key] = raw;
      else if (spec.kind === "date") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) changes[spec.key] = raw;
        else errors.fields[spec.key] = "Fecha no válida.";
      } else {
        const n = parseDecimal(raw);
        if (n === null || n < 0) errors.fields[spec.key] = "Escribe un número positivo.";
        else if (spec.kind === "integer" && !Number.isInteger(n))
          errors.fields[spec.key] = "Debe ser un número entero.";
        else changes[spec.key] = n;
      }
    }
    if (Object.keys(changes).length === 0 && Object.keys(errors.fields).length === 0) {
      errors.changes = "Indica al menos un valor nuevo.";
    }
  }
  const reason = v.reason.trim();
  if (reason.length < REASON_MIN) errors.reason = `Explica el motivo (al menos ${REASON_MIN} caracteres).`;
  else if (reason.length > REASON_MAX) errors.reason = `El motivo admite hasta ${REASON_MAX} caracteres.`;
  if (errors.changes || errors.reason || Object.keys(errors.fields).length > 0) return { ok: false, errors };

  const dto: CreateLotCorrectionDto = { target, kind: v.kind, reason, ...(v.kind === "AMEND" ? { changes } : {}) };
  const parsed = CreateLotCorrectionSchema.safeParse(dto);
  if (!parsed.success) {
    return { ok: false, errors: { fields: {}, changes: parsed.error.issues.map((i) => i.message).join(" ") } };
  }
  return { ok: true, dto };
}

/** `details[].field` de un 409/422 (`changes.grossWeightKg`, `reason`) → errores del diálogo. */
export function correctionErrors(error: unknown): CorrectionErrors {
  const out: CorrectionErrors = { fields: {} };
  const { fieldErrors } = fieldErrorsFrom<string>(error, (field) => field);
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (!message) continue;
    if (field === "reason") out.reason = message;
    else if (field === "changes") out.changes = message;
    else out.fields[field.startsWith("changes.") ? field.slice(8) : field] = message;
  }
  return out;
}

const valueText = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "sin valor";
  const spec = SPEC[field];
  if (typeof value === "number")
    return `${fmtNumber(value, Number.isInteger(value) ? 0 : 2)}${spec?.unit ? ` ${spec.unit}` : ""}`;
  if (typeof value === "string")
    return spec?.kind === "date" && /^\d{4}-\d{2}-\d{2}/.test(value) ? fmtDate(value) : value;
  return JSON.stringify(value);
};

/** "Peso bruto: 18.550 kg → 18.600 kg". */
export const changeText = (change: Correction["changes"][number]) =>
  `${fieldLabel(change.field)}: ${valueText(change.field, change.before)} → ${valueText(change.field, change.after)}`;
