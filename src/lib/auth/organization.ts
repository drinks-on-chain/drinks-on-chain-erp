import type { Audience, Membership } from "@drinks-on-chain/mocks";
import type { MeResponse } from "./schemas";

// Organización activa y audiencia (contrato de la Ola 0 §4 y §6).

/** Audiencia de esta app: las apps de equipo son de personal (`STAFF`). */
export const APP_AUDIENCE: Audience = "STAFF";

/** Se puede activar: membresía `ACTIVE` en una organización no `REVOKED`. */
export const isUsableMembership = (m: Membership) => m.status === "ACTIVE" && m.organizationStatus !== "REVOKED";

/** Membresías a las que se puede cambiar (el selector aparece si hay más de una). */
export const usableMemberships = (me: MeResponse | undefined): Membership[] =>
  me?.memberships.filter(isUsableMembership) ?? [];

/** Membresía de la organización activa. */
export const activeMembership = (me: MeResponse | undefined): Membership | undefined =>
  me?.activeOrganizationId ? me.memberships.find((m) => m.organizationId === me.activeOrganizationId) : undefined;
