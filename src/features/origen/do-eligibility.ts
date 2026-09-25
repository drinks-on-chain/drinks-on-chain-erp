import { fmtNumber } from "@/lib/format";

// Aptitud para la D.O. Singani (01-erp §04, 09 §4). El backend la vuelve a comprobar al
// destilar (422 si la parcela no es apta o está bajo 1.600 m); aquí se anticipa en pantalla.

export const DO_VARIETY = "Moscatel de Alejandría";
/** Altitud mínima de la D.O. El backend rechaza `altitudeMasl < 1600`, así que 1.600 m es apto. */
export const DO_MIN_ALTITUDE_MASL = 1600;

export type DoInput = {
  varietyName: string | null | undefined;
  altitudeMasl: number | null | undefined;
  isDoEligible: boolean | null | undefined;
};

export type DoReason = "variety" | "altitude" | "not-declared";

export type DoEligibility = {
  /** Cumple las tres condiciones: cepa, altitud y aptitud declarada. */
  eligible: boolean;
  /** La cepa no es Moscatel de Alejandría: la D.O. Singani no aplica (parcela de vino). */
  applicable: boolean;
  /** Motivos por los que no es apta, en orden de importancia. */
  reasons: DoReason[];
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function isDoVariety(varietyName: string | null | undefined): boolean {
  return !!varietyName && normalize(varietyName).includes(normalize(DO_VARIETY));
}

export function doEligibility({ varietyName, altitudeMasl, isDoEligible }: DoInput): DoEligibility {
  const reasons: DoReason[] = [];
  const applicable = isDoVariety(varietyName);
  if (!applicable) reasons.push("variety");
  if (altitudeMasl == null || !Number.isFinite(altitudeMasl) || altitudeMasl < DO_MIN_ALTITUDE_MASL) {
    reasons.push("altitude");
  }
  if (!isDoEligible) reasons.push("not-declared");
  return { eligible: reasons.length === 0, applicable, reasons };
}

export function doReasonText(reason: DoReason): string {
  switch (reason) {
    case "variety":
      return `cepa distinta de ${DO_VARIETY}`;
    case "altitude":
      return `altitud < ${fmtNumber(DO_MIN_ALTITUDE_MASL)} m`;
    case "not-declared":
      return "sin aptitud D.O. declarada";
  }
}

/** Texto del badge: "Apto para Singani D.O." o "No apto D.O. · altitud < 1.600 m". */
export function doBadgeText(result: DoEligibility): string {
  if (result.eligible) return "Apto para Singani D.O.";
  return `No apto D.O. · ${doReasonText(result.reasons[0]!)}`;
}
