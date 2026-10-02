import type { WineryRole } from "@drinks-on-chain/mocks";
import type { MeResponse } from "@/lib/auth/schemas";
import { activeMembership } from "@/lib/auth/organization";

// Quién puede qué en el ERP: la matriz de los guards del backend por el rol de la membresía de la
// organización ACTIVA (O0-BE-4, `docs/CONTRATO.md` §3 de los mocks 0.3.0-rc.2) y, desde la Ola 2,
// la del contrato `o2-erp-confiable.md` §14. El backend es quien decide (403
// `AUTH_INSUFFICIENT_PERMISSIONS`); esto solo oculta o desactiva lo que fallaría. Una persona puede
// ser enóloga en una bodega y dueña en otra.

export type ErpAction =
  | "lot.read"
  | "lot.write"
  | "lot.balance.read"
  | "dashboard.read"
  | "reports.read"
  | "bottleCodes.read"
  | "bottleCodes.manage"
  | "correction.create"
  | "dossier.close"
  | "attachment.create"
  | "attachment.visibility"
  | "terroir.read"
  | "terroir.write"
  | "harvest.read"
  | "harvest.create"
  | "harvest.maturity"
  | "harvest.phyto"
  | "tank.read"
  | "tank.create"
  | "tank.log"
  | "tank.treatment"
  | "aging.read"
  | "aging.create"
  | "distillation.read"
  | "distillation.create"
  | "bottling.read"
  | "bottling.create"
  | "lab.read"
  | "lab.create"
  | "winery.manage";

const ALL: WineryRole[] = ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR", "ACCOUNTANT"];

/**
 * Matriz del backend: `OPERATOR` pesa y registra lecturas, y lee las parcelas (lista y ficha) para
 * elegir la de cada pesaje (contrato de la Ola 1 §11 bis); `ACCOUNTANT` solo lee.
 */
const MATRIX: Record<ErpAction, readonly WineryRole[]> = {
  // Lote (Ola 2 §14): todos lo ven (el operario, lista, ficha y línea de tiempo); lo crean, editan
  // y descartan la dirección y la enología.
  "lot.read": ALL,
  "lot.write": ["OWNER", "ENOLOGIST"],
  "lot.balance.read": ["OWNER", "ENOLOGIST", "AGRONOMIST", "ACCOUNTANT"],
  "dashboard.read": ["OWNER", "ENOLOGIST", "AGRONOMIST", "ACCOUNTANT"],
  "reports.read": ["OWNER", "ENOLOGIST", "ACCOUNTANT"],
  // Los códigos son el antifalsificación de la etiqueta: el resto de roles solo ve los totales.
  "bottleCodes.read": ["OWNER", "ENOLOGIST"],
  "bottleCodes.manage": ["OWNER", "ENOLOGIST"],
  // Una corrección la hace quien puede crear el registro corregido (S-17; ver `canCorrect`).
  "correction.create": ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR"],
  "dossier.close": ["OWNER", "ENOLOGIST"],
  "attachment.create": ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR"],
  "attachment.visibility": ["OWNER", "ENOLOGIST"],
  "terroir.read": ALL,
  "terroir.write": ["OWNER", "AGRONOMIST"],
  "harvest.read": ALL,
  "harvest.create": ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR"],
  "harvest.maturity": ["OWNER", "ENOLOGIST", "AGRONOMIST"],
  "harvest.phyto": ["OWNER", "ENOLOGIST", "AGRONOMIST"],
  "tank.read": ALL,
  "tank.create": ["OWNER", "ENOLOGIST"],
  "tank.log": ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR"],
  "tank.treatment": ["OWNER", "ENOLOGIST"],
  "aging.read": ["OWNER", "ENOLOGIST", "ACCOUNTANT"],
  "aging.create": ["OWNER", "ENOLOGIST"],
  "distillation.read": ["OWNER", "ENOLOGIST", "ACCOUNTANT"],
  "distillation.create": ["OWNER", "ENOLOGIST"],
  "bottling.read": ["OWNER", "ENOLOGIST", "ACCOUNTANT"],
  "bottling.create": ["OWNER", "ENOLOGIST"],
  "lab.read": ["OWNER", "ENOLOGIST", "AGRONOMIST", "ACCOUNTANT"],
  "lab.create": ["OWNER", "ENOLOGIST"],
  "winery.manage": ["OWNER"],
};

const isRead = (action: ErpAction) => action.endsWith(".read");

/** Rol en el ERP: el de la membresía activa en una bodega, `PLATFORM` o `null` (sin acceso). */
export type ErpRole = WineryRole | "PLATFORM";

const WINERY_ROLES: readonly string[] = ALL;

export function erpRole(me: MeResponse | undefined): ErpRole | null {
  const active = activeMembership(me);
  if (!active || active.status !== "ACTIVE") return null;
  if (active.organizationType === "PLATFORM") return "PLATFORM";
  if (active.organizationType === "WINERY" && WINERY_ROLES.includes(active.role)) return active.role as WineryRole;
  return null;
}

/** La organización activa es la plataforma (lectura de todas las bodegas). */
export const isPlatform = (me: MeResponse | undefined) => erpRole(me) === "PLATFORM";

/** El ERP es del personal de una bodega (o de la plataforma, en solo lectura). */
export function canUseErp(me: MeResponse): boolean {
  return me.user.audience === "STAFF" && erpRole(me) !== null;
}

export function can(me: MeResponse | undefined, action: ErpAction): boolean {
  const role = erpRole(me);
  if (!role) return false;
  // La plataforma lee todas las bodegas; sus escrituras exigen `?wineryId=` y un motivo: se hacen
  // desde el Backoffice, así que en el ERP queda en solo lectura.
  if (role === "PLATFORM") return isRead(action);
  return MATRIX[action].includes(role);
}

/** Registros de la trazabilidad que admiten una corrección compensatoria (contrato de la Ola 2 §9). */
export type CorrectionTarget =
  | "TERROIR"
  | "HARVEST_BATCH"
  | "MATURITY_ANALYSIS"
  | "PHYTO_DECISION"
  | "FERMENTATION_TANK"
  | "FERMENTATION_LOG"
  | "TREATMENT"
  | "WINE_AGING"
  | "PRODUCTION_BATCH"
  | "BOTTLING"
  | "LAB_ANALYSIS";

const WINEMAKERS: readonly WineryRole[] = ["OWNER", "ENOLOGIST"];

/** Quién corrige cada registro: el rol que puede crearlo (S-17). */
const CORRECTION_ROLES: Record<CorrectionTarget, readonly WineryRole[]> = {
  TERROIR: ["OWNER", "AGRONOMIST"],
  HARVEST_BATCH: ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR"],
  MATURITY_ANALYSIS: ["OWNER", "ENOLOGIST", "AGRONOMIST"],
  PHYTO_DECISION: ["OWNER", "ENOLOGIST", "AGRONOMIST"],
  FERMENTATION_TANK: WINEMAKERS,
  FERMENTATION_LOG: ["OWNER", "ENOLOGIST", "AGRONOMIST", "OPERATOR"],
  TREATMENT: WINEMAKERS,
  WINE_AGING: WINEMAKERS,
  PRODUCTION_BATCH: WINEMAKERS,
  BOTTLING: WINEMAKERS,
  LAB_ANALYSIS: WINEMAKERS,
};

/** La persona puede corregir ese tipo de registro (la plataforma, nunca: solo lee). */
export function canCorrect(me: MeResponse | undefined, target: CorrectionTarget): boolean {
  const role = erpRole(me);
  if (!role || role === "PLATFORM") return false;
  return CORRECTION_ROLES[target].includes(role);
}

const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: "Gestión Drinks on Chain",
  SUPERADMIN: "Gestión Drinks on Chain",
  ADMIN: "Gestión Drinks on Chain",
  OPERATIONS: "Operaciones",
  SUPPORT: "Soporte",
  WINERY_ADMIN: "Administración",
  ENOLOGIST: "Enología",
  AGRONOMIST: "Agronomía",
  CONSUMER: "Consumidor",
  POS_OPERATOR: "Punto de recojo",
  OWNER: "Dirección",
  OPERATOR: "Operario",
  ACCOUNTANT: "Contabilidad",
};

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role]) ?? "—";
}
