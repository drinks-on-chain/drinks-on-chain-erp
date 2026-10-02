import { describe, expect, it } from "vitest";
import type { AuditEvent, EffectiveSetting } from "@drinks-on-chain/mocks";
import { auditActionLabel, auditActor, auditChanges, auditQuery, emptyAuditFilters } from "./audit-model";
import { formatSettingValue, settingGroup, settingUnit, sortSettings } from "./effective-settings";

describe("configuración efectiva", () => {
  it("formatea cada tipo de valor", () => {
    expect(formatSettingValue("trazabilidad.singani.reposoMinimoDias", 180)).toBe("180 días");
    expect(formatSettingValue("trazabilidad.singani.altitudMinimaMsnm", 1600)).toBe("1.600 m s. n. m.");
    expect(formatSettingValue("trazabilidad.embotellado.mermaMaximaPorcentaje", 5)).toBe("5 %");
    expect(formatSettingValue("trazabilidad.fitosanitario.exigirAprobado", true)).toBe("Sí");
    expect(formatSettingValue("equipo.maxColaboradoresPorBodega", null)).toBe("Sin límite");
    expect(formatSettingValue("precio.politica", null)).toBe("Sin definir");
    expect(formatSettingValue("canje.ventanaVencida.accion", "BURN")).toBe("Quemar");
    expect(formatSettingValue("trazabilidad.singani.variedadesExigidas", ["Moscatel de Alejandría"])).toBe(
      "Moscatel de Alejandría",
    );
    // Los límites de laboratorio se leen por el nombre del parámetro, no por su clave.
    expect(
      formatSettingValue("trazabilidad.laboratorio.limites", {
        cobre: { max: 6, unidad: "mg/l" },
        acidezVolatil: { max: 1.2, unidad: "g/l" },
        grado: { min: 38, max: 46, unidad: "% vol" },
        otroParametro: { max: 3, unidad: "mg/l" },
      }),
    ).toBe(
      "Cobre: máx. 6 mg/l · Acidez volátil: máx. 1,20 g/l · Grado alcohólico: mín. 38 y máx. 46 % vol · otroParametro: máx. 3 mg/l",
    );
  });

  it("agrupa y ordena por área", () => {
    expect(settingGroup("equipo.maxColaboradoresPorBodega")).toBe("Equipo");
    expect(settingGroup("nuevo.parametro")).toBe("Otros");
    expect(settingUnit("invitacion.caducidadHoras")).toBe("h");
    expect(settingUnit("canje.ventanaVencida.diasAviso")).toBe("días");
    expect(settingUnit("compra.minutosReserva")).toBe("min");
    expect(settingUnit("compra.maxBotellasPorCompra")).toBe("botellas");
    expect(settingUnit("canje.entregaAsistida.maxPorClienteMes")).toBeNull();
    const s = (key: string): EffectiveSetting => ({
      key,
      description: key,
      value: 1,
      source: "GLOBAL",
      appliesAt: "LOT",
    });
    expect(sortSettings([s("trazabilidad.b"), s("canje.a"), s("equipo.x")]).map((x) => x.key)).toEqual([
      "canje.a",
      "equipo.x",
      "trazabilidad.b",
    ]);
  });
});

describe("bitácora propia", () => {
  const event = (over: Partial<AuditEvent> = {}): AuditEvent =>
    ({
      id: "e1",
      seq: 10,
      occurredAt: "2026-09-25T12:00:00Z",
      actor: { userId: null, fullName: null, role: null, organizationId: null, viaPlatform: false },
      source: { app: "ERP", ip: null, deviceId: null },
      action: "MEMBER_BLOCKED",
      resource: { type: "MEMBERSHIP", id: "m1" },
      organizationId: "w1",
      before: { status: "ACTIVE" },
      after: { status: "BLOCKED", blockedBy: "OWNER" },
      reason: null,
      correlationId: null,
      hash: "h",
      prevHash: null,
      ...over,
    }) as AuditEvent;

  it("arma la consulta con los filtros y la página", () => {
    expect(auditQuery(emptyAuditFilters(), 0)).toEqual({ limit: 20, offset: 0 });
    expect(auditQuery({ from: "2026-09-01", to: "2026-09-25", action: "MEMBER_BLOCKED" }, 40)).toEqual({
      limit: 20,
      offset: 40,
      from: "2026-09-01",
      to: "2026-09-25",
      action: "MEMBER_BLOCKED",
    });
    expect(auditQuery(emptyAuditFilters(), -5).offset).toBe(0);
  });

  it("nombra la acción, al sistema y los cambios", () => {
    expect(auditActionLabel("MEMBER_BLOCKED")).toBe("Miembro bloqueado");
    expect(auditActionLabel("ALGO_NUEVO")).toBe("ALGO_NUEVO");
    expect(auditActor(event())).toEqual({ name: "Sistema", viaPlatform: false });
    expect(auditChanges(event())).toEqual(["status: ACTIVE → BLOCKED", "blockedBy: OWNER"]);
    expect(auditChanges(event({ before: null, after: null }))).toEqual([]);
  });
});
