import { CreateBatchLabAnalysisSchema, type CreateBatchLabAnalysisDto } from "@drinks-on-chain/mocks";
import { parseDecimal } from "./bottling-form-model";

// Certificado de laboratorio del lote embotellado (ISO 17025 / SENASAG): validación del
// formulario con el DTO del backend. El PDF se sube antes (uploads?folder=lab-reports).

export const LAB_NUMBER_FIELDS = [
  { key: "actualAlcoholAbv", label: "Grado alcohólico real", unit: "% vol", required: true, max: 100 },
  { key: "totalAcidityTartaricGl", label: "Acidez total (tartárico)", unit: "g/L", required: true },
  { key: "volatileAcidityAceticGl", label: "Acidez volátil (acético)", unit: "g/L", required: true },
  { key: "freeSulfurDioxideMgL", label: "SO₂ libre", unit: "mg/L" },
  { key: "totalSulfurDioxideMgL", label: "SO₂ total", unit: "mg/L" },
  { key: "reducingSugarsGl", label: "Azúcares reductores", unit: "g/L" },
  { key: "methanolContentMgL", label: "Metanol", unit: "mg/L" },
  { key: "copperContentMgL", label: "Cobre", unit: "mg/L" },
] as const;

type NumberKey = (typeof LAB_NUMBER_FIELDS)[number]["key"];

export type LabFormValues = {
  certifiedLaboratoryName: string;
  accreditedLabCertificationCode: string;
  analysisRequestDate: string;
  testPerformedAt: string;
  conformsToSenasagStandards: boolean;
  conformsToEuStandards: boolean;
  conformsToUsaStandards: boolean;
} & Record<NumberKey, string>;

export type LabField = keyof LabFormValues | "pdf";
export type LabErrors = Partial<Record<LabField, string>>;

export const emptyLabForm = (): LabFormValues => ({
  certifiedLaboratoryName: "",
  accreditedLabCertificationCode: "",
  analysisRequestDate: "",
  testPerformedAt: "",
  conformsToSenasagStandards: false,
  conformsToEuStandards: false,
  conformsToUsaStandards: false,
  actualAlcoholAbv: "",
  totalAcidityTartaricGl: "",
  volatileAcidityAceticGl: "",
  freeSulfurDioxideMgL: "",
  totalSulfurDioxideMgL: "",
  reducingSugarsGl: "",
  methanolContentMgL: "",
  copperContentMgL: "",
});

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Valida y devuelve el DTO sin la URL del PDF (se añade tras subirlo). */
export function validateLab(
  bottlingBatchId: string,
  v: LabFormValues,
  hasPdf: boolean,
): { errors: LabErrors; dto: Omit<CreateBatchLabAnalysisDto, "laboratoryReportPdfUrl"> | null } {
  const errors: LabErrors = {};
  if (!v.certifiedLaboratoryName.trim()) errors.certifiedLaboratoryName = "Indica el laboratorio.";
  if (!v.accreditedLabCertificationCode.trim())
    errors.accreditedLabCertificationCode = "Indica el código de acreditación del laboratorio.";
  if (!isDay(v.testPerformedAt)) errors.testPerformedAt = "Indica la fecha del análisis.";
  if (v.analysisRequestDate && !isDay(v.analysisRequestDate)) errors.analysisRequestDate = "Fecha no válida.";
  if (isDay(v.analysisRequestDate) && isDay(v.testPerformedAt) && v.analysisRequestDate > v.testPerformedAt)
    errors.analysisRequestDate = "La solicitud no puede ser posterior al análisis.";
  if (!hasPdf) errors.pdf = "Adjunta el informe del laboratorio en PDF.";

  const numbers: Partial<Record<NumberKey, number | null>> = {};
  for (const f of LAB_NUMBER_FIELDS) {
    const raw = v[f.key];
    const n = parseDecimal(raw);
    const required = "required" in f && f.required;
    const max = "max" in f ? f.max : undefined;
    if (!raw.trim()) {
      if (required) errors[f.key] = "Obligatorio.";
      numbers[f.key] = null;
    } else if (n === null || n < 0 || (max !== undefined && n > max)) {
      errors[f.key] = max ? `Entre 0 y ${max}.` : "Debe ser un número positivo.";
    } else numbers[f.key] = n;
  }
  if (Object.keys(errors).length > 0) return { errors, dto: null };

  const dto = {
    bottlingBatchId,
    certifiedLaboratoryName: v.certifiedLaboratoryName.trim(),
    accreditedLabCertificationCode: v.accreditedLabCertificationCode.trim(),
    analysisRequestDate: v.analysisRequestDate || null,
    testPerformedAt: v.testPerformedAt,
    actualAlcoholAbv: numbers.actualAlcoholAbv!,
    totalAcidityTartaricGl: numbers.totalAcidityTartaricGl!,
    volatileAcidityAceticGl: numbers.volatileAcidityAceticGl!,
    freeSulfurDioxideMgL: numbers.freeSulfurDioxideMgL ?? null,
    totalSulfurDioxideMgL: numbers.totalSulfurDioxideMgL ?? null,
    reducingSugarsGl: numbers.reducingSugarsGl ?? null,
    methanolContentMgL: numbers.methanolContentMgL ?? null,
    copperContentMgL: numbers.copperContentMgL ?? null,
    conformsToSenasagStandards: v.conformsToSenasagStandards,
    conformsToEuStandards: v.conformsToEuStandards,
    conformsToUsaStandards: v.conformsToUsaStandards,
  };
  // Comprobación final con el esquema del backend (con una URL provisional).
  const parsed = CreateBatchLabAnalysisSchema.safeParse({ ...dto, laboratoryReportPdfUrl: "pendiente" });
  if (!parsed.success) return { errors: { pdf: parsed.error.issues.map((i) => i.message).join(" ") }, dto: null };
  return { errors, dto };
}
