import type { MeResponse, UserRole } from "@drinks-on-chain/mocks";
import { activeMembership } from "@/lib/auth/organization";

// Quién puede qué en el ERP, según la columna "Roles" de 09 §3. El backend es quien decide
// (responde 403); esto solo oculta o desactiva acciones para no ofrecer lo que fallará.
// Desde la Ola 0 los permisos salen de la membresía de la organización ACTIVA (contrato §6),
// no del rol global de la persona: una enóloga en una bodega puede ser dueña en otra.

export type ErpAction =
  | "terroir.write"
  | "harvest.create"
  | "harvest.phyto"
  | "tank.create"
  | "tank.log"
  | "tank.treatment"
  | "aging.create"
  | "distillation.create"
  | "bottling.create"
  | "lab.create"
  | "winery.manage";

const RULES: Record<ErpAction, UserRole[]> = {
  "terroir.write": ["WINERY_ADMIN", "AGRONOMIST"],
  "harvest.create": ["WINERY_ADMIN", "AGRONOMIST", "ENOLOGIST"],
  "harvest.phyto": ["AGRONOMIST", "ENOLOGIST"],
  "tank.create": ["WINERY_ADMIN", "ENOLOGIST"],
  "tank.log": ["WINERY_ADMIN", "ENOLOGIST", "POS_OPERATOR"],
  "tank.treatment": ["WINERY_ADMIN", "ENOLOGIST"],
  "aging.create": ["WINERY_ADMIN", "ENOLOGIST"],
  "distillation.create": ["WINERY_ADMIN", "ENOLOGIST"],
  "bottling.create": ["WINERY_ADMIN", "ENOLOGIST"],
  "lab.create": ["WINERY_ADMIN", "ENOLOGIST"],
  "winery.manage": ["WINERY_ADMIN"],
};

/** Roles que pueden entrar al ERP. PLATFORM_ADMIN entra en modo lectura de todas las bodegas. */
export const ERP_ROLES: UserRole[] = ["WINERY_ADMIN", "ENOLOGIST", "AGRONOMIST", "PLATFORM_ADMIN"];

/**
 * Rol del ERP equivalente al de la membresía activa, la misma tabla que aplican los mocks y el
 * backend mientras convivan los roles globales (hasta H1): `OWNER` administra la bodega;
 * `OPERATOR` y `ACCOUNTANT` actúan como enología; la plataforma, como PLATFORM_ADMIN.
 */
const ERP_ROLE_FOR_MEMBERSHIP: Record<string, UserRole> = {
  OWNER: "WINERY_ADMIN",
  ENOLOGIST: "ENOLOGIST",
  AGRONOMIST: "AGRONOMIST",
  OPERATOR: "ENOLOGIST",
  ACCOUNTANT: "ENOLOGIST",
};

export function erpRole(me: MeResponse | undefined): UserRole | null {
  const active = activeMembership(me);
  if (!active || active.status !== "ACTIVE") return null;
  if (active.organizationType === "PLATFORM") return "PLATFORM_ADMIN";
  if (active.organizationType === "WINERY") return ERP_ROLE_FOR_MEMBERSHIP[active.role] ?? null;
  return null;
}

/** La organización activa es la plataforma (lectura de todas las bodegas). */
export const isPlatform = (me: MeResponse | undefined) => erpRole(me) === "PLATFORM_ADMIN";

export function canUseErp(me: MeResponse): boolean {
  const role = erpRole(me);
  return me.user.audience === "STAFF" && role !== null && ERP_ROLES.includes(role);
}

export function can(me: MeResponse | undefined, action: ErpAction): boolean {
  const role = erpRole(me);
  if (!role) return false;
  // PLATFORM_ADMIN pasa las comprobaciones del backend, pero el ERP es de las bodegas:
  // se le deja solo lectura para no crear registros en nombre de nadie.
  if (role === "PLATFORM_ADMIN") return false;
  return RULES[action].includes(role);
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
