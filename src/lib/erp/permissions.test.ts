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

describe("permisos por membresía activa (contrato de la Ola 0 §6)", () => {
  it("los permisos cambian con la organización activa, no con el rol global", () => {
    expect(erpRole(me(sofia, "altos"))).toBe("ENOLOGIST");
    expect(can(me(sofia, "altos"), "winery.manage")).toBe(false);
    expect(can(me(sofia, "altos"), "tank.create")).toBe(true);
    expect(erpRole(me(sofia, "uriondo"))).toBe("WINERY_ADMIN");
    expect(can(me(sofia, "uriondo"), "winery.manage")).toBe(true);
    expect(can(me(sofia, "uriondo"), "harvest.phyto")).toBe(false);
  });

  it("operario y contabilidad actúan como enología (tabla de compatibilidad hasta H1)", () => {
    expect(erpRole(me([membership({ organizationId: "a", role: "OPERATOR" })], "a"))).toBe("ENOLOGIST");
    expect(erpRole(me([membership({ organizationId: "a", role: "ACCOUNTANT" })], "a"))).toBe("ENOLOGIST");
  });

  it("la plataforma entra en solo lectura", () => {
    const platform = me(
      [membership({ organizationId: "doc", role: "SUPERADMIN", organizationType: "PLATFORM" })],
      "doc",
    );
    expect(isPlatform(platform)).toBe(true);
    expect(canUseErp(platform)).toBe(true);
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
