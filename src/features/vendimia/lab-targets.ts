import { fmtNumber } from "@/lib/format";

// Objetivos del análisis preliminar de la uva (01-erp §05). Fuera de rango no bloquea el
// registro: la tarjeta se pone en ámbar para que quien dictamina lo vea.

export type LabKey = "brix" | "ph" | "acidity";

export type LabTarget = {
  key: LabKey;
  label: string;
  /** Unidad en el sufijo del campo (vacía para el pH). */
  unit: string;
  min: number;
  max: number;
  /** Decimales al mostrar la lectura. */
  digits: number;
};

export const LAB_TARGETS: Record<LabKey, LabTarget> = {
  brix: { key: "brix", label: "Grados Brix", unit: "°Bx", min: 22, max: 25, digits: 1 },
  ph: { key: "ph", label: "pH", unit: "", min: 3.2, max: 3.6, digits: 2 },
  acidity: { key: "acidity", label: "Acidez total", unit: "g/L", min: 5, max: 7, digits: 1 },
};

export type ReadingState = "empty" | "in" | "low" | "high";

export function readingState(value: number | null | undefined, target: Pick<LabTarget, "min" | "max">): ReadingState {
  if (value == null || !Number.isFinite(value)) return "empty";
  if (value < target.min) return "low";
  if (value > target.max) return "high";
  return "in";
}

/** "Objetivo 22–25" / "g/L · objetivo 5–7" (como en la maqueta). */
export function targetText(t: LabTarget): string {
  const range = `${fmtNumber(t.min, t.min % 1 ? 1 : 0)}–${fmtNumber(t.max, t.max % 1 ? 1 : 0)}`;
  return t.unit === "g/L" ? `g/L · objetivo ${range}` : `Objetivo ${range}`;
}

export function stateText(state: ReadingState): string {
  switch (state) {
    case "in":
      return "En objetivo";
    case "low":
      return "Bajo el objetivo";
    case "high":
      return "Sobre el objetivo";
    case "empty":
      return "Sin lectura";
  }
}

/** Lecturas de un lote de vendimia, en el orden de las tarjetas. */
export function harvestReadings(h: { brixDegrees: number; initialPh: number; initialAcidityGl: number }) {
  return [
    { target: LAB_TARGETS.brix, value: h.brixDegrees },
    { target: LAB_TARGETS.ph, value: h.initialPh },
    { target: LAB_TARGETS.acidity, value: h.initialAcidityGl },
  ];
}

/** Número de lecturas fuera de objetivo (para avisar antes de aprobar). */
export function outOfRangeCount(h: { brixDegrees: number; initialPh: number; initialAcidityGl: number }): number {
  return harvestReadings(h).filter((r) => {
    const s = readingState(r.value, r.target);
    return s === "low" || s === "high";
  }).length;
}
