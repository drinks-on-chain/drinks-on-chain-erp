import type { LotProductType, LotStageCode, ProductionReport } from "@drinks-on-chain/mocks";
import type { ProductionReportQuery } from "@/lib/erp/resources";
import { fmtNumber } from "@/lib/format";

// Reporte de producción (contrato de la Ola 2 §11.4): una fila por lote con kilos, litros, botellas,
// mermas por etapa y rendimientos, más los totales por tipo. Todo lo calcula el servidor
// (`GET /v1/traceability/reports/production`); el CSV sale con las mismas columnas y filtros.

export type ReportFilters = {
  /** `AAAA-MM-DD` o vacío. */
  from: string;
  to: string;
  productType: LotProductType | "ALL";
  stage: LotStageCode | "ALL";
};

export const EMPTY_REPORT_FILTERS: ReportFilters = { from: "", to: "", productType: "ALL", stage: "ALL" };

export const hasReportFilters = (f: ReportFilters) =>
  f.from !== "" || f.to !== "" || f.productType !== "ALL" || f.stage !== "ALL";

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Error del rango de fechas, si lo hay (el resto de filtros siempre es válido). */
export function rangeError(f: Pick<ReportFilters, "from" | "to">): string | null {
  if ((f.from && !isDay(f.from)) || (f.to && !isDay(f.to))) return "Fecha no válida.";
  if (f.from && f.to && f.from > f.to) return "La fecha final no puede ser anterior a la inicial.";
  return null;
}

/** Filtros de la pantalla → parámetros del reporte (y de su CSV). */
export function reportQuery(f: ReportFilters): ProductionReportQuery {
  return {
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
    ...(f.productType !== "ALL" ? { productType: f.productType } : {}),
    ...(f.stage !== "ALL" ? { stage: [f.stage] } : {}),
  };
}

const DASH = "—";
const n = (value: number | null | undefined, digits?: number) =>
  value === null || value === undefined ? DASH : fmtNumber(value, digits ?? (Number.isInteger(value) ? 0 : 1));

export const kg = (value: number | null) => (value === null ? DASH : `${n(value)} kg`);
export const liters = (value: number | null) => (value === null ? DASH : `${n(value)} L`);
export const count = (value: number | null) => n(value, 0);
export const ratio = (value: number | null, digits = 2) => n(value, digits);

type Row = ProductionReport["rows"][number];

const LOSS: { key: keyof Row["lossPercentByStage"]; label: string }[] = [
  { key: "fermentation", label: "Fermentación" },
  { key: "transfer", label: "Trasiego" },
  { key: "distillation", label: "Destilación" },
  { key: "bottling", label: "Embotellado" },
];

/** Mermas registradas del lote: "Fermentación 2,4 % · Embotellado 1,7 %"; `null` si no hay ninguna. */
export function lossText(loss: Row["lossPercentByStage"]): string | null {
  const parts = LOSS.filter((l) => loss[l.key] !== null).map((l) => `${l.label} ${fmtNumber(loss[l.key]!, 1)} %`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type TotalsRow = ProductionReport["totals"]["WINE"] & { key: "WINE" | "SINGANI" | "UNDECIDED"; label: string };

const TOTAL_LABEL: Record<TotalsRow["key"], string> = {
  WINE: "Vino",
  SINGANI: "Singani",
  UNDECIDED: "Tipo por decidir",
};

/** Totales por tipo, solo de los tipos con lotes en el reporte. */
export function totalsRows(totals: ProductionReport["totals"]): TotalsRow[] {
  return (["WINE", "SINGANI", "UNDECIDED"] as const)
    .map((key) => ({ key, label: TOTAL_LABEL[key], ...totals[key] }))
    .filter((t) => t.lots > 0);
}
