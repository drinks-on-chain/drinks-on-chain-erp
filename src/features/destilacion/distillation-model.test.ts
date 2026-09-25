import { describe, expect, it } from "vitest";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { lotLookup } from "@/features/vinificacion/tank-model";
import {
  buildProductionRows,
  cutShares,
  distillationCandidates,
  restAllowsBottling,
  restProgress,
  restUntilPreview,
  validateDistillation,
  type DistillationValues,
} from "./distillation-model";

const TODAY = new Date("2026-09-25T12:00:00Z");
const cinti = fx.wineries.find((w) => w.commercialName.includes("Cinti"))!;
const mine = <T extends { wineryId: string }>(xs: T[]) => xs.filter((x) => x.wineryId === cinti.id);

describe("tabla de destilaciones", () => {
  const rows = buildProductionRows({
    productions: mine(fx.productionBatches),
    tanks: mine(fx.fermentationTanks),
    lookup: lotLookup(mine(fx.harvestBatches), mine(fx.terroirs)),
    today: TODAY,
  });

  it("deriva el reposo como rest-status y pone primero lo que reposa", () => {
    expect(rows[0]!.rest).toMatchObject({ restStatus: "RESTING", daysRemaining: 18, isRestCompleted: false });
    expect(rows[1]!.rest.restStatus).toBe("RESTING");
    expect(rows[1]!.rest.daysRemaining).toBeGreaterThan(160);
    expect(rows[0]!.lotName).toBe("Parcela 1 · Los Parrales · Moscatel de Alejandría");
    expect(rows[0]!.heartLiters).toBe(1500);
  });

  it("solo embotella con el reposo cumplido", () => {
    expect(restAllowsBottling(rows[0]!.rest)).toBe(false);
    expect(restAllowsBottling({ isRestCompleted: true, restStatus: "RESTING" })).toBe(true);
    expect(restAllowsBottling({ isRestCompleted: true, restStatus: "BOTTLED" })).toBe(false);
    expect(restAllowsBottling({ isRestCompleted: false, restStatus: "NOT_REQUIRED" })).toBe(true);
    expect(restProgress({ daysElapsed: 90, isRestCompleted: false })).toBe(50);
  });

  it("candidatos: tanques de destino singani no vacíos", () => {
    const codes = distillationCandidates(mine(fx.fermentationTanks)).map((t) => t.tankCode);
    expect(codes).toContain("TK-08");
    expect(codes).not.toContain("TK-05");
    expect(codes).not.toContain("TK-09");
  });
});

describe("cortes del alambique", () => {
  it("proporciones de cabeza, corazón y cola", () => {
    expect(cutShares({ head: 99, heart: 1500, tail: 231 })).toEqual({ head: 5.4, heart: 82, tail: 12.6 });
    expect(cutShares({ head: null, heart: null, tail: null })).toEqual({ head: 0, heart: 0, tail: 0 });
  });

  it("fin del reposo previsto: fin + 180 días", () => {
    expect(restUntilPreview("2026-04-15", "2026-04-16")!.toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(restUntilPreview("2026-09-20", "")!.toISOString().slice(0, 10)).toBe("2027-03-19");
  });

  const base: DistillationValues = {
    fermentationTankId: "t1",
    equipmentIdentifier: "AL-01",
    processStartDate: "2026-09-20",
    processEndDate: "2026-09-21",
    inputVolumeLiters: "6300",
    headDiscardLiters: "78",
    heartYieldLiters: "900",
    tailDiscardLiters: "182",
    initialAlcoholPercentage: "62,1",
    outputVolumeLiters: "900",
    wasteVolumeLiters: "260",
    isDoEligible: true,
    notes: "",
  };
  const ctx = { candidateIds: new Set(["t1"]), doAllowed: true, today: TODAY };

  it("acepta un alta correcta", () => {
    expect(validateDistillation(base, ctx)).toEqual({});
  });

  it("los cortes no pueden superar la entrada y el corazón es obligatorio", () => {
    expect(validateDistillation({ ...base, inputVolumeLiters: "1000" }, ctx).heartYieldLiters).toMatch(
      /superan la entrada/,
    );
    expect(validateDistillation({ ...base, heartYieldLiters: "" }, ctx).heartYieldLiters).toBeDefined();
  });

  it("fechas, grado y D.O.", () => {
    const e = validateDistillation(
      { ...base, processEndDate: "2026-09-19", initialAlcoholPercentage: "120", isDoEligible: true },
      { ...ctx, doAllowed: false },
    );
    expect(Object.keys(e).sort()).toEqual(["initialAlcoholPercentage", "isDoEligible", "processEndDate"]);
  });
});
