import type { Membership } from "@drinks-on-chain/mocks";
import type { MeResponse } from "./schemas";
import { ApiError } from "@/lib/api/errors";
import { activeMembership } from "./organization";

// Bodega no activa en el ERP (SE-05, contrato de la Ola 1 §4). Con la organización activa en un
// estado distinto de `ACTIVE`, el backend responde 403 `ORG_NOT_ACTIVE` con el estado en
// `details: [{ field: null, message: 'SUSPENDED' | 'REVOKED' | 'INVITED' }]`. El ERP lo sabe por
// dos vías: el `organizationStatus` de la membresía activa en `me` y el propio 403 (la bodega se
// suspende a mitad de la sesión). En `SUSPENDED` siguen permitidas la lectura del perfil de la
// bodega y la bitácora propia.

export const ORG_NOT_ACTIVE = "ORG_NOT_ACTIVE";

/** Estado de una bodega que no está activa. `UNKNOWN`: el 403 no trae un estado reconocible. */
export type InactiveStatus = "INVITED" | "SUSPENDED" | "REVOKED" | "UNKNOWN";

const KNOWN: readonly string[] = ["INVITED", "SUSPENDED", "REVOKED"];

/** Estado de un 403 `ORG_NOT_ACTIVE`, o `null` si el error es otro. */
export function orgNotActiveStatus(error: unknown): InactiveStatus | null {
  if (!(error instanceof ApiError) || error.code !== ORG_NOT_ACTIVE) return null;
  const details = Array.isArray(error.details) ? (error.details as unknown[]) : [];
  for (const d of details) {
    const message = d && typeof d === "object" && "message" in d ? (d as { message: unknown }).message : d;
    if (typeof message === "string" && KNOWN.includes(message)) return message as InactiveStatus;
  }
  return "UNKNOWN";
}

export type InactiveOrganization = {
  status: InactiveStatus;
  organizationId: string | null;
  organizationName: string | null;
  /** Rol de la persona en esa bodega (`OWNER` puede ver la bitácora propia en `SUSPENDED`). */
  role: string | null;
};

const fromMembership = (m: Membership, status: InactiveStatus): InactiveOrganization => ({
  status,
  organizationId: m.organizationId,
  organizationName: m.organizationName,
  role: m.role,
});

/**
 * Bodega no activa que manda en el ERP, o `null` si la organización activa está `ACTIVE`.
 * - La membresía activa es de una bodega con `organizationStatus` distinto de `ACTIVE`.
 * - Un 403 `ORG_NOT_ACTIVE` más reciente que `me` (`flag`): la bodega cambió a mitad de sesión.
 * - Sin organización activa, una membresía `ACTIVE` en una bodega no activa (p. ej. revocada:
 *   el backend no la elige como activa, pero la persona debe saber por qué no entra).
 */
export function inactiveOrganization(
  me: MeResponse | undefined,
  flag: InactiveStatus | null = null,
): InactiveOrganization | null {
  if (!me) return null;
  const active = activeMembership(me);
  if (active) {
    if (active.organizationType !== "WINERY") return null;
    if (active.organizationStatus !== "ACTIVE") return fromMembership(active, active.organizationStatus);
    return flag ? fromMembership(active, flag) : null;
  }
  const dormant = me.memberships.find(
    (m) => m.organizationType === "WINERY" && m.status === "ACTIVE" && m.organizationStatus !== "ACTIVE",
  );
  return dormant ? fromMembership(dormant, dormant.organizationStatus as InactiveStatus) : null;
}

/** En `SUSPENDED` la dueña sigue viendo la bitácora propia; nadie más la ve. */
export const canReadAuditWhileInactive = (org: InactiveOrganization) =>
  org.status === "SUSPENDED" && org.role === "OWNER";

// ---------------------------------------------------------------------------
// Aviso del último 403 ORG_NOT_ACTIVE (para `useSyncExternalStore`)
// ---------------------------------------------------------------------------

type Flag = { status: InactiveStatus; at: number } | null;
let flag: Flag = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Registra un 403 `ORG_NOT_ACTIVE`. Devuelve `true` si el error lo era. */
export function flagOrgInactive(error: unknown): boolean {
  const status = orgNotActiveStatus(error);
  if (!status) return false;
  if (flag?.status !== status) {
    flag = { status, at: Date.now() };
    emit();
  }
  return true;
}

/** Al cambiar de organización, entrar, aceptar una invitación o salir. */
export function clearOrgInactive() {
  if (!flag) return;
  flag = null;
  emit();
}

export const getOrgInactiveFlag = (): Flag => flag;

export function subscribeOrgInactive(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
