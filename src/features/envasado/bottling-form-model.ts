import { CreateBottlingBatchSchema, type CreateBottlingBatchDto } from "@drinks-on-chain/mocks";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { BottlingSource } from "./sources";

// Validación del formulario de embotellado: el DTO del backend (CreateBottlingBatchSchema)
// más las reglas de 09 §4 (candado de crianza y reposo de 180 días).

export type BottlingFormValues = {
  finalAbv: string;
  waterLiters: string;
  bottles: string;
  formatCl: string;
  bottleType: string;
  bottlingDate: string;
};

export type BottlingField = keyof BottlingFormValues | "source";
export type BottlingErrors = Partial<Record<BottlingField, string>>;

/**
 * Cifra escrita a mano: admite "1.500" o "1 500" (miles) y "40,5" (decimal es-BO) además
 * de "40.5". Devuelve null si está vacía o no es un número.
 */
export function parseDecimal(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Mensaje del candado de una fuente (ámbar, con motivo y fecha: 01-erp §11). */
export function lockMessage(source: BottlingSource): string {
  const reason = source.kind === "crianza" ? "Crianza en curso" : "Reposo obligatorio de 180 días en curso";
  const days = source.daysRemaining === 1 ? "falta 1 día" : `faltan ${fmtNumber(source.daysRemaining)} días`;
  const until = source.unlockAt ? ` hasta el ${fmtDate(source.unlockAt)}` : "";
  return `${reason}${until} (${days}). El embotellado se habilita cuando el candado llegue a cero.`;
}

export function validateBottling(
  source: BottlingSource | null,
  v: BottlingFormValues,
): { errors: BottlingErrors; dto: CreateBottlingBatchDto | null } {
  const errors: BottlingErrors = {};
  if (!source) errors.source = "Elige la crianza o la destilación que se embotella.";
  else if (source.bottled) errors.source = "Esta fuente ya se embotelló.";
  else if (source.locked) errors.source = lockMessage(source);

  const finalAbv = parseDecimal(v.finalAbv);
  const water = parseDecimal(v.waterLiters);
  const bottles = parseDecimal(v.bottles);
  const formatCl = parseDecimal(v.formatCl);

  if (finalAbv === null) errors.finalAbv = "Indica el grado alcohólico final.";
  else if (finalAbv <= 0 || finalAbv > 100) errors.finalAbv = "El grado debe estar entre 0 y 100 % vol.";
  else if (source?.production?.initialAlcoholPercentage && finalAbv > source.production.initialAlcoholPercentage)
    errors.finalAbv = `No puede superar el grado del corazón (${fmtNumber(source.production.initialAlcoholPercentage, 1)} % vol).`;

  if (v.waterLiters.trim() && (water === null || water < 0))
    errors.waterLiters = "El agua añadida no puede ser negativa.";
  if (bottles === null) errors.bottles = "Indica cuántas botellas se llenaron.";
  else if (!Number.isInteger(bottles) || bottles <= 0)
    errors.bottles = "Debe ser un número entero de botellas mayor que cero.";
  if (formatCl === null || formatCl <= 0) errors.formatCl = "Indica el formato de la botella en centilitros.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.bottlingDate)) errors.bottlingDate = "Indica la fecha de embotellado.";

  if (Object.keys(errors).length > 0 || !source) return { errors, dto: null };

  const body: CreateBottlingBatchDto = {
    wineAgingBatchId: source.kind === "crianza" ? source.id : null,
    productionBatchId: source.kind === "destilacion" ? source.id : null,
    productType: source.productType,
    finalAlcoholAbv: finalAbv!,
    waterDilutionLiters: source.productType === "SINGANI" ? (water ?? 0) : null,
    totalBottlesPackaged: bottles!,
    packagingFormatCl: formatCl!,
    bottleType: v.bottleType.trim() || null,
    bottlingDate: v.bottlingDate,
  };
  const parsed = CreateBottlingBatchSchema.safeParse(body);
  if (!parsed.success) {
    return { errors: { source: parsed.error.issues.map((i) => i.message).join(" ") }, dto: null };
  }
  return { errors, dto: parsed.data };
}
