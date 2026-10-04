import { describe, expect, it } from "vitest";
import type { BottlingBalance, LotBalance } from "@drinks-on-chain/mocks";
import { balanceSteps, bottlingMeters, projectionText } from "./balance-model";

const bottling: BottlingBalance = {
  availableLiters: 1500,
  waterDilutionLiters: 750,
  bottledLiters: 2212.5,
  leftoverLiters: 20,
  lossLiters: 17.5,
  lossPercent: 0.78,
  maxLossPercent: 3,
  pureAlcohol: { availableLiters: 900, bottledLiters: 885 },
  maxBottles: 3000,
};

const singani: LotBalance = {
  harvest: { netKg: 12100, approvedKg: 12100, rejectedKg: 0, pendingKg: 0 },
  must: { filledLiters: 8500, litersPerKg: 0.7 },
  fermentation: { finalLiters: 8300, lossLiters: 200, lossPercent: 2.35 },
  distillation: {
    inputLiters: 8300,
    headsLiters: 99,
    heartLiters: 1500,
    tailsLiters: 231,
    heartAbvPercent: 60,
    pureAlcoholLiters: 900,
  },
  bottling,
  projection: { bottles: 2950, basis: "BOTTLED" },
};

describe("pasos de la conciliación", () => {
  it("singani: uva → mosto → vino base → corazón → embotellado, con las cifras del servidor", () => {
    const steps = balanceSteps(singani);
    expect(steps.map((s) => s.key)).toEqual(["harvest", "must", "baseWine", "heart", "bottled"]);
    expect(steps.map((s) => s.value)).toEqual(["12.100 kg", "8.500 L", "8.300 L", "1.500 L", "2.212,5 L"]);
    expect(steps[1]!.detail).toBe("0,70 L por kg de uva");
    expect(steps[2]!.loss).toBe("Merma de fermentación: 200 L (2,35 %)");
    expect(steps[3]!.detail).toBe("al 60 % vol · 900 L de alcohol puro");
    expect(steps[3]!.loss).toBe("De 8.300 L destilados: cabezas 99 L · colas 231 L");
    expect(steps[4]).toMatchObject({ detail: "2.950 botellas", loss: "Merma de embotellado: 17,5 L (0,78 %)" });
  });

  it("vino: la crianza sustituye al corazón; lo no registrado queda sin cifra", () => {
    const wine: LotBalance = {
      harvest: { netKg: 5000, approvedKg: 3000, rejectedKg: 500, pendingKg: 1500 },
      must: { filledLiters: 0, litersPerKg: null },
      fermentation: { finalLiters: null, lossLiters: null, lossPercent: null },
      aging: { liters: 3000, lossLiters: 40 },
      bottling: null,
      projection: { bottles: 4000, basis: "DECLARED" },
    };
    const steps = balanceSteps(wine);
    expect(steps.map((s) => s.key)).toEqual(["harvest", "must", "baseWine", "aging", "bottled"]);
    expect(steps[0]!.detail).toBe("3.000 kg aprobados · 1.500 kg sin dictamen · 500 kg rechazados");
    expect(steps.map((s) => s.value)).toEqual(["5.000 kg", null, null, "3.000 L", null]);
    expect(steps[3]!.loss).toBe("Merma de trasiego: 40 L");
  });

  it("proyección: la base la dice el servidor", () => {
    expect(projectionText({ bottles: 2950, basis: "BOTTLED" })).toBe("2.950 botellas embotelladas");
    expect(projectionText({ bottles: 2850, basis: "DISTILLATE" })).toBe(
      "≈ 2.850 botellas, según el corazón de la destilación",
    );
    expect(projectionText({ bottles: null, basis: "MUST" })).toBeNull();
  });
});

describe("medidores del embotellado", () => {
  it("volumen, merma y alcohol puro frente a sus límites", () => {
    const meters = bottlingMeters(bottling);
    expect(meters.map((m) => [m.key, m.value, m.max, m.over])).toEqual([
      ["volume", 2212.5, 2250, false],
      ["loss", 0.78, 3, false],
      ["alcohol", 885, 900, false],
    ]);
    expect(meters[0]!.valueText).toBe("2.212,5 L de 2.250 L");
    expect(meters[0]!.note).toBe(
      "1.500 L de las fuentes + 750 L de agua · remanente declarado: 20 L · caben como máximo 3.000 botellas",
    );
    expect(meters[1]!.valueText).toBe("0,78 % (17,5 L) · tolerada: 3 %");
  });

  it("el vino no tiene medidor de alcohol", () => {
    expect(bottlingMeters({ ...bottling, pureAlcohol: null }).map((m) => m.key)).toEqual(["volume", "loss"]);
  });

  it("solo resalta lo que el servidor dio por incumplido, aunque la cifra supere el límite", () => {
    const over = { ...bottling, lossPercent: 9, pureAlcohol: { availableLiters: 900, bottledLiters: 990 } };
    expect(bottlingMeters(over).some((m) => m.over)).toBe(false);
    const flagged = bottlingMeters(over, ["TRC_ALCOHOL_BALANCE_EXCEEDED"]);
    expect(flagged.filter((m) => m.over).map((m) => m.key)).toEqual(["alcohol"]);
    expect(
      bottlingMeters(over, ["TRC_BOTTLING_LOSS_ABOVE_TOLERANCE", "TRC_BOTTLING_EXCEEDS_VOLUME"]).map((m) => m.over),
    ).toEqual([true, true, false]);
  });
});
