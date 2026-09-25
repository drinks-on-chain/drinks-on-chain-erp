import type { UserProfileResponse, UserRole } from "@drinks-on-chain/mocks";

// Quién puede qué en el ERP, según la columna "Roles" de 09 §3. El backend es quien decide
// (responde 403); esto solo oculta o desactiva acciones para no ofrecer lo que fallará.

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

export function canUseErp(user: Pick<UserProfileResponse, "userRole">): boolean {
  return ERP_ROLES.includes(user.userRole);
}

export function can(user: Pick<UserProfileResponse, "userRole"> | undefined, action: ErpAction): boolean {
  if (!user) return false;
  // PLATFORM_ADMIN pasa las comprobaciones del backend, pero el ERP es de las bodegas:
  // se le deja solo lectura para no crear registros en nombre de nadie.
  if (user.userRole === "PLATFORM_ADMIN") return false;
  return RULES[action].includes(user.userRole);
}

const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: "Gestión Drinks on Chain",
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
