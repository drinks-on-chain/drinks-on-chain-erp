import { describe, expect, it } from "vitest";
import type { MeResponse, Membership } from "@drinks-on-chain/mocks";
import { can, canUseErp, erpRole, isPlatform } from "./permissions";

const membership = (m: Partial<Membership> & Pick<Membership, "organizationId" | "role">): Membership => ({
  id: `m-${m.organizationId}`,
  organizationType: "WINERY",
  organizationName: m.organizationId,
  organizationStatus: "ACTIVE",
  status: "ACTIVE",
  ...m,
});

const me = (memberships: Membership[], activeOrganizationId: string | null, audience: "STAFF" | "CONSUMER" = "STAFF") =>
  ({
    user: { audience, userRole: "ENOLOGIST" },
    memberships,
    activeOrganizationId,
  }) as unknown as MeResponse;

// Sofía: enóloga en Altos y dueña de Casa Uriondo (usuaria de demo de los mocks 0.2).
const sofia = [
  membership({ organizationId: "altos", role: "ENOLOGIST" }),
  membership({ organizationId: "uriondo", role: "OWNER" }),
];

const only = (role: Membership["role"]) => me([membership({ organizationId: "w", role })], "w");

describe("permisos por membresía activa (matriz del backend O0-BE-4)", () => {
  it("los permisos cambian con la organización activa, no con el rol global", () => {
    expect(erpRole(me(sofia, "altos"))).toBe("ENOLOGIST");
    expect(can(me(sofia, "altos"), "winery.manage")).toBe(false);
    expect(can(me(sofia, "altos"), "tank.create")).toBe(true);
    expect(erpRole(me(sofia, "uriondo"))).toBe("OWNER");
    expect(can(me(sofia, "uriondo"), "winery.manage")).toBe(true);
    expect(can(me(sofia, "uriondo"), "harvest.phyto")).toBe(true);
  });

  it("operario: pesa y registra lecturas; nada de parcelas, crianza, destilación ni embotellado", () => {
    const op = only("OPERATOR");
    expect(can(op, "harvest.create")).toBe(true);
    expect(can(op, "tank.log")).toBe(true);
    expect(can(op, "harvest.read")).toBe(true);
    for (const action of [
      "terroir.read",
      "terroir.write",
      "harvest.phyto",
      "tank.create",
      "tank.treatment",
      "aging.read",
      "distillation.read",
      "bottling.read",
      "lab.read",
      "lab.create",
    ] as const) {
      expect(can(op, action), action).toBe(false);
    }
  });

  it("contabilidad solo lee", () => {
    const acc = only("ACCOUNTANT");
    expect(can(acc, "terroir.read")).toBe(true);
    expect(can(acc, "bottling.read")).toBe(true);
    expect(can(acc, "lab.read")).toBe(true);
    expect(can(acc, "harvest.create")).toBe(false);
    expect(can(acc, "tank.log")).toBe(false);
  });

  it("agronomía registra lecturas y dictamina, pero no lee crianza ni embotellado; la dirección dictamina", () => {
    const agro = only("AGRONOMIST");
    expect(can(agro, "tank.log")).toBe(true);
    expect(can(agro, "harvest.phyto")).toBe(true);
    expect(can(agro, "terroir.write")).toBe(true);
    expect(can(agro, "aging.read")).toBe(false);
    expect(can(agro, "bottling.read")).toBe(false);
    expect(can(only("OWNER"), "harvest.phyto")).toBe(true);
    expect(can(only("ENOLOGIST"), "terroir.write")).toBe(false);
  });

  it("la plataforma lee pero no escribe desde el ERP", () => {
    const platform = me(
      [membership({ organizationId: "doc", role: "SUPERADMIN", organizationType: "PLATFORM" })],
      "doc",
    );
    expect(isPlatform(platform)).toBe(true);
    expect(canUseErp(platform)).toBe(true);
    expect(can(platform, "terroir.read")).toBe(true);
    expect(can(platform, "terroir.write")).toBe(false);
  });

  it("sin organización activa, bloqueada o de consumidor, el ERP no es para esa sesión", () => {
    expect(canUseErp(me(sofia, null))).toBe(false);
    expect(canUseErp(me([membership({ organizationId: "a", role: "ENOLOGIST", status: "BLOCKED" })], "a"))).toBe(false);
    expect(canUseErp(me([], null, "CONSUMER"))).toBe(false);
    expect(
      canUseErp(me([membership({ organizationId: "p", role: "CASHIER", organizationType: "PICKUP_POINT" })], "p")),
    ).toBe(false);
    expect(can(undefined, "tank.log")).toBe(false);
  });
});
