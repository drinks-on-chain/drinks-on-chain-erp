import { fmtNumber } from "@/lib/format";
import type { BottlingSource } from "./sources";

// Conciliación de rendimiento del embotellado (03 §4, 1E): kilos de uva → litros de vino
// base → litros de corazón → litros al grado final → botellas, con aviso de merma.
// Los pasos sin dato en el backend se marcan como desconocidos; no se inventan cifras.

/** Merma de envasado a partir de la cual se avisa (%). */
export const SHRINKAGE_WARN_PCT = 3;

export type YieldInput = {
  productType: "WINE" | "SINGANI";
  /** Peso neto de la uva (HarvestBatch.netWeightKg). */
  harvestKg: number | null;
  /** Vino base: volumen que entró al alambique o, si no consta, el llenado del tanque. */
  baseWineLiters: number | null;
  /** Singani: litros de corazón (additionalParams.heartYieldLiters u outputVolumeLiters). */
  heartLiters: number | null;
  /** Singani: grado del corazón (initialAlcoholPercentage). */
  heartAbv: number | null;
  /** Vino: litros en crianza (WineAgingBatch.volumeLiters). */
  agingLiters: number | null;
  finalAbv: number | null;
  waterLiters: number | null;
  bottles: number | null;
  formatCl: number | null;
};

export type YieldStep = {
  key: "uva" | "base" | "corazon" | "crianza" | "final" | "botellas";
  label: string;
  value: number | null;
  unit: "kg" | "L" | "ud";
};

export type YieldSummary = {
  steps: YieldStep[];
  /** Litros disponibles para envasar (al grado final). */
  availableLiters: number | null;
  /** Litros efectivamente envasados (botellas × formato). */
  bottledLiters: number | null;
  /** Merma de envasado en %; negativa si se declaran más litros que los disponibles. */
  shrinkagePct: number | null;
  warning: "merma-alta" | "excede-volumen" | null;
  /** Singani: agua para bajar el corazón del grado inicial al final (balance de alcohol). */
  recommendedWaterLiters: number | null;
};

const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function computeYield(input: YieldInput): YieldSummary {
  const { productType, finalAbv, bottles, formatCl } = input;
  const bottledLiters = known(bottles) && known(formatCl) ? (bottles * formatCl) / 100 : null;
  const finalLabel = known(finalAbv)
    ? `A ${fmtNumber(finalAbv, Number.isInteger(finalAbv) ? 0 : 1)} % vol`
    : "Al grado final";

  let availableLiters: number | null = null;
  let recommendedWaterLiters: number | null = null;
  const steps: YieldStep[] = [
    { key: "uva", label: "Uva", value: known(input.harvestKg) ? input.harvestKg : null, unit: "kg" },
  ];

  if (productType === "SINGANI") {
    const { heartLiters, heartAbv, waterLiters } = input;
    if (known(heartLiters) && known(heartAbv) && known(finalAbv)) {
      // El alcohol puro se conserva al diluir: V1·%1 = V2·%2.
      availableLiters = (heartLiters * heartAbv) / finalAbv;
      recommendedWaterLiters = heartAbv > finalAbv ? availableLiters - heartLiters : 0;
    } else if (known(heartLiters) && typeof waterLiters === "number" && waterLiters >= 0) {
      availableLiters = heartLiters + waterLiters;
    }
    steps.push(
      { key: "base", label: "Vino base", value: known(input.baseWineLiters) ? input.baseWineLiters : null, unit: "L" },
      { key: "corazon", label: "Corazón", value: known(heartLiters) ? heartLiters : null, unit: "L" },
      { key: "final", label: finalLabel, value: availableLiters, unit: "L" },
    );
  } else {
    availableLiters = known(input.agingLiters)
      ? input.agingLiters
      : known(input.baseWineLiters)
        ? input.baseWineLiters
        : null;
    steps.push(
      {
        key: "base",
        label: "Vino en tanque",
        value: known(input.baseWineLiters) ? input.baseWineLiters : null,
        unit: "L",
      },
      { key: "crianza", label: "En crianza", value: known(input.agingLiters) ? input.agingLiters : null, unit: "L" },
    );
  }
  steps.push({ key: "botellas", label: "Botellas", value: known(bottles) ? bottles : null, unit: "ud" });

  const shrinkagePct =
    availableLiters !== null && bottledLiters !== null
      ? ((availableLiters - bottledLiters) / availableLiters) * 100
      : null;
  // Tolerancia de medio punto: redondeos de formato y de lectura del caudalímetro.
  const warning =
    shrinkagePct === null
      ? null
      : shrinkagePct > SHRINKAGE_WARN_PCT
        ? "merma-alta"
        : shrinkagePct < -0.5
          ? "excede-volumen"
          : null;

  return { steps, availableLiters, bottledLiters, shrinkagePct, warning, recommendedWaterLiters };
}

/** Datos de la cadena que alimentan la conciliación para una fuente. */
export function yieldInputFromSource(
  source: BottlingSource,
  form: Pick<YieldInput, "finalAbv" | "waterLiters" | "bottles" | "formatCl">,
): YieldInput {
  const p = source.production;
  return {
    productType: source.productType,
    harvestKg: source.harvest?.netWeightKg ?? null,
    baseWineLiters: p?.inputVolumeLiters ?? source.tank?.volumeFilledLiters ?? null,
    heartLiters: p ? (p.additionalParams?.heartYieldLiters ?? p.outputVolumeLiters ?? null) : null,
    heartAbv: p?.initialAlcoholPercentage ?? null,
    agingLiters: source.aging?.volumeLiters ?? null,
    ...form,
  };
}
