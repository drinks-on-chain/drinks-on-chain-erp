import { describe, expect, it } from "vitest";
import { erpFixtures } from "@drinks-on-chain/mocks/fixtures";
import type { HarvestBatchResponse } from "@drinks-on-chain/mocks";
import { LAB_TARGETS, outOfRangeCount, readingState, targetText } from "./lab-targets";
import { availableDecisions, canDecidePhyto, countByStatus, filterHarvests, harvestYears } from "./phyto";
import { emptyWeighIn, netWeight, toHarvestDto, weighInFieldErrors } from "./weigh-in";

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

  it("construye el DTO con las lecturas obligatorias", () => {
    const r = toHarvestDto({ ...filled, temperatureAtIntakeC: "15,8", notes: "  Uva sana " }, NOW);
    expect(r).toEqual({
      ok: true,
      dto: {
        terroirId: "t-1",
        intakeDate: "2026-09-25T12:00:00.000Z",
        harvestYear: 2026,
        grossWeightKg: 18550,
        tareWeightKg: 150,
        brixDegrees: 23.4,
        initialPh: 3.4,
        initialAcidityGl: 5.9,
        temperatureAtIntakeC: 15.8,
        notes: "Uva sana",
      },
    });
  });

  it("exige Brix, pH y acidez, y bruto mayor que tara", () => {
    const r = toHarvestDto({ ...emptyWeighIn(NOW), grossWeightKg: "100", tareWeightKg: "150" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["brixDegrees", "initialAcidityGl", "initialPh", "tareWeightKg", "terroirId"].sort(),
    );
  });

  it("rechaza fechas futuras y pH imposibles", () => {
    const r = toHarvestDto({ ...filled, intakeDate: "2026-09-26T08:00", initialPh: "15" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.intakeDate).toMatch(/posterior/);
    expect(r.errors.initialPh).toMatch(/0 a 14/);
  });

  it("lleva los details del 422 a los campos", () => {
    expect(weighInFieldErrors(["brixDegrees es obligatorio", "initialPh es obligatorio", "otra cosa"])).toEqual({
      brixDegrees: "es obligatorio",
      initialPh: "es obligatorio",
    });
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
    expect(harvestYears(harvests)).toEqual([2026, 2025]);
    const pending = filterHarvests(harvests, { status: "PENDING_INSPECTION" });
    expect(pending.length).toBe(countByStatus(harvests).PENDING_INSPECTION);
    const y2025 = filterHarvests(harvests, { year: 2025 });
    expect(y2025.every((h) => h.harvestYear === 2025)).toBe(true);
    const all = filterHarvests(harvests, {});
    expect(all).toHaveLength(harvests.length);
    expect(all[0]!.intakeDate >= all.at(-1)!.intakeDate).toBe(true);
  });
});
