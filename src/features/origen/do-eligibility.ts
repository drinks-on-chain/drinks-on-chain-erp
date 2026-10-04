import type { DoCheck, DoEvaluation, DoStatus, EffectiveSetting } from "@drinks-on-chain/mocks";
import { formatSettingValue } from "@/features/ajustes/effective-settings";
import { RULE_SETTINGS, formatRuleValue } from "@/lib/erp/rule-violations";

// Aptitud para la D.O. Singani de una parcela (contrato de la Ola 2 §3.1). La calcula el servidor
// con los valores vigentes de la bodega (altitud mínima y cepas exigidas) y la devuelve en
// `isDoEligible` y `doEvaluation`; el ERP solo la muestra. Lo que se envíe en `isDoEligible` se ignora.

export type DoSubject = { isDoEligible: boolean; doEvaluation?: DoEvaluation | null };

/** Estado de la evaluación; sin detalle (respuestas anidadas), el booleano calculado. */
export function doStatus(t: DoSubject): DoStatus {
  return t.doEvaluation?.status ?? (t.isDoEligible ? "ELIGIBLE" : "NOT_ELIGIBLE");
}

export const isDoApt = (t: DoSubject): boolean => {
  const status = doStatus(t);
  return status === "ELIGIBLE" || status === "ELIGIBLE_BY_EXCEPTION";
};

/** Comprobaciones que la parcela no cumple. */
export const failedChecks = (t: DoSubject): DoCheck[] => (t.doEvaluation?.checks ?? []).filter((c) => !c.pass);

/** "altitud < 1.600 m s. n. m." / "cepa distinta de Moscatel de Alejandría". */
export function doCheckText(check: DoCheck): string {
  const unit = RULE_SETTINGS[check.settingKey]?.unit ?? null;
  return check.rule === "ALTITUDE"
    ? `altitud < ${formatRuleValue(check.required, unit)}`
    : `cepa distinta de ${formatRuleValue(check.required)}`;
}

/**
 * La parcela es de otra cepa: la D.O. Singani no le aplica (parcela de vino). Si además falla la
 * altitud, sigue siendo una parcela de vino.
 */
export const isWineParcel = (t: DoSubject): boolean => failedChecks(t).some((c) => c.rule === "VARIETY");

/** Texto del badge: "Apto para Singani D.O." o "No apto D.O. · altitud < 1.600 m s. n. m.". */
export function doBadgeText(t: DoSubject): string {
  const status = doStatus(t);
  if (status === "ELIGIBLE") return "Apto para Singani D.O.";
  if (status === "ELIGIBLE_BY_EXCEPTION") return "Apto D.O. por excepción legal";
  const failed = failedChecks(t)[0];
  return failed ? `No apto D.O. · ${doCheckText(failed)}` : "No apto D.O.";
}

/**
 * Reglas vigentes de la D.O. que el servidor aplicará al guardar la parcela (altitud mínima y
 * cepas), para mostrarlas junto al formulario. Es información: no se evalúa nada en el cliente.
 */
export function doRuleHints(settings: readonly EffectiveSetting[]): {
  altitude: string | null;
  varieties: string | null;
} {
  const value = (key: string) => {
    const s = settings.find((x) => x.key === key);
    return s ? formatSettingValue(key, s.value) : null;
  };
  return {
    altitude: value("trazabilidad.singani.altitudMinimaMsnm"),
    varieties: value("trazabilidad.singani.variedadesExigidas"),
  };
}
