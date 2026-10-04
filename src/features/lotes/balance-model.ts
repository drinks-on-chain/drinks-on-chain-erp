import type { BottlingBalance, LotBalance } from "@drinks-on-chain/mocks";
import { fmtNumber } from "@/lib/format";

// Conciliación kilos → litros → botellas del lote (contrato de la Ola 2 §11.3 y §6.1). Todas las
// cifras las calcula el servidor (`GET /v1/lots/{id}/balance`, `POST …/bottling/preview`); aquí
// solo se ordenan en pasos y medidores para pintarlas. Sin React, para probarlo.

const liters = (n: number) => `${fmtNumber(n, Number.isInteger(n) ? 0 : 1)} L`;
const kilos = (n: number) => `${fmtNumber(n, Number.isInteger(n) ? 0 : 1)} kg`;
const percent = (n: number) => `${fmtNumber(n, Number.isInteger(n) ? 0 : 2)} %`;

export type BalanceStep = {
  key: "harvest" | "must" | "baseWine" | "aging" | "heart" | "bottled";
  label: string;
  /** Cifra del paso; `null` = aún no registrada. */
  value: string | null;
  /** Detalle bajo la cifra (rendimiento, cortes, grado…). */
  detail: string | null;
  /** Merma respecto al paso anterior, si el servidor la da. */
  loss: string | null;
};

/** Pasos de la conciliación, en el orden del proceso. Los que no aplican al producto no aparecen. */
export function balanceSteps(b: LotBalance): BalanceStep[] {
  const steps: BalanceStep[] = [];
  const { harvest, must, fermentation } = b;

  const harvestParts = [
    harvest.approvedKg > 0 ? `${kilos(harvest.approvedKg)} aprobados` : null,
    harvest.pendingKg > 0 ? `${kilos(harvest.pendingKg)} sin dictamen` : null,
    harvest.rejectedKg > 0 ? `${kilos(harvest.rejectedKg)} rechazados` : null,
  ].filter(Boolean);
  steps.push({
    key: "harvest",
    label: "Uva",
    value: harvest.netKg > 0 ? kilos(harvest.netKg) : null,
    detail: harvestParts.length > 0 ? harvestParts.join(" · ") : null,
    loss: null,
  });

  steps.push({
    key: "must",
    label: "Mosto",
    value: must.filledLiters > 0 ? liters(must.filledLiters) : null,
    detail: must.litersPerKg != null ? `${fmtNumber(must.litersPerKg, 2)} L por kg de uva` : null,
    loss: null,
  });

  steps.push({
    key: "baseWine",
    label: "Vino base",
    value: fermentation.finalLiters != null ? liters(fermentation.finalLiters) : null,
    detail: fermentation.finalLiters != null ? "Al completar la fermentación" : null,
    loss:
      fermentation.lossLiters != null && fermentation.lossPercent != null
        ? `Merma de fermentación: ${liters(fermentation.lossLiters)} (${percent(fermentation.lossPercent)})`
        : null,
  });

  if (b.aging) {
    steps.push({
      key: "aging",
      label: "Crianza",
      value: liters(b.aging.liters),
      detail: "Vino en barrica o depósito",
      loss: `Merma de trasiego: ${liters(b.aging.lossLiters)}`,
    });
  }

  if (b.distillation) {
    const d = b.distillation;
    steps.push({
      key: "heart",
      label: "Corazón",
      value: d.heartLiters > 0 ? liters(d.heartLiters) : null,
      detail:
        [
          d.heartAbvPercent != null ? `al ${percent(d.heartAbvPercent)} vol` : null,
          d.pureAlcoholLiters != null ? `${liters(d.pureAlcoholLiters)} de alcohol puro` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      loss:
        d.heartLiters > 0
          ? `De ${liters(d.inputLiters)} destilados: cabezas ${liters(d.headsLiters)} · colas ${liters(d.tailsLiters)}`
          : d.inputLiters > 0
            ? `${liters(d.inputLiters)} en destilación`
            : null,
    });
  }

  steps.push({
    key: "bottled",
    label: "Embotellado",
    value: b.bottling ? liters(b.bottling.bottledLiters) : null,
    detail:
      b.bottling && b.projection.basis === "BOTTLED" && b.projection.bottles != null
        ? `${fmtNumber(b.projection.bottles)} botellas`
        : null,
    loss: b.bottling
      ? `Merma de embotellado: ${liters(b.bottling.lossLiters)} (${percent(b.bottling.lossPercent)})`
      : null,
  });
  return steps;
}

const PROJECTION_BASIS: Record<LotBalance["projection"]["basis"], string> = {
  DECLARED: "la estimación declarada por la bodega",
  MUST: "el mosto en los tanques",
  BASE_WINE: "el vino base",
  DISTILLATE: "el corazón de la destilación",
  BOTTLED: "el embotellado",
};

/** "≈ 2.850 botellas, según el corazón de la destilación" (la proyección la calcula el servidor). */
export function projectionText(p: LotBalance["projection"]): string | null {
  if (p.bottles == null) return null;
  return p.basis === "BOTTLED"
    ? `${fmtNumber(p.bottles)} botellas embotelladas`
    : `≈ ${fmtNumber(p.bottles)} botellas, según ${PROJECTION_BASIS[p.basis]}`;
}

export type BalanceMeter = {
  key: "volume" | "loss" | "alcohol";
  label: string;
  value: number;
  max: number;
  /** Cifras del medidor, listas para leer. */
  valueText: string;
  note: string | null;
  /** Por encima del máximo: el servidor rechazará el embotellado. */
  over: boolean;
};

/** Código de la regla que marca cada medidor cuando el servidor la da por incumplida. */
const METER_RULE: Record<BalanceMeter["key"], string> = {
  volume: "TRC_BOTTLING_EXCEEDS_VOLUME",
  loss: "TRC_BOTTLING_LOSS_ABOVE_TOLERANCE",
  alcohol: "TRC_ALCOHOL_BALANCE_EXCEEDED",
};

/**
 * Medidores del balance del embotellado (`BottlingBalance`): volumen embotellado frente a lo
 * disponible, merma frente a la tolerada y, en singani, alcohol puro embotellado frente al del
 * corazón. `violated` son los códigos que devolvió la vista previa: el medidor se resalta solo si
 * el servidor dio su regla por incumplida (aquí no se recalcula ningún umbral).
 */
export function bottlingMeters(b: BottlingBalance, violated: readonly string[] = []): BalanceMeter[] {
  const total = b.availableLiters + b.waterDilutionLiters;
  const over = (key: BalanceMeter["key"]) => violated.includes(METER_RULE[key]);
  const meters: BalanceMeter[] = [
    {
      key: "volume",
      label: "Volumen embotellado",
      value: b.bottledLiters,
      max: Math.max(total, 0),
      valueText: `${liters(b.bottledLiters)} de ${liters(total)}`,
      note: [
        b.waterDilutionLiters > 0
          ? `${liters(b.availableLiters)} de las fuentes + ${liters(b.waterDilutionLiters)} de agua`
          : `${liters(b.availableLiters)} de las fuentes`,
        b.leftoverLiters > 0 ? `remanente declarado: ${liters(b.leftoverLiters)}` : null,
        `caben como máximo ${fmtNumber(b.maxBottles)} botellas`,
      ]
        .filter(Boolean)
        .join(" · "),
      over: over("volume"),
    },
    {
      key: "loss",
      label: "Merma",
      value: Math.max(b.lossPercent, 0),
      max: b.maxLossPercent,
      valueText: `${percent(b.lossPercent)} (${liters(b.lossLiters)}) · tolerada: ${percent(b.maxLossPercent)}`,
      note: "Disponible + agua − embotellado − remanente.",
      over: over("loss"),
    },
  ];
  if (b.pureAlcohol) {
    meters.push({
      key: "alcohol",
      label: "Alcohol puro",
      value: b.pureAlcohol.bottledLiters,
      max: b.pureAlcohol.availableLiters,
      valueText: `${liters(b.pureAlcohol.bottledLiters)} embotellados de ${liters(b.pureAlcohol.availableLiters)} del corazón`,
      note: "El agua no crea alcohol: lo embotellado no puede superar el del corazón (tolerancia de medida del 0,5 %).",
      over: over("alcohol"),
    });
  }
  return meters;
}
