import { ApiError } from "@/lib/api/errors";
import { describe, expect, it } from "vitest";
import { erpFixtures } from "@drinks-on-chain/mocks/fixtures";
import type { HarvestBatchResponse } from "@drinks-on-chain/mocks";
import { LAB_TARGETS, outOfRangeCount, readingState, targetText } from "./lab-targets";
import { emptyMaturity, maturityFieldErrors, sortAnalyses, toMaturityDto } from "./maturity";
import {
  availableDecisions,
  canDecidePhyto,
  countByStatus,
  filterHarvests,
  harvestYears,
  requiresReason,
  sortDecisions,
} from "./phyto";
import {
  emptyWeighIn,
  emptyWeighInLot,
  netWeight,
  toHarvestDto,
  weighInFieldErrors,
  weighInLotErrors,
} from "./weigh-in";

const harvests = erpFixtures.harvestBatches as HarvestBatchResponse[];
const NOW = new Date("2026-09-25T12:00:00Z");

describe("objetivos de laboratorio", () => {
  it("clasifica las lecturas contra el objetivo (bordes incluidos)", () => {
    expect(readingState(23.4, LAB_TARGETS.brix)).toBe("in");
    expect(readingState(22, LAB_TARGETS.brix)).toBe("in");
    expect(readingState(25.1, LAB_TARGETS.brix)).toBe("high");
    expect(readingState(3.1, LAB_TARGETS.ph)).toBe("low");
    expect(readingState(null, LAB_TARGETS.acidity)).toBe("empty");
    expect(readingState(Number.NaN, LAB_TARGETS.acidity)).toBe("empty");
  });

  it("textos de objetivo como en la maqueta", () => {
    expect(targetText(LAB_TARGETS.brix)).toBe("Objetivo 22–25");
    expect(targetText(LAB_TARGETS.ph)).toBe("Objetivo 3,2–3,6");
    expect(targetText(LAB_TARGETS.acidity)).toBe("g/L · objetivo 5–7");
  });

  it("cuenta lecturas fuera de objetivo", () => {
    expect(outOfRangeCount({ brixDegrees: 23.4, initialPh: 3.4, initialAcidityGl: 5.9 })).toBe(0);
    expect(outOfRangeCount({ brixDegrees: 21.2, initialPh: 3.8, initialAcidityGl: 5.9 })).toBe(2);
  });

  it("un pesaje sin análisis no tiene lecturas fuera de objetivo", () => {
    expect(outOfRangeCount({ brixDegrees: null, initialPh: null, initialAcidityGl: null })).toBe(0);
  });
});

describe("pesaje", () => {
  const filled = {
    ...emptyWeighIn(NOW, "t-1"),
    grossWeightKg: "18.550",
    tareWeightKg: "150",
    brixDegrees: "23,4",
    initialPh: "3.40",
    initialAcidityGl: "5,9",
  };

  it("valores iniciales con la fecha de hoy", () => {
    expect(emptyWeighIn(NOW)).toMatchObject({ harvestYear: "2026", intakeDate: "2026-09-25T12:00", terroirId: "" });
  });

  it("neto en vivo = bruto − tara", () => {
    expect(netWeight("18.550", "150")).toBe(18400);
    expect(netWeight("1200,5", "0,5")).toBe(1200);
    expect(netWeight("", "150")).toBeNull();
  });

  it("construye el cuerpo con el análisis de madurez y sin dictamen", () => {
    const r = toHarvestDto({ ...filled, temperatureAtIntakeC: "15,8", notes: "  Uva sana " }, NOW);
    expect(r).toEqual({
      ok: true,
      dto: {
        terroirId: "t-1",
        intakeDate: "2026-09-25T12:00:00.000Z",
        harvestYear: 2026,
        grossWeightKg: 18550,
        tareWeightKg: 150,
        maturity: { brixDegrees: 23.4, ph: 3.4, acidityGl: 5.9 },
        temperatureAtIntakeC: 15.8,
        notes: "Uva sana",
      },
    });
  });

  it("el análisis es opcional, pero completo; el bruto, mayor que la tara", () => {
    const r = toHarvestDto({ ...emptyWeighIn(NOW), grossWeightKg: "100", tareWeightKg: "150" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["tareWeightKg", "terroirId"]);

    // Sin análisis: pesaje sin `maturity` ni campos planos, y nunca con dictamen.
    const plain = toHarvestDto({ ...filled, brixDegrees: "", initialPh: "", initialAcidityGl: "" }, NOW);
    expect(plain.ok && plain.dto).not.toHaveProperty("maturity");
    expect(plain.ok && plain.dto).not.toHaveProperty("phytosanitaryStatus");

    const partial = toHarvestDto({ ...filled, initialPh: "", initialAcidityGl: "" }, NOW);
    expect(partial.ok).toBe(false);
    if (partial.ok) return;
    expect(Object.keys(partial.errors).sort()).toEqual(["initialAcidityGl", "initialPh"]);
  });

  it("rechaza fechas futuras y pH imposibles", () => {
    const r = toHarvestDto({ ...filled, intakeDate: "2026-09-26T08:00", initialPh: "15" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.intakeDate).toMatch(/posterior/);
    expect(r.errors.initialPh).toMatch(/2 a 5/);
  });

  it("uva sin lote, a un lote existente o con un lote nuevo de la añada del pesaje", () => {
    const none = toHarvestDto(filled, NOW);
    expect(none.ok && none.dto).not.toHaveProperty("lotId");
    expect(none.ok && none.dto).not.toHaveProperty("newLot");

    const existing = toHarvestDto({ ...filled, lotChoice: "lot-1" }, NOW);
    expect(existing.ok && existing.dto.lotId).toBe("lot-1");

    const lot = { ...emptyWeighInLot(NOW), name: "Singani Gran Reserva 2026", productType: "SINGANI" as const };
    const created = toHarvestDto({ ...filled, lotChoice: "new", harvestYear: "2025" }, NOW, {
      ...lot,
      estimatedBottles: "3.000",
      plannedFormatCl: "75",
      targetAbvPercent: "40",
    });
    expect(created.ok && created.dto.newLot).toEqual({
      name: "Singani Gran Reserva 2026",
      harvestYear: 2025,
      productType: "SINGANI",
      estimatedBottles: 3000,
      plannedFormatCl: 75,
      targetAbvPercent: 40,
    });

    const unnamed = toHarvestDto({ ...filled, lotChoice: "new" }, NOW, emptyWeighInLot(NOW));
    expect(unnamed.ok).toBe(false);
    if (unnamed.ok) return;
    expect(unnamed.lotErrors.name).toBeDefined();
  });

  it("lleva los details del 422 a los campos", () => {
    const error = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: [
        { field: "maturity.brixDegrees", message: "fuera de rango" },
        { field: "terroirId", message: "D.O. Singani: la parcela no es apta", code: "TRC_DO_TERROIR_NOT_ELIGIBLE" },
        { field: "newLot.name", message: "muy corto" },
        { field: null, message: "otra cosa" },
      ],
    });
    expect(weighInFieldErrors(error)).toEqual({
      brixDegrees: "fuera de rango",
      terroirId: "D.O. Singani: la parcela no es apta",
    });
    expect(weighInLotErrors(error)).toEqual({ name: "muy corto" });
  });
});

describe("dictamen y filtros", () => {
  it("solo se dictamina lo pendiente o en cuarentena", () => {
    expect(canDecidePhyto("PENDING_INSPECTION")).toBe(true);
    expect(canDecidePhyto("QUARANTINE")).toBe(true);
    expect(canDecidePhyto("APPROVED")).toBe(false);
    expect(availableDecisions("REJECTED")).toEqual([]);
    expect(availableDecisions("QUARANTINE")).toEqual(["REJECTED", "APPROVED"]);
    expect(availableDecisions("PENDING_INSPECTION")).toHaveLength(3);
  });

  it("filtra por estado y año, del más reciente al más antiguo", () => {
    expect(harvestYears(harvests)).toEqual([2026, 2025, 2024]);
    const pending = filterHarvests(harvests, { status: "PENDING_INSPECTION" });
    expect(pending.length).toBe(countByStatus(harvests).PENDING_INSPECTION);
    const y2025 = filterHarvests(harvests, { year: 2025 });
    expect(y2025.every((h) => h.harvestYear === 2025)).toBe(true);
    const all = filterHarvests(harvests, {});
    expect(all).toHaveLength(harvests.length);
    expect(all[0]!.intakeDate >= all.at(-1)!.intakeDate).toBe(true);
  });
});

describe("análisis de madurez (aparte del pesaje)", () => {
  const filled = { ...emptyMaturity(NOW), brixDegrees: "23,4", ph: "3,40", acidityGl: "5,9" };

  it("construye el cuerpo con la fecha de medición en ISO", () => {
    expect(emptyMaturity(NOW).measuredAt).toBe("2026-09-25T12:00");
    expect(toMaturityDto({ ...filled, notes: " Muestra de la tolva 2 " }, NOW)).toEqual({
      ok: true,
      dto: {
        brixDegrees: 23.4,
        ph: 3.4,
        acidityGl: 5.9,
        measuredAt: "2026-09-25T12:00:00.000Z",
        notes: "Muestra de la tolva 2",
      },
    });
  });

  it("exige las tres lecturas en rango y una medición no futura", () => {
    const r = toMaturityDto({ ...emptyMaturity(NOW), ph: "6", measuredAt: "2026-09-26T08:00" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["acidityGl", "brixDegrees", "measuredAt", "ph"]);
    expect(r.errors.ph).toMatch(/2 a 5/);
  });

  it("el análisis vigente es el de la medición más reciente", () => {
    const analysis = (id: string, measuredAt: string) => ({
      id,
      harvestBatchId: "h",
      brixDegrees: 23,
      ph: 3.4,
      acidityGl: 6,
      measuredAt,
      recordedAt: "2026-09-25T12:00:00Z",
      recordedBy: null,
      notes: null,
      source: "ERP" as const,
    });
    const sorted = sortAnalyses([analysis("a", "2026-09-01T08:00:00Z"), analysis("b", "2026-09-10T08:00:00Z")]);
    expect(sorted.map((a) => a.id)).toEqual(["b", "a"]);
    expect(sortAnalyses(undefined)).toEqual([]);
  });

  it("lleva los details del 422 a los campos", () => {
    const error = new ApiError({
      status: 422,
      code: "TRC_DATE_IN_FUTURE",
      message: "La fecha no puede ser futura",
      details: [{ field: "measuredAt", message: "Fecha futura", code: "TRC_DATE_IN_FUTURE" }],
    });
    expect(maturityFieldErrors(error)).toEqual({ measuredAt: "Fecha futura" });
  });
});

describe("historial de dictámenes", () => {
  it("rechazar y poner en cuarentena exigen motivo; aprobar no", () => {
    expect(requiresReason("REJECTED")).toBe(true);
    expect(requiresReason("QUARANTINE")).toBe(true);
    expect(requiresReason("APPROVED")).toBe(false);
  });

  it("ordena del más reciente al más antiguo: el primero es el vigente", () => {
    const decisions = erpFixtures.phytoDecisions;
    const sorted = sortDecisions(decisions);
    expect(sorted).toHaveLength(decisions.length);
    expect(sorted[0]!.decidedAt >= sorted.at(-1)!.decidedAt).toBe(true);
    expect(sortDecisions(undefined)).toEqual([]);
  });
});
