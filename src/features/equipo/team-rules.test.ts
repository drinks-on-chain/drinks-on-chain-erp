import { describe, expect, it } from "vitest";
import type { Invitation, Member } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import {
  INVITABLE_ROLES,
  blockedByText,
  invitationActions,
  invitationUrgency,
  inviteErrors,
  memberActions,
  openInvitations,
  sortMembers,
  teamActionError,
  teamCapacity,
  validateInvite,
} from "./team-rules";

const member = (over: Partial<Member> = {}): Member => ({
  membershipId: "m1",
  userId: "u1",
  fullName: "Carla Villarroel",
  email: "carla@altos.test",
  role: "ENOLOGIST",
  status: "ACTIVE",
  blockedBy: null,
  blockedReason: null,
  joinedAt: "2026-06-04T12:00:00Z",
  lastLoginAt: null,
  ...over,
});

const invitation = (over: Partial<Invitation> = {}): Invitation => ({
  id: "i1",
  email: "nuevo@altos.test",
  organizationId: "o1",
  organizationType: "WINERY",
  organizationName: "Altos",
  role: "AGRONOMIST",
  status: "PENDING",
  expiresAt: "2026-09-28T12:00:00Z",
  createdAt: "2026-09-25T12:00:00Z",
  invitedBy: { userId: "owner", fullName: "Martín", viaPlatform: false },
  ...over,
});

const owner = { userId: "owner", isOwner: true };

describe("memberActions", () => {
  it("la dirección cambia el rol y bloquea a un miembro activo", () => {
    expect(memberActions(member(), owner)).toEqual({ changeRole: true, block: true, unblock: false, locked: null });
  });

  it("desbloquea lo que bloqueó la dirección, no lo que bloqueó la plataforma", () => {
    expect(memberActions(member({ status: "BLOCKED", blockedBy: "OWNER" }), owner)).toMatchObject({
      unblock: true,
      block: false,
      locked: null,
    });
    expect(memberActions(member({ status: "BLOCKED", blockedBy: "PLATFORM" }), owner)).toEqual({
      changeRole: false,
      block: false,
      unblock: false,
      locked: "PLATFORM",
    });
  });

  it("no se toca a sí misma ni a la dirección", () => {
    expect(memberActions(member({ userId: "owner", role: "OWNER" }), owner).locked).toBe("SELF");
    expect(memberActions(member({ role: "OWNER" }), owner).locked).toBe("OWNER");
  });

  it("los demás roles solo leen", () => {
    expect(memberActions(member(), { userId: "x", isOwner: false })).toEqual({
      changeRole: false,
      block: false,
      unblock: false,
      locked: null,
    });
  });
});

describe("miembros", () => {
  it("dirección primero, después activos y bloqueados, por nombre", () => {
    const sorted = sortMembers([
      member({ membershipId: "b", fullName: "Zoe", status: "BLOCKED", blockedBy: "OWNER" }),
      member({ membershipId: "a", fullName: "Ana" }),
      member({ membershipId: "o", fullName: "Martín", role: "OWNER" }),
      member({ membershipId: "c", fullName: "Ángel" }),
    ]);
    expect(sorted.map((m) => m.membershipId)).toEqual(["o", "a", "c", "b"]);
  });

  it("explica quién bloqueó", () => {
    expect(blockedByText(member())).toBeNull();
    expect(blockedByText(member({ status: "BLOCKED", blockedBy: "PLATFORM" }))).toMatch(/Drinks on Chain/);
    expect(blockedByText(member({ status: "BLOCKED", blockedBy: "OWNER" }))).toMatch(/dirección/);
  });

  it("los roles invitables nunca incluyen la dirección", () => {
    expect(INVITABLE_ROLES.map((r) => r.value)).not.toContain("OWNER");
  });
});

describe("invitaciones", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it("muestra pendientes y caducadas, las que vencen antes primero", () => {
    const list = openInvitations([
      invitation({ id: "late", expiresAt: "2026-09-30T00:00:00Z" }),
      invitation({ id: "accepted", status: "ACCEPTED" }),
      invitation({ id: "expired", status: "EXPIRED", expiresAt: "2026-09-20T00:00:00Z" }),
      invitation({ id: "revoked", status: "REVOKED" }),
      invitation({ id: "soon", expiresAt: "2026-09-26T00:00:00Z" }),
    ]);
    expect(list.map((i) => i.id)).toEqual(["expired", "soon", "late"]);
  });

  it("urgencia: caducada, menos de 24 h o con tiempo", () => {
    expect(invitationUrgency(invitation({ status: "EXPIRED" }), now)).toBe("expired");
    expect(invitationUrgency(invitation({ expiresAt: "2026-09-25T11:00:00Z" }), now)).toBe("expired");
    expect(invitationUrgency(invitation({ expiresAt: "2026-09-26T06:00:00Z" }), now)).toBe("soon");
    expect(invitationUrgency(invitation({ expiresAt: "2026-09-28T12:00:00Z" }), now)).toBe("ok");
  });

  it("reenviar pendientes o caducadas; anular solo pendientes", () => {
    expect(invitationActions(invitation())).toEqual({ resend: true, revoke: true });
    expect(invitationActions(invitation({ status: "EXPIRED" }))).toEqual({ resend: true, revoke: false });
    expect(invitationActions(invitation({ status: "ACCEPTED" }))).toEqual({ resend: false, revoke: false });
  });

  it("plazas: miembros activos más invitaciones pendientes contra el límite", () => {
    const members = [member(), member({ membershipId: "b", status: "BLOCKED", blockedBy: "OWNER" })];
    const invitations = [invitation(), invitation({ id: "x", status: "EXPIRED" })];
    expect(teamCapacity(members, invitations, 2)).toEqual({ used: 2, limit: 2, full: true });
    expect(teamCapacity(members, invitations, 6)).toEqual({ used: 2, limit: 6, full: false });
    expect(teamCapacity(members, invitations, null)).toEqual({ used: 2, limit: null, full: false });
  });
});

describe("formulario de invitación", () => {
  it("arma el cuerpo con el correo en minúsculas", () => {
    expect(validateInvite({ email: " Rosa@Altos.TEST ", role: "AGRONOMIST" })).toEqual({
      errors: {},
      dto: { email: "rosa@altos.test", role: "AGRONOMIST" },
    });
  });

  it("pide correo válido y rol", () => {
    const { errors, dto } = validateInvite({ email: "rosa@", role: "" });
    expect(dto).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(["email", "role"]);
  });

  it("pone cada error del backend en su campo", () => {
    const err = (status: number, code: string, message = code) => new ApiError({ status, code, message });
    const limit = inviteErrors(err(422, "ORG_MEMBER_LIMIT_REACHED", "La bodega alcanzó su límite de 6 colaboradores"));
    expect(limit.errors.email).toMatch(/límite de 6.*liberar una plaza/);
    expect(inviteErrors(err(409, "ORG_ALREADY_MEMBER")).errors.email).toMatch(/ya es parte/);
    expect(inviteErrors(err(409, "INVITATION_ALREADY_PENDING")).errors.email).toMatch(/reenvíala/);
    expect(inviteErrors(err(403, "ORG_OWNER_ROLE_RESERVED")).errors.role).toMatch(/dirección/);
    const validation = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Datos no válidos",
      details: [{ field: "email", message: "El correo no es válido" }],
    });
    expect(inviteErrors(validation)).toEqual({ errors: { email: "El correo no es válido" }, formError: null });
    expect(inviteErrors(new Error("x"))).toEqual({ errors: {}, formError: null });
  });

  it("los errores de las acciones muestran el mensaje del backend cuando ya explica el motivo", () => {
    const fallback = () => "genérico";
    const platform = new ApiError({ status: 403, code: "ORG_BLOCKED_BY_PLATFORM", message: "Solo la plataforma" });
    expect(teamActionError(platform, fallback)).toBe("Solo la plataforma");
    expect(teamActionError(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "x" }), fallback)).toBe(
      "genérico",
    );
  });
});
