import { afterEach, describe, expect, it } from "vitest";
import type { MeResponse, Membership } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import {
  canReadAuditWhileInactive,
  clearOrgInactive,
  flagOrgInactive,
  getOrgInactiveFlag,
  inactiveOrganization,
  orgNotActiveStatus,
} from "./org-status";

const membership = (over: Partial<Membership> = {}): Membership => ({
  id: "m1",
  organizationId: "w1",
  organizationType: "WINERY",
  organizationName: "Casa Uriondo",
  organizationStatus: "ACTIVE",
  role: "OWNER",
  status: "ACTIVE",
  ...over,
});

const me = (memberships: Membership[], activeOrganizationId: string | null): MeResponse =>
  ({ user: { id: "u1" }, memberships, activeOrganizationId }) as unknown as MeResponse;

const notActive = (message: unknown) =>
  new ApiError({
    status: 403,
    code: "ORG_NOT_ACTIVE",
    message: "La bodega no está activa",
    details: [{ field: null, message }],
  });

describe("orgNotActiveStatus", () => {
  it("lee el estado de details", () => {
    expect(orgNotActiveStatus(notActive("SUSPENDED"))).toBe("SUSPENDED");
    expect(orgNotActiveStatus(notActive("REVOKED"))).toBe("REVOKED");
    expect(orgNotActiveStatus(notActive("INVITED"))).toBe("INVITED");
    expect(orgNotActiveStatus(notActive("RARO"))).toBe("UNKNOWN");
  });

  it("ignora otros errores", () => {
    expect(orgNotActiveStatus(new ApiError({ status: 403, code: "FORBIDDEN", message: "x" }))).toBeNull();
    expect(orgNotActiveStatus(new Error("x"))).toBeNull();
  });
});

describe("inactiveOrganization", () => {
  it("bodega activa: nada", () => {
    expect(inactiveOrganization(me([membership()], "w1"))).toBeNull();
    expect(inactiveOrganization(undefined)).toBeNull();
  });

  it("la membresía activa en una bodega no activa manda", () => {
    expect(inactiveOrganization(me([membership({ organizationStatus: "SUSPENDED" })], "w1"))).toEqual({
      status: "SUSPENDED",
      organizationId: "w1",
      organizationName: "Casa Uriondo",
      role: "OWNER",
    });
  });

  it("un 403 reciente manda aunque `me` diga ACTIVE", () => {
    expect(inactiveOrganization(me([membership()], "w1"), "REVOKED")?.status).toBe("REVOKED");
  });

  it("la plataforma no se ve afectada", () => {
    const platform = membership({ organizationType: "PLATFORM", organizationId: "p", role: "SUPERADMIN" });
    expect(inactiveOrganization(me([platform], "p"), "SUSPENDED")).toBeNull();
  });

  it("sin organización activa, explica la bodega revocada", () => {
    const revoked = membership({
      organizationId: "v",
      organizationName: "Valle Escondido",
      organizationStatus: "REVOKED",
    });
    expect(inactiveOrganization(me([revoked], null))?.status).toBe("REVOKED");
    expect(
      inactiveOrganization(me([membership({ status: "BLOCKED", organizationStatus: "REVOKED" })], null)),
    ).toBeNull();
  });

  it("en SUSPENDED solo la dirección lee la bitácora", () => {
    const org = (status: "SUSPENDED" | "INVITED", role: string) => ({
      status,
      role,
      organizationId: "w1",
      organizationName: "X",
    });
    expect(canReadAuditWhileInactive(org("SUSPENDED", "OWNER"))).toBe(true);
    expect(canReadAuditWhileInactive(org("SUSPENDED", "ENOLOGIST"))).toBe(false);
    expect(canReadAuditWhileInactive(org("INVITED", "OWNER"))).toBe(false);
  });
});

describe("aviso del último 403", () => {
  afterEach(() => clearOrgInactive());

  it("se registra solo con ORG_NOT_ACTIVE y se borra al cambiar de sesión", () => {
    expect(flagOrgInactive(new Error("x"))).toBe(false);
    expect(getOrgInactiveFlag()).toBeNull();
    expect(flagOrgInactive(notActive("SUSPENDED"))).toBe(true);
    expect(getOrgInactiveFlag()?.status).toBe("SUSPENDED");
    clearOrgInactive();
    expect(getOrgInactiveFlag()).toBeNull();
  });
});
