import {
  CreateLotSchema,
  LOT_STAGE_CODES,
  type CreateLotDto,
  type EffectiveSetting,
  type Lot,
  type LotLockInfo,
  type LotProductType,
  type LotRules,
  type LotStageCode,
  type LotSummary,
} from "@drinks-on-chain/mocks";
import type { Tone } from "@drinks-on-chain/ui";
import { formatSettingValue } from "@/features/ajustes/effective-settings";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { LOT_STAGE_CODE } from "@/lib/erp/labels";
import { omitNulls, type Nullable } from "@/lib/erp/omit-nulls";
import type { ErpAction } from "@/lib/erp/permissions";
import { RULE_SETTINGS } from "@/lib/erp/rule-violations";
import type { LotQuery } from "@/lib/erp/resources";
import { fmtDate, fmtDaysLeft, parseDecimal } from "@/lib/format";

// Lote del servidor (contrato de la Ola 2 §2 y §16.3): textos de la etapa, del candado y de la
// instantánea de reglas, filtros de la lista y formulario de alta. La etapa, los candados, la D.O.
// y la proyección los calcula el servidor; aquí solo se muestran.

// ---------------------------------------------------------------------------
// Secciones de la ficha
// ---------------------------------------------------------------------------

/** Pestañas de la ficha del lote (`?pestana=` en la URL). */
export const LOT_TABS = ["resumen", "linea-de-tiempo"] as const;
export type LotTab = (typeof LOT_TABS)[number];

export const LOT_TAB_LABEL: Record<LotTab, string> = {
  resumen: "Resumen",
  "linea-de-tiempo": "Línea de tiempo",
};

export const isLotTab = (value: unknown): value is LotTab =>
  typeof value === "string" && (LOT_TABS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// Etapa
// ---------------------------------------------------------------------------

export type StageView = { label: string; tone: Tone; strong: boolean; detail: string | null };

/**
 * Etapa del lote con el matiz que antes daba `LotView` (§16.3): en vendimia, si queda uva sin
 * dictamen; en fermentación, si hay tanques terminados sin destino decidido.
 */
export function stageView(lot: Pick<LotSummary, "stage" | "awaitingBifurcation" | "phyto">): StageView {
  const base = LOT_STAGE_CODE[lot.stage];
  if (lot.stage === "HARVEST") {
    if (lot.phyto.quarantine > 0) return { ...base, tone: "warning", strong: false, detail: "Uva en cuarentena" };
    if (lot.phyto.pending > 0) return { ...base, tone: "warning", strong: false, detail: "Dictamen pendiente" };
    return { ...base, strong: false, detail: "Uva aprobada" };
  }
  if (lot.stage === "FERMENTING" && lot.awaitingBifurcation) {
    return { label: "Por bifurcar", tone: "accent", strong: true, detail: "Fermentación terminada: falta el destino" };
  }
  return { ...base, strong: false, detail: null };
}

/** Etapas que aún admiten registros (ni rechazado, ni descartado, ni con el expediente cerrado). */
export const isTerminalStage = (stage: LotStageCode) =>
  stage === "REJECTED" || stage === "DISCARDED" || stage === "CERTIFIED" || stage === "ANCHORED";

// ---------------------------------------------------------------------------
// Candado
// ---------------------------------------------------------------------------

/** "Reposo mínimo de 180 días" / "Crianza de 12 meses" con la regla de la instantánea. */
export function lockRuleText(lock: LotLockInfo): string {
  const { applied, unit, minimum, legalException } = lock.rule;
  const base =
    lock.kind === "REST" ? `Reposo mínimo de ${applied} ${unit}` : `Crianza de ${applied} ${unit} fijada para el lote`;
  const floor = lock.kind === "AGING" && minimum > 0 ? ` (mínimo de la bodega: ${minimum} ${unit})` : "";
  return `${base}${floor}${legalException ? " · excepción legal autorizada" : ""}`;
}

/** "Faltan 18 días · 13 oct 2026" o "Liberado el 13 oct 2026". */
export function lockStatusText(lock: LotLockInfo): string {
  return lock.released
    ? `Liberado el ${fmtDate(lock.unlockDate)}`
    : `${fmtDaysLeft(lock.daysRemaining)} · se libera el ${fmtDate(lock.unlockDate)}`;
}

/** Etiqueta corta de la columna "Candado" de la lista. */
export const lockBadgeText = (lock: LotLockInfo) => (lock.released ? "Liberado" : fmtDaysLeft(lock.daysRemaining));

// ---------------------------------------------------------------------------
// Instantánea de reglas
// ---------------------------------------------------------------------------

export type RuleItem = {
  key: string;
  label: string;
  value: string;
  /** De dónde salió el valor al fijarse la instantánea. */
  source: "GLOBAL" | "WINERY" | null;
  /** Valor por debajo del mínimo legal, autorizado por administración (A-31). */
  legalException: boolean;
};

const RULE_KEYS = Object.keys(RULE_SETTINGS);

/** Reglas con las que se hace el lote: la copia literal de la instantánea, en orden fijo. */
export function snapshotItems(rules: LotRules): RuleItem[] {
  return RULE_KEYS.filter((key) => key in rules.values).map((key) => ({
    key,
    label: RULE_SETTINGS[key]!.label,
    value: formatSettingValue(key, rules.values[key]),
    source: rules.sources[key] ?? null,
    legalException: rules.legalExceptions.includes(key),
  }));
}

/**
 * Reglas vigentes de la bodega que se fijarán al crear un lote (parámetros `appliesAt: 'LOT'` de
 * `GET /v1/organizations/current/settings`). Es un anticipo: la instantánea la toma el servidor.
 */
export function effectiveRuleItems(settings: readonly EffectiveSetting[]): RuleItem[] {
  const byKey = new Map(settings.filter((s) => s.appliesAt === "LOT").map((s) => [s.key, s]));
  return RULE_KEYS.flatMap((key) => {
    const s = byKey.get(key);
    if (!s) return [];
    return [
      {
        key,
        label: RULE_SETTINGS[key]!.label,
        value: formatSettingValue(key, s.value),
        source: s.source,
        legalException: false,
      },
    ];
  });
}

export const RULE_SOURCE: Record<"GLOBAL" | "WINERY", string> = {
  GLOBAL: "Estándar de Drinks on Chain",
  WINERY: "Ajuste propio de la bodega",
};

// ---------------------------------------------------------------------------
// Lista: filtros
// ---------------------------------------------------------------------------

export type LotFilters = {
  /** Una etapa, o todas. */
  stage: LotStageCode | "ALL";
  productType: LotProductType | "ALL";
  q: string;
  /** Solo lotes con incidencias de cumplimiento abiertas. */
  issuesOnly: boolean;
};

export const EMPTY_LOT_FILTERS: LotFilters = { stage: "ALL", productType: "ALL", q: "", issuesOnly: false };

export const hasLotFilters = (f: LotFilters) =>
  f.stage !== "ALL" || f.productType !== "ALL" || f.q.trim() !== "" || f.issuesOnly;

/** Etapas que ofrece el filtro (sin `ANCHORED`, reservada para la Ola 3). */
export const FILTER_STAGES: readonly LotStageCode[] = LOT_STAGE_CODES.filter((s) => s !== "ANCHORED");

/** Filtros de la pantalla → parámetros de `GET /v1/lots` (el servidor filtra y pagina). */
export function lotListQuery(f: LotFilters, page: { limit: number; offset: number }): LotQuery {
  const q = f.q.trim();
  return {
    ...page,
    ...(f.stage !== "ALL" ? { stage: [f.stage] } : {}),
    ...(f.productType !== "ALL" ? { productType: f.productType } : {}),
    ...(q ? { q } : {}),
    ...(f.issuesOnly ? { hasComplianceIssues: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Siguiente paso
// ---------------------------------------------------------------------------

export type NextStep = { label: string; href: string; action: ErpAction; note: string };

type NextStepLot = Pick<Lot, "id" | "stage" | "awaitingBifurcation" | "phyto" | "nextLock" | "links">;

/**
 * Qué se puede registrar ahora en el lote, según su etapa. Es una ayuda de navegación: si el
 * servidor no lo admite (candado, dictamen, D.O.), lo explica al intentarlo.
 */
export function nextStep(lot: NextStepLot): NextStep | null {
  const step = (label: string, href: string, action: ErpAction, note: string): NextStep => ({
    label,
    href,
    action,
    note,
  });
  const { harvestBatchIds, tankIds, productionBatchIds } = lot.links;
  switch (lot.stage) {
    case "ORIGIN":
      return step(
        "Registrar pesaje",
        `/vendimia/pesaje?lote=${lot.id}`,
        "harvest.create",
        "El lote aún no tiene uva pesada.",
      );
    case "HARVEST":
      if (lot.phyto.approved > 0) {
        return step(
          "Llenar tanque",
          `/vinificacion/nuevo?lote=${lot.id}`,
          "tank.create",
          "Hay uva aprobada para fermentar.",
        );
      }
      return harvestBatchIds[0]
        ? step(
            "Ver el pesaje",
            `/vendimia/${harvestBatchIds[0]}`,
            "harvest.read",
            "La uva espera su dictamen fitosanitario.",
          )
        : null;
    case "FERMENTING":
      return tankIds[0]
        ? step(
            "Ver el tanque",
            `/vinificacion/${tankIds.at(-1)}`,
            "tank.read",
            lot.awaitingBifurcation
              ? "Hay tanques terminados sin destino decidido."
              : "Al completar la fermentación se decide el destino.",
          )
        : null;
    case "DISTILLING":
      return productionBatchIds[0]
        ? step(
            "Ver la destilación",
            `/destilacion/${productionBatchIds.at(-1)}`,
            "distillation.read",
            "Hay destilaciones abiertas por cerrar.",
          )
        : null;
    case "AGING":
    case "RESTING":
      return lot.nextLock && !lot.nextLock.released
        ? null
        : step(
            "Embotellar",
            `/lotes/${lot.id}/embotellar`,
            "bottling.create",
            "Los candados del lote están cumplidos.",
          );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Alta del lote
// ---------------------------------------------------------------------------

export type LotFormValues = {
  name: string;
  harvestYear: string;
  /** `""` = se decide en la bifurcación. */
  productType: LotProductType | "";
  estimatedBottles: string;
  plannedFormatCl: string;
  targetAbvPercent: string;
  plannedTerroirIds: string[];
  targetReadyDate: string;
  notes: string;
};

export type LotFormField = keyof LotFormValues;
export type LotFormErrors = Partial<Record<LotFormField, string>>;

export function emptyLotForm(now: Date, overrides: Partial<LotFormValues> = {}): LotFormValues {
  return {
    name: "",
    harvestYear: String(now.getUTCFullYear()),
    productType: "",
    estimatedBottles: "",
    plannedFormatCl: "",
    targetAbvPercent: "",
    plannedTerroirIds: [],
    targetReadyDate: "",
    notes: "",
    ...overrides,
  };
}

type LotDtoResult = { ok: true; dto: CreateLotDto } | { ok: false; errors: LotFormErrors };

/** Valores del formulario → `CreateLotBody` (§2.4). Solo valida forma y rangos; las reglas, el servidor. */
export function toCreateLotDto(v: LotFormValues, now: Date): LotDtoResult {
  const errors: LotFormErrors = {};
  const name = v.name.trim();
  const year = parseDecimal(v.harvestYear, { grouping: false });
  const bottles = parseDecimal(v.estimatedBottles);
  const format = parseDecimal(v.plannedFormatCl);
  const abv = parseDecimal(v.targetAbvPercent, { grouping: false });

  if (name.length < 3) errors.name = "Escribe un nombre de al menos 3 caracteres.";
  else if (name.length > 120) errors.name = "El nombre admite hasta 120 caracteres.";
  if (year == null || !Number.isInteger(year) || year < 2000 || year > now.getUTCFullYear()) {
    errors.harvestYear = `Indica la añada, entre 2000 y ${now.getUTCFullYear()}.`;
  }
  if (
    v.estimatedBottles.trim() &&
    (bottles == null || !Number.isInteger(bottles) || bottles < 1 || bottles > 100_000)
  ) {
    errors.estimatedBottles = "La estimación va de 1 a 100.000 botellas.";
  }
  if (v.plannedFormatCl.trim() && (format == null || format < 5 || format > 300)) {
    errors.plannedFormatCl = "El formato va de 5 a 300 cL.";
  }
  if (v.targetAbvPercent.trim() && (abv == null || abv < 1 || abv > 80)) {
    errors.targetAbvPercent = "El grado previsto va de 1 a 80 % vol.";
  }
  if (v.targetReadyDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.targetReadyDate)) {
    errors.targetReadyDate = "Indica una fecha válida.";
  }
  if (v.notes.length > 2000) errors.notes = "Las notas admiten hasta 2.000 caracteres.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const draft: Nullable<CreateLotDto> = {
    name,
    harvestYear: year!,
    productType: v.productType || null,
    estimatedBottles: v.estimatedBottles.trim() ? bottles : null,
    plannedFormatCl: v.plannedFormatCl.trim() ? format : null,
    targetAbvPercent: v.targetAbvPercent.trim() ? abv : null,
    plannedTerroirIds: v.plannedTerroirIds.length > 0 ? v.plannedTerroirIds : null,
    targetReadyDate: v.targetReadyDate || null,
    notes: v.notes.trim() || null,
  };
  const dto = omitNulls<CreateLotDto>(draft);
  const parsed = CreateLotSchema.safeParse(dto);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "") as LotFormField;
      if (key in v) errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, dto };
}

const LOT_FIELDS: readonly LotFormField[] = [
  "name",
  "harvestYear",
  "productType",
  "estimatedBottles",
  "plannedFormatCl",
  "targetAbvPercent",
  "plannedTerroirIds",
  "targetReadyDate",
  "notes",
];

/**
 * `details[].field` de un 422 → campos del formulario del lote. Con `prefix` (p. ej. `newLot`)
 * lee los del lote creado desde el pesaje o desde el tanque (`newLot.name`).
 */
export function lotFieldErrors(error: unknown, prefix?: string): LotFormErrors {
  return fieldErrorsFrom<LotFormField>(error, (field) => {
    const own = prefix ? (field.startsWith(`${prefix}.`) ? field.slice(prefix.length + 1) : null) : field;
    const key = own?.split(".")[0];
    return key && (LOT_FIELDS as readonly string[]).includes(key) ? (key as LotFormField) : undefined;
  }).fieldErrors;
}
