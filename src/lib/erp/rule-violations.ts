import type { RuleViolation } from "@/lib/api/rule-violations";
import { fmtDate, fmtNumber } from "@/lib/format";

// Explicación de cada regla incumplida (contrato de la Ola 2 §13). El ERP no decide ni recalcula
// nada: traduce lo que el servidor devuelve (`code`, `rule`, `expected`, `actual`, `meta`) a un
// título, unas cifras y qué se puede hacer. Sin React, para probarlo con cada código.

export type ViolationFact = { label: string; value: string };

export type ExplainedViolation = {
  code: string;
  /** Qué regla se incumple, en pocas palabras. */
  title: string;
  /** Mensaje del servidor. */
  message: string;
  /** Parámetro de la instantánea del lote que lo exige. */
  rule: string | null;
  /** Cifras: exigido, registrado, fecha en que se podrá… */
  facts: ViolationFact[];
  /** Qué hacer a continuación. */
  hint: string | null;
};

/** Parámetros de la instantánea de reglas del lote (`LotRules`), con su unidad. */
export const RULE_SETTINGS: Record<string, { label: string; unit: string | null }> = {
  "trazabilidad.singani.altitudMinimaMsnm": {
    label: "Altitud mínima de la parcela (D.O. Singani)",
    unit: "m s. n. m.",
  },
  "trazabilidad.singani.variedadesExigidas": { label: "Cepas admitidas (D.O. Singani)", unit: null },
  "trazabilidad.singani.reposoMinimoDias": { label: "Reposo mínimo tras la destilación", unit: "días" },
  "trazabilidad.vino.crianzaMinimaMeses": { label: "Crianza mínima del vino", unit: "meses" },
  "trazabilidad.fitosanitario.exigirAprobado": { label: "Dictamen fitosanitario aprobado para fermentar", unit: null },
  "trazabilidad.embotellado.mermaMaximaPorcentaje": { label: "Merma máxima tolerada al embotellar", unit: "%" },
  "trazabilidad.laboratorio.limites": { label: "Límites de laboratorio", unit: null },
};

export const ruleLabel = (key: string | null | undefined): string | null =>
  key ? (RULE_SETTINGS[key]?.label ?? key) : null;

// Valores de enumeraciones que pueden venir en `expected`, `actual` o `meta`.
const VALUE_LABELS: Record<string, string> = {
  PENDING_INSPECTION: "Pendiente de inspección",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  QUARANTINE: "En cuarentena",
  WINE: "Vino",
  SINGANI: "Singani",
  WINE_AGING: "Crianza (vino)",
  SINGANI_DIST: "Destilación (singani)",
  FILLING: "Llenando",
  FERMENTING: "Fermentando",
  COMPLETED: "Fermentación terminada",
  TRANSFERRED: "Trasegado",
  CLEANED: "Limpio",
  ORIGIN: "Origen",
  HARVEST: "Vendimia",
  AGING: "Crianza",
  DISTILLING: "Destilación",
  RESTING: "Reposo",
  READY: "Listo",
  BOTTLED: "Embotellado",
  CERTIFIED: "Expediente cerrado",
  ANCHORED: "Anclado",
  DISCARDED: "Descartado",
  NOT_REQUIRED: "Sin reposo",
  ACTIVE: "Activa",
  CONFORMING: "Conforme",
  NON_CONFORMING: "No conforme",
  INCOMPLETE: "Incompleto",
};

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v);

/** Valor de `expected`, `actual` o `meta` listo para mostrar, con su unidad si se indica. */
export function formatRuleValue(value: unknown, unit: string | null = null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    const digits = Number.isInteger(value) ? 0 : Math.min(3, (String(value).split(".")[1] ?? "").length);
    const text = fmtNumber(value, digits);
    return unit ? (unit === "%" ? `${text} %` : `${text} ${unit}`) : text;
  }
  if (Array.isArray(value)) return value.map((v) => formatRuleValue(v)).join(", ");
  if (isDay(value)) return fmtDate(value);
  if (typeof value === "string") return VALUE_LABELS[value] ?? value;
  return JSON.stringify(value);
}

const days = (n: number) => (n === 1 ? "1 día" : `${fmtNumber(n)} días`);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

type Explainer = {
  title: string | ((v: RuleViolation) => string);
  hint?: string | ((v: RuleViolation) => string | null);
  /** Cifras propias del código; si falta, las genéricas (exigido y registrado). */
  facts?: (v: RuleViolation, unit: string | null) => ViolationFact[];
};

const fact = (label: string, value: unknown, unit: string | null = null): ViolationFact[] =>
  value === undefined || value === null ? [] : [{ label, value: formatRuleValue(value, unit) }];

const stageFacts = (v: RuleViolation): ViolationFact[] => [
  ...fact("Etapa actual", v.meta.stage ?? v.meta.status),
  ...fact("Etapas en las que se admite", v.meta.allowed),
];

/** Un texto por cada código del contrato §13 (más el único anterior a la Ola 2 que se conserva). */
const EXPLAINERS: Record<string, Explainer> = {
  TRC_LOT_NOT_FOUND: { title: "Lote no encontrado", hint: "No existe o pertenece a otra bodega." },
  TRC_INVALID_STAGE: {
    title: "La etapa del lote no admite esta acción",
    facts: stageFacts,
    hint: "Revisa en qué etapa está el lote antes de registrar este paso.",
  },
  TRC_LOT_TERMINAL: {
    title: "El lote ya no admite cambios",
    facts: stageFacts,
    hint: "Un lote rechazado, descartado o con el expediente cerrado es de solo lectura.",
  },
  TRC_PRODUCT_NOT_SUPPORTED: {
    title: "Tipo de producto no admitido",
    hint: "Un lote solo puede ser vino o singani.",
  },
  TRC_HARVEST_YEAR_MISMATCH: {
    title: "El pesaje es de otra añada",
    facts: (v) => [...fact("Añada del lote", v.expected), ...fact("Añada del pesaje", v.actual)],
    hint: "Asigna el pesaje a un lote de su misma añada.",
  },
  TRC_DO_TERROIR_NOT_ELIGIBLE: {
    title: "La parcela no es apta para la D.O. Singani",
    facts: (v, unit) => [...fact("Exige el lote", v.expected, unit), ...fact("Tiene la parcela", v.actual, unit)],
    hint: "Elige una parcela apta. Las reglas son las de la instantánea del lote y no se pueden forzar.",
  },
  TRC_DO_NOT_ELIGIBLE: {
    title: "El lote no cumple la D.O. Singani",
    facts: (v, unit) => [...fact("Exige el lote", v.expected, unit), ...fact("Tiene la parcela", v.actual, unit)],
    hint: "La aptitud se calcula con la uva pesada: corrige la parcela con una corrección o destina el lote a vino.",
  },
  TRC_TERROIR_IN_USE: {
    title: "La parcela ya tiene pesajes",
    facts: (v) => fact("Campos que no se editan", v.meta.fields),
    hint: "Altitud, cepa y tipo de materia prima se cambian con una corrección, que deja el motivo registrado.",
  },
  TRC_PHYTO_IN_CREATE: {
    title: "El dictamen no se registra al pesar",
    hint: "Registra primero el pesaje; el dictamen fitosanitario va aparte, en la ficha del pesaje, con su autor.",
  },
  TRC_PHYTO_NOT_APPROVED: {
    title: "Uva sin dictamen fitosanitario aprobado",
    facts: (v) => [...fact("Pesaje", v.meta.harvestBatchCode), ...fact("Dictamen actual", v.meta.status ?? v.actual)],
    hint: "La uva entra a un tanque solo con el dictamen aprobado. Regístralo en la ficha del pesaje.",
  },
  TRC_PHYTO_DECISION_FINAL: {
    title: "El dictamen ya es definitivo",
    facts: (v) => fact("Dictamen actual", v.meta.status),
    hint: (v) =>
      v.meta.inTank
        ? "La uva ya entró a un tanque: su dictamen no cambia."
        : "Un dictamen aprobado o rechazado no se sustituye; si fue un error, regístralo como corrección.",
  },
  TRC_MIXED_LOTS: {
    title: "Un tanque solo recibe uva de un lote",
    hint: "Elige pesajes del mismo lote.",
  },
  TRC_TANK_CODE_IN_USE: {
    title: "El tanque está ocupado",
    facts: (v) => fact("Estado del tanque", v.meta.status),
    hint: "Un tanque físico no se reutiliza hasta limpiarlo: márcalo como limpio o usa otro código.",
  },
  TRC_TANK_CAPACITY_EXCEEDED: {
    title: "El llenado supera la capacidad",
    facts: (v) => [...fact("Capacidad", v.meta.capacityLiters ?? v.expected, "L"), ...fact("Llenado", v.actual, "L")],
  },
  TRC_TANK_INVALID_TRANSITION: {
    title: "El tanque no puede pasar a ese estado",
    facts: (v) => [...fact("Estado actual", v.meta.from), ...fact("Estado pedido", v.meta.to)],
    hint: "El orden es llenando → fermentando → terminada → trasegado → limpio.",
  },
  TRC_TANK_NOT_ACTIVE: {
    title: "El tanque ya está cerrado",
    facts: (v) => fact("Estado del tanque", v.meta.status),
    hint: "Un tanque trasegado o limpio no admite lecturas ni tratamientos.",
  },
  TRC_TANK_NOT_COMPLETED: {
    title: "El tanque no tiene la fermentación completada",
    facts: (v) => fact("Estado del tanque", v.meta.status),
    hint: "La crianza y la destilación solo parten de un tanque con la fermentación completada: complétala en la ficha del tanque (ahí se decide el destino). Un tanque ya trasegado o limpio no tiene vino que pasar.",
  },
  FERMENTATION_TANK_ALREADY_TRANSFERRED: {
    title: "El tanque ya se trasegó",
    hint: "Cada tanque admite una sola crianza.",
  },
  TRC_DESTINATION_MISMATCH: {
    title: "El destino no coincide con el tipo del lote",
    facts: (v) => [...fact("Destino del lote", v.expected), ...fact("Destino indicado", v.actual)],
    hint: "El tipo del lote no cambia una vez fijado; un error solo se resuelve descartando el lote.",
  },
  TRC_VOLUME_EXCEEDS_AVAILABLE: {
    title: "Cantidad por encima de lo disponible",
    facts: (v) => {
      const unit = str(v.meta.unit);
      return [
        ...fact("Disponible", v.meta.available ?? v.expected, unit),
        ...fact("Solicitado", v.meta.requested ?? v.actual, unit),
      ];
    },
  },
  TRC_VOLUME_MISSING: {
    title: "Falta un volumen imprescindible",
    hint: "Sin ese volumen no se puede verificar el balance: regístralo con una corrección.",
  },
  TRC_AGING_BELOW_MINIMUM: {
    title: "Crianza por debajo del mínimo",
    facts: (v, unit) => [...fact("Mínimo del lote", v.expected, unit), ...fact("Indicado", v.actual, unit)],
  },
  TRC_MASS_BALANCE_EXCEEDED: {
    title: "Los cortes suman más que la entrada",
    facts: (v) => [
      ...fact("Entrada", v.meta.inputLiters ?? v.expected, "L"),
      ...fact("Suma de cortes", v.meta.outputLiters ?? v.actual, "L"),
    ],
    hint: "Cabezas, corazón y colas (y la vinaza) no pueden superar el volumen que entró al alambique.",
  },
  TRC_DISTILLATION_ALREADY_CLOSED: { title: "La destilación ya está cerrada" },
  TRC_LOCK_NOT_RELEASED: {
    title: (v) => (v.meta.kind === "AGING" ? "Crianza sin cumplir" : "Reposo obligatorio sin cumplir"),
    facts: (v) => {
      const remaining = num(v.meta.daysRemaining);
      return [
        ...fact("Disponible el", v.meta.unlockDate ?? v.expected),
        ...(remaining !== null && remaining > 0 ? [{ label: "Faltan", value: days(remaining) }] : []),
      ];
    },
    hint: (v) => {
      const unlock = str(v.meta.unlockDate) ?? (isDay(v.expected) ? v.expected : null);
      return unlock
        ? `Se podrá embotellar a partir del ${fmtDate(unlock)}, con esa fecha o una posterior.`
        : "Se podrá embotellar cuando se cumpla el candado.";
    },
  },
  TRC_BOTTLING_SOURCE_INVALID: {
    title: "Fuente de embotellado no válida",
    facts: (v) => fact("Estado de la fuente", v.meta.status),
    hint: "Las fuentes son las crianzas o destilaciones abiertas de este mismo lote.",
  },
  TRC_BOTTLING_SOURCES_PENDING: {
    title: "Quedan fuentes abiertas sin incluir",
    hint: "El lote se embotella una sola vez: incluye todas sus fuentes o descarta las que sobren.",
  },
  TRC_LOT_ALREADY_BOTTLED: {
    title: "El lote ya se embotelló",
    facts: (v) => fact("Código de lote", v.meta.lotCode),
    hint: "Cada lote admite un solo embotellado.",
  },
  TRC_BOTTLING_EXCEEDS_VOLUME: {
    title: "Más botellas que litros disponibles",
    facts: (v) => [
      ...fact("Caben como máximo", v.meta.maxBottles ?? v.expected, "botellas"),
      ...fact("Indicadas", v.actual, "botellas"),
    ],
    hint: "Reduce las botellas o revisa el formato.",
  },
  TRC_BOTTLING_LOSS_ABOVE_TOLERANCE: {
    title: "Merma por encima de la tolerada",
    facts: (v) => [
      ...fact("Merma tolerada", v.expected, "%"),
      ...fact("Merma resultante", v.meta.lossPercent ?? v.actual, "%"),
    ],
    hint: "Declara el remanente (lo que no se embotelló) o revisa el número de botellas.",
  },
  TRC_ALCOHOL_BALANCE_EXCEEDED: {
    title: "Más alcohol embotellado que el del corazón",
    facts: (v) => [
      ...fact("Alcohol puro disponible", v.expected, "L"),
      ...fact("Alcohol puro embotellado", v.actual, "L"),
    ],
    hint: "El agua no crea alcohol: revisa el grado final, el agua añadida o las botellas.",
  },
  TRC_DILUTION_NOT_ALLOWED: {
    title: "No se admite agua en un vino",
    facts: (v) => fact("Agua indicada", v.actual, "L"),
  },
  TRC_COMPLIANCE_ISSUES_OPEN: {
    title: "El lote tiene incidencias abiertas",
    facts: (v) => (Array.isArray(v.meta.issueIds) ? fact("Incidencias abiertas", v.meta.issueIds.length) : []),
    hint: "Resuélvelas con una corrección (o descarta el lote) antes de continuar.",
  },
  TRC_LOT_NOT_BOTTLED: {
    title: "El lote aún no está embotellado",
    facts: stageFacts,
    hint: "El laboratorio y los códigos de botella existen a partir del embotellado.",
  },
  TRC_BOTTLE_CODE_NOT_FOUND: { title: "Código de botella no encontrado", hint: "No existe o es de otra bodega." },
  TRC_BOTTLE_CODE_ALREADY_VOIDED: { title: "El código ya estaba anulado" },
  TRC_EXPORT_NOT_READY: {
    title: "La exportación aún se está generando",
    hint: "Vuelve a consultarla en unos segundos.",
  },
  TRC_CORRECTION_FIELD_NOT_CORRECTABLE: {
    title: "Ese dato no se puede corregir",
    facts: (v) => [...fact("Campo", v.meta.field), ...fact("Campos corregibles", v.expected)],
    hint: "El lote de pertenencia, el tipo de producto, los códigos y el número de botellas no se corrigen.",
  },
  TRC_CORRECTION_BREAKS_RULES: {
    title: "La corrección incumpliría una regla",
    hint: "El lote se vuelve a validar con cada corrección: el valor nuevo tiene que cumplir sus reglas.",
  },
  TRC_DOSSIER_NOT_READY: {
    title: "Falta un requisito para cerrar el expediente",
    hint: "Cumple cada requisito de la lista y vuelve a intentarlo.",
  },
  TRC_DOSSIER_CLOSED: {
    title: "El expediente está cerrado",
    facts: (v) => fact("Cerrado el", str(v.meta.closedAt)?.slice(0, 10)),
    hint: "Tras el cierre el lote es de solo lectura; solo se pueden anular códigos de botella, sin sustituirlos.",
  },
  TRC_DATE_IN_FUTURE: {
    title: "La fecha no puede ser futura",
    facts: (v) => [...fact("Hoy en el servidor", v.expected), ...fact("Fecha indicada", v.actual)],
  },
  TRC_DATE_BEFORE_PREVIOUS_STAGE: {
    title: "Fecha anterior a la etapa previa",
    facts: (v) => [...fact("Fecha mínima", v.meta.minimum ?? v.expected), ...fact("Fecha indicada", v.actual)],
  },
  TRC_FILE_NOT_FOUND: {
    title: "Archivo no encontrado",
    hint: "Vuelve a subir el archivo: el anterior no existe o es de otra organización.",
  },
  TRC_REPORT_TOO_LARGE: {
    title: "El reporte es demasiado grande",
    facts: (v) => fact("Filas", v.meta.rows),
    hint: "Acota las fechas o filtra por tipo de producto.",
  },
  TRC_PLATFORM_READ_ONLY: {
    title: "La plataforma solo lee la trazabilidad",
    hint: "Los registros los hace el equipo de la bodega.",
  },
};

/** Códigos que el ERP sabe explicar (los del contrato §13 que le llegan). */
export const EXPLAINED_CODES: readonly string[] = Object.keys(EXPLAINERS);

/** Título de una regla por su código (incidencias, avisos de la vista previa). */
export function ruleTitle(code: string | null | undefined): string {
  if (!code) return "Regla del lote incumplida";
  const title = EXPLAINERS[code]?.title;
  return typeof title === "string" ? title : (title?.(EMPTY) ?? "Regla del lote incumplida");
}
const EMPTY: RuleViolation = {
  field: null,
  message: "",
  code: null,
  rule: null,
  expected: undefined,
  actual: undefined,
  meta: {},
};

/** Explica una violación: título, regla, cifras y qué hacer. */
export function explainViolation(v: RuleViolation): ExplainedViolation {
  const code = v.code ?? "";
  const explainer = EXPLAINERS[code];
  const unit = v.rule ? (RULE_SETTINGS[v.rule]?.unit ?? null) : null;
  const facts = explainer?.facts?.(v, unit) ??
    // Sin texto propio: lo exigido y lo registrado, tal como los manda el servidor.
    [...fact("Exigido", v.expected, unit), ...fact("Registrado", v.actual, unit)];
  const title = explainer ? (typeof explainer.title === "string" ? explainer.title : explainer.title(v)) : null;
  const hint = explainer?.hint ? (typeof explainer.hint === "string" ? explainer.hint : explainer.hint(v)) : null;
  return {
    code,
    title: title ?? "Regla del lote incumplida",
    message: v.message,
    rule: ruleLabel(v.rule),
    facts,
    hint,
  };
}
