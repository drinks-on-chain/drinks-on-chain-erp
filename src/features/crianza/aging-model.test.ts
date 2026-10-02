import { describe, expect, it } from "vitest";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { lotLookup } from "@/features/vinificacion/tank-model";
import {
  addMonths,
  agingCandidates,
  agingLock,
  buildBarrelRows,
  computeUnlockDate,
  validateAging,
  type AgingValues,
} from "./aging-model";

const TODAY = new Date("2026-09-25T12:00:00Z");
const altos = fx.wineries.find((w) => w.commercialName.includes("Calamuchita"))!;
const mine = <T extends { wineryId: string }>(xs: T[]) => xs.filter((x) => x.wineryId === altos.id);

describe("fechas de crianza", () => {
  it("suma meses y ajusta al último día del mes", () => {
    expect(addMonths("2026-01-31", 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(computeUnlockDate("2026-09-25", 12).toISOString().slice(0, 10)).toBe("2027-09-25");
    expect(addMonths("2026-11-03T00:00:00Z", -12).toISOString().slice(0, 10)).toBe("2025-11-03");
  });

  it("candado activo: días que faltan y progreso", () => {
    const lock = agingLock({ lockUntilDate: "2026-11-03T00:00:00Z", plannedMonths: 12, agingStatus: "AGING" }, TODAY);
    expect(lock.daysRemaining).toBe(39);
    expect(lock.released).toBe(false);
    expect(lock.startDate.slice(0, 10)).toBe("2025-11-03");
    expect(lock.progress).toBeGreaterThan(85);
    expect(lock.progress).toBeLessThan(100);
  });

  it("candado vencido o crianza liberada", () => {
    const past = agingLock({ lockUntilDate: "2026-02-01T00:00:00Z", plannedMonths: 10, agingStatus: "AGING" }, TODAY);
    expect(past).toMatchObject({ daysRemaining: 0, released: true, progress: 100 });
    const ready = agingLock({ lockUntilDate: "2027-02-01T00:00:00Z", plannedMonths: 10, agingStatus: "READY" }, TODAY);
    expect(ready).toMatchObject({ daysRemaining: 0, released: true });
  });
});

describe("tabla de barricas", () => {
  const rows = buildBarrelRows({
    agings: mine(fx.wineAging),
    tanks: mine(fx.fermentationTanks),
    lookup: lotLookup(mine(fx.harvestBatches), mine(fx.terroirs)),
    today: TODAY,
  });

  it("pone primero las crianzas en curso, por días restantes", () => {
    expect(rows.slice(0, 2).map((r) => r.containerCode)).toEqual(["BAR-FR-2024-01", "BAR-US-2024-07"]);
    expect(rows[0]!.lotName).toBe("Cuartel 1 · La Angostura · Tannat");
    expect(rows[0]!.lock.daysRemaining).toBe(39);
    // Las cerradas (embotellada y descartada), al final.
    expect(
      rows
        .slice(2)
        .map((r) => r.status)
        .sort(),
    ).toEqual(["BOTTLED", "DISCARDED"]);
  });

  it("solo ofrece tanques con la fermentación completada, destino vino y sin crianza previa", () => {
    const tank = mine(fx.fermentationTanks)[0]!;
    const tanks = [
      { ...tank, id: "a", tankCode: "A", destinationType: "WINE_AGING" as const, status: "COMPLETED" as const },
      { ...tank, id: "b", tankCode: "B", destinationType: "WINE_AGING" as const, status: "FERMENTING" as const },
      { ...tank, id: "c", tankCode: "C", destinationType: "SINGANI_DIST" as const, status: "COMPLETED" as const },
      { ...tank, id: "d", tankCode: "D", destinationType: "WINE_AGING" as const, status: "COMPLETED" as const },
    ];
    expect(agingCandidates(tanks, [{ fermentationTankId: "d" }]).map((t) => t.tankCode)).toEqual(["A"]);
  });
});

describe("validación del alta", () => {
  const base: AgingValues = {
    fermentationTankId: "t1",
    containerType: "Barrica",
    containerMaterial: "Roble francés",
    containerCode: "BAR-FR-2026-01",
    barrelUseCycle: "1",
    containerCount: "",
    volumeLiters: "3000",
    plannedMonths: "12",
    startDate: "2026-09-25",
    notes: "",
  };
  const ctx = { candidateIds: new Set(["t1"]), today: TODAY };
  it("acepta un alta correcta y rechaza meses decimales, recipientes o volumen mal escritos", () => {
    expect(validateAging(base, ctx)).toEqual({});
    const e = validateAging(
      { ...base, plannedMonths: "1,5", volumeLiters: "", containerCount: "0", fermentationTankId: "t9" },
      ctx,
    );
    expect(Object.keys(e).sort()).toEqual(["containerCount", "fermentationTankId", "plannedMonths", "volumeLiters"]);
  });

  it("no comprueba el volumen del tanque ni el mínimo de meses: lo hace el servidor", () => {
    expect(validateAging({ ...base, volumeLiters: "90.000", plannedMonths: "0" }, ctx)).toEqual({});
  });
});
