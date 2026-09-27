import {
  CreateInvitationSchema,
  type CreateInvitationDto,
  type Invitation,
  type Member,
  type WineryRole,
} from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";

// Reglas del equipo de la bodega en el cliente (contrato de la Ola 1 §2 y §5). El backend es quien
// decide; aquí se ocultan o desactivan las acciones que fallarían y se explica por qué.

export type InvitableRole = Exclude<WineryRole, "OWNER">;

/** Roles que el dueño puede invitar o asignar: nunca `OWNER` (solo en el alta o la transferencia). */
export const INVITABLE_ROLES: { value: InvitableRole; label: string; help: string }[] = [
  { value: "ENOLOGIST", label: "Enología", help: "Vinificación, crianza, destilación y embotellado." },
  { value: "AGRONOMIST", label: "Agronomía", help: "Parcelas, pesaje y dictamen fitosanitario." },
  { value: "OPERATOR", label: "Operario", help: "Registros de planta." },
  { value: "ACCOUNTANT", label: "Contabilidad", help: "Consulta de la trazabilidad." },
];

export const isInvitableRole = (role: string): role is InvitableRole => INVITABLE_ROLES.some((r) => r.value === role);

/** Por qué no se puede tocar a un miembro (o `null` si se puede). */
export type LockedReason = "SELF" | "OWNER" | "PLATFORM";

export type MemberActions = {
  changeRole: boolean;
  block: boolean;
  unblock: boolean;
  locked: LockedReason | null;
};

const NONE: MemberActions = { changeRole: false, block: false, unblock: false, locked: null };

/**
 * Acciones del dueño sobre un miembro: no sobre sí mismo ni sobre la dirección (el rol de dueño
 * solo cambia con la transferencia), y no puede levantar un bloqueo de la plataforma
 * (`ORG_BLOCKED_BY_PLATFORM`). El resto de roles solo lee nombres y roles.
 */
export function memberActions(member: Member, viewer: { userId: string; isOwner: boolean }): MemberActions {
  if (!viewer.isOwner) return NONE;
  if (member.userId === viewer.userId) return { ...NONE, locked: "SELF" };
  if (member.role === "OWNER") return { ...NONE, locked: "OWNER" };
  if (member.status === "ACTIVE") return { changeRole: true, block: true, unblock: false, locked: null };
  if (member.blockedBy === "PLATFORM") return { ...NONE, locked: "PLATFORM" };
  return { changeRole: true, block: false, unblock: true, locked: null };
}

export const LOCKED_TEXT: Record<LockedReason, string> = {
  SELF: "Eres tú: tu propia membresía no se cambia desde aquí.",
  OWNER: "La dirección de la bodega solo cambia con una transferencia de titularidad, que hace Drinks on Chain.",
  PLATFORM:
    "Lo bloqueó el equipo de Drinks on Chain: solo la plataforma puede desbloquearlo. Escríbenos si crees que es un error.",
};

/** Texto de quién bloqueó a un miembro. */
export function blockedByText(member: Member): string | null {
  if (member.status !== "BLOCKED") return null;
  return member.blockedBy === "PLATFORM" ? "Bloqueado por Drinks on Chain" : "Bloqueado por la dirección";
}

/** Dirección primero, después activos y bloqueados; dentro, por nombre. */
export function sortMembers(members: readonly Member[]): Member[] {
  const rank = (m: Member) => (m.role === "OWNER" ? 0 : m.status === "ACTIVE" ? 1 : 2);
  return [...members].sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, "es"));
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------

/** Pendientes y caducadas (las que se pueden reenviar), las que vencen antes primero. */
export function openInvitations(invitations: readonly Invitation[]): Invitation[] {
  return invitations
    .filter((i) => i.status === "PENDING" || i.status === "EXPIRED")
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export type InvitationUrgency = "expired" | "soon" | "ok";

/** Caducada, vence en menos de 24 h o con tiempo. */
export function invitationUrgency(invitation: Invitation, now: Date): InvitationUrgency {
  const left = Date.parse(invitation.expiresAt) - now.getTime();
  if (invitation.status === "EXPIRED" || left <= 0) return "expired";
  return left < 24 * 3_600_000 ? "soon" : "ok";
}

/** Reenviar: pendientes o caducadas (token y caducidad nuevos). Anular: solo pendientes. */
export const invitationActions = (invitation: Invitation) => ({
  resend: invitation.status === "PENDING" || invitation.status === "EXPIRED",
  revoke: invitation.status === "PENDING",
});

export type TeamCapacity = { used: number; limit: number | null; full: boolean };

/**
 * Plazas del equipo según `equipo.maxColaboradoresPorBodega` (vacío = ilimitado): cuentan los
 * miembros activos (dueño incluido) y las invitaciones pendientes.
 */
export function teamCapacity(
  members: readonly Member[],
  invitations: readonly Invitation[],
  limit: unknown,
): TeamCapacity {
  const used =
    members.filter((m) => m.status === "ACTIVE").length + invitations.filter((i) => i.status === "PENDING").length;
  const max = typeof limit === "number" && Number.isFinite(limit) ? limit : null;
  return { used, limit: max, full: max !== null && used >= max };
}

// ---------------------------------------------------------------------------
// Formulario de invitación
// ---------------------------------------------------------------------------

export type InviteValues = { email: string; role: InvitableRole | "" };
export type InviteErrors = Partial<Record<keyof InviteValues, string>>;

export const emptyInvite = (): InviteValues => ({ email: "", role: "" });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvite(v: InviteValues): { errors: InviteErrors; dto: CreateInvitationDto | null } {
  const errors: InviteErrors = {};
  const email = v.email.trim().toLowerCase();
  if (!EMAIL.test(email)) errors.email = "Indica un correo válido.";
  if (!v.role) errors.role = "Elige el rol en la bodega.";
  if (Object.keys(errors).length) return { errors, dto: null };
  const parsed = CreateInvitationSchema.safeParse({ email, role: v.role });
  if (!parsed.success) return { errors: { email: parsed.error.issues[0]?.message ?? "Correo no válido." }, dto: null };
  return { errors, dto: parsed.data };
}

/** Mensajes de los errores de invitar (contrato de la Ola 1 §2) junto a su campo. */
export function inviteErrors(error: unknown): { errors: InviteErrors; formError: string | null } {
  if (!(error instanceof ApiError)) return { errors: {}, formError: null };
  switch (error.code) {
    case "ORG_MEMBER_LIMIT_REACHED":
      return {
        errors: { email: `${error.message}. Anula una invitación o bloquea a alguien para liberar una plaza.` },
        formError: null,
      };
    case "ORG_ALREADY_MEMBER":
      return { errors: { email: "Esa persona ya es parte del equipo de la bodega." }, formError: null };
    case "INVITATION_ALREADY_PENDING":
      return {
        errors: { email: "Ya hay una invitación pendiente para ese correo: reenvíala desde la lista." },
        formError: null,
      };
    case "ORG_OWNER_ROLE_RESERVED":
      return {
        errors: { role: "El rol de dirección solo se asigna en el alta o con una transferencia." },
        formError: null,
      };
  }
  if (error.isValidation) {
    const { fieldErrors, formErrors } = fieldErrorsFrom(error, ["email", "role"] as const);
    return {
      errors: fieldErrors,
      formError: formErrors[0] ?? (Object.keys(fieldErrors).length ? null : error.message),
    };
  }
  return { errors: {}, formError: null };
}

/** Códigos del equipo cuyo mensaje del backend ya explica qué pasó (se muestra tal cual). */
const EXPLAINED = new Set([
  "ORG_BLOCKED_BY_PLATFORM",
  "ORG_CANNOT_MODIFY_SELF",
  "ORG_OWNER_ROLE_RESERVED",
  "INVITATION_NOT_PENDING",
  "INVITATION_NOT_FOUND",
  "CONFLICT",
]);

/** Mensaje de un error al bloquear, desbloquear, cambiar el rol, reenviar o anular. */
export function teamActionError(error: unknown, fallback: (e: unknown) => string): string {
  if (error instanceof ApiError && EXPLAINED.has(error.code)) return error.message;
  return fallback(error);
}
