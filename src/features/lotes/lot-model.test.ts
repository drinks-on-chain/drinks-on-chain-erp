import { describe, expect, it } from "vitest";
import type { Lot } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { ApiError } from "@/lib/api/errors";
import {
  EMPTY_LOT_FILTERS,
  FILTER_STAGES,
  effectiveRuleItems,
  emptyLotForm,
  hasLotFilters,
  isTerminalStage,
  lockBadgeText,
  lockRuleText,
  lockStatusText,
  lotFieldErrors,
  lotListQuery,
  nextStep,
  snapshotItems,
  stageView,
  toCreateLotDto,
} from "./lot-model";

const NOW = new Date("2026-09-25T12:00:00Z");
const lots = fx.lots as Lot[];
const byRef = (reference: string) => lots.find((l) => l.reference === reference)!;

describe("etapa del lote (contrato §16.3)", () => {
  it("vendimia con dictamen pendiente, en cuarentena o con uva aprobada", () => {
    expect(stageView(byRef("CVJ-L2026-002"))).toMatchObject({ label: "Vendimia", detail: "Dictamen pendiente" });
    expect(stageView(byRef("ALT-L2026-003"))).toMatchObject({ detail: "Uva en cuarentena", tone: "warning" });
    expect(
      stageView({
        stage: "HARVEST",
        awaitingBifurcation: false,
        phyto: { pending: 0, quarantine: 0, approved: 1, rejected: 0 },
      }).detail,
    ).toBe("Uva aprobada");
  });

  it("fermentación con tanques sin destino = por bifurcar; el resto, su etiqueta", () => {
    const fermenting = byRef("ALT-L2026-005");
    expect(stageView(fermenting)).toMatchObject({ label: "Fermentación", strong: false });
    expect(stageView({ ...fermenting, awaitingBifurcation: true })).toMatchObject({
      label: "Por bifurcar",
      strong: true,
    });
    expect(stageView(byRef("CVJ-L2026-001")).label).toBe("Reposo");
    // Desde la Ola 3 el expediente cerrado pasa a anclado: es la etapa final visible del lote.
    expect(stageView(byRef("CVJ-L2026-005")).label).toBe("Anclado en la red");
    expect(stageView({ ...byRef("CVJ-L2026-005"), stage: "CERTIFIED" }).label).toBe("Expediente cerrado");
    expect(isTerminalStage("CERTIFIED")).toBe(true);
    expect(isTerminalStage("ANCHORED")).toBe(true);
    expect(FILTER_STAGES).toContain("ANCHORED");
    expect(isTerminalStage("RESTING")).toBe(false);
  });
});

describe("candado con los valores del servidor", () => {
  it("reposo: regla de la instantánea, días que faltan y fecha", () => {
    const lock = byRef("CVJ-L2026-001").nextLock!;
    expect(lockRuleText(lock)).toBe("Reposo mínimo de 180 días");
    expect(lockStatusText(lock)).toBe("Faltan 18 días · se libera el 13 oct 2026");
    expect(lockBadgeText(lock)).toBe("Faltan 18 días");
    expect(lockBadgeText({ ...lock, released: true, daysRemaining: 0 })).toBe("Liberado");
    expect(lockStatusText({ ...lock, released: true, daysRemaining: 0 })).toBe("Liberado el 13 oct 2026");
  });

  it("crianza: meses fijados, mínimo de la bodega y excepción legal", () => {
    const lock = byRef("ALT-L2025-001").nextLock!;
    expect(lockRuleText(lock)).toMatch(/^Crianza de \d+ meses fijada para el lote/);
    expect(lockRuleText({ ...lock, rule: { ...lock.rule, applied: 12, minimum: 6, legalException: true } })).toBe(
      "Crianza de 12 meses fijada para el lote (mínimo de la bodega: 6 meses) · excepción legal autorizada",
    );
  });
});

describe("instantánea de reglas", () => {
  it("lista las reglas del lote con su valor, origen y excepción legal", () => {
    const items = snapshotItems(byRef("CVJ-L2026-005").rules);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey["trazabilidad.singani.altitudMinimaMsnm"]).toMatchObject({
      value: "1.600 m s. n. m.",
      legalException: false,
    });
    expect(byKey["trazabilidad.singani.variedadesExigidas"]!.value).toBe("Moscatel de Alejandría");
    expect(byKey["trazabilidad.singani.reposoMinimoDias"]!.value).toBe("180 días");
    expect(byKey["trazabilidad.embotellado.mermaMaximaPorcentaje"]!.value).toBe("5 %");
    expect(byKey["trazabilidad.fitosanitario.exigirAprobado"]!.value).toBe("Sí");
  });

  it("marca la excepción legal de Altos (altitud mínima de 1.500 m, A-31)", () => {
    const altos = snapshotItems(byRef("ALT-L2026-005").rules);
    const altitude = altos.find((i) => i.key === "trazabilidad.singani.altitudMinimaMsnm")!;
    expect(altitude).toMatchObject({ value: "1.500 m s. n. m.", legalException: true, source: "WINERY" });
  });

  it("anticipa las reglas vigentes que se fijarán en un lote nuevo", () => {
    const setting = (key: string, value: unknown, appliesAt: "LOT" | "IMMEDIATE" = "LOT") => ({
      key,
      description: key,
      value,
      source: "GLOBAL" as const,
      appliesAt,
    });
    const items = effectiveRuleItems([
      setting("equipo.maxColaboradoresPorBodega", 6, "IMMEDIATE"),
      setting("trazabilidad.embotellado.mermaMaximaPorcentaje", 5),
      { ...setting("trazabilidad.singani.reposoMinimoDias", 180), source: "WINERY" as const },
      setting("trazabilidad.excepcionMinimoLegal", false),
    ]);
    // Solo los parámetros de lote que el ERP sabe rotular, en el orden de la ficha.
    expect(items.map((i) => [i.label, i.value, i.source])).toEqual([
      ["Reposo mínimo tras la destilación", "180 días", "WINERY"],
      ["Merma máxima tolerada al embotellar", "5 %", "GLOBAL"],
    ]);
  });
});

describe("filtros de la lista", () => {
  it("solo envía al servidor los filtros aplicados", () => {
    const page = { limit: 20, offset: 40 };
    expect(lotListQuery(EMPTY_LOT_FILTERS, page)).toEqual(page);
    expect(hasLotFilters(EMPTY_LOT_FILTERS)).toBe(false);
    const filters = {
      stage: "RESTING" as const,
      productType: "SINGANI" as const,
      q: "  gran reserva ",
      issuesOnly: true,
    };
    expect(lotListQuery(filters, page)).toEqual({
      ...page,
      stage: ["RESTING"],
      productType: "SINGANI",
      q: "gran reserva",
      hasComplianceIssues: true,
    });
    expect(hasLotFilters(filters)).toBe(true);
  });
});

describe("siguiente paso", () => {
  it("origen → pesaje; vendimia aprobada → tanque; candado sin cumplir → nada; cumplido → embotellar", () => {
    expect(nextStep(byRef("CVJ-L2026-003"))).toMatchObject({ label: "Registrar pesaje", action: "harvest.create" });
    const pending = byRef("CVJ-L2026-002");
    expect(nextStep(pending)).toMatchObject({
      label: "Ver el pesaje",
      href: `/vendimia/${pending.links.harvestBatchIds[0]}`,
    });
    expect(nextStep({ ...pending, phyto: { pending: 0, quarantine: 0, approved: 1, rejected: 0 } })).toMatchObject({
      label: "Llenar tanque",
      href: `/vinificacion/nuevo?lote=${pending.id}`,
    });
    const resting = byRef("CVJ-L2026-001");
    expect(nextStep(resting)).toBeNull();
    expect(
      nextStep({ ...resting, nextLock: { ...resting.nextLock!, released: true, daysRemaining: 0 } }),
    ).toMatchObject({
      label: "Embotellar",
      href: `/lotes/${resting.id}/embotellar`,
    });
    expect(nextStep(byRef("CVJ-L2026-005"))).toBeNull();
  });
});

describe("alta del lote", () => {
  const filled = {
    ...emptyLotForm(NOW),
    name: " Singani Gran Reserva 2026 ",
    productType: "SINGANI" as const,
    estimatedBottles: "3.000",
    plannedFormatCl: "75",
    targetAbvPercent: "40",
  };

  it("arma el cuerpo del caso del contrato §18 sin enviar lo vacío", () => {
    expect(toCreateLotDto(filled, NOW)).toEqual({
      ok: true,
      dto: {
        name: "Singani Gran Reserva 2026",
        harvestYear: 2026,
        productType: "SINGANI",
        estimatedBottles: 3000,
        plannedFormatCl: 75,
        targetAbvPercent: 40,
      },
    });
    const minimal = toCreateLotDto({ ...emptyLotForm(NOW), name: "Tannat 2026" }, NOW);
    expect(minimal).toEqual({ ok: true, dto: { name: "Tannat 2026", harvestYear: 2026 } });
  });

  it("valida forma y rangos (las reglas las aplica el servidor)", () => {
    const r = toCreateLotDto(
      {
        ...filled,
        name: "ab",
        harvestYear: "2027",
        estimatedBottles: "200.000",
        plannedFormatCl: "2",
        targetAbvPercent: "90",
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["estimatedBottles", "harvestYear", "name", "plannedFormatCl", "targetAbvPercent"].sort(),
    );
  });

  it("lleva los details del servidor a los campos, también los de newLot", () => {
    const error = new ApiError({
      status: 422,
      code: "TRC_DO_TERROIR_NOT_ELIGIBLE",
      message: "Una parcela prevista no es apta para la D.O. Singani",
      details: [
        {
          field: "plannedTerroirIds",
          message: "D.O. Singani: la cepa no está entre las exigidas",
          code: "TRC_DO_TERROIR_NOT_ELIGIBLE",
        },
        { field: "newLot.name", message: "muy corto" },
      ],
    });
    expect(lotFieldErrors(error)).toEqual({ plannedTerroirIds: "D.O. Singani: la cepa no está entre las exigidas" });
    expect(lotFieldErrors(error, "newLot")).toEqual({ name: "muy corto" });
  });
});
