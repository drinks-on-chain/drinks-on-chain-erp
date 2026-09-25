import { describe, expect, it } from "vitest";
import { deriveLotViews, type LotChain } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { buildDashboard, TEMP_ALERT_C } from "./build-dashboard";

const TODAY = new Date("2026-09-25T12:00:00Z");

// La cadena de una bodega, filtrada como lo haría el backend con el token.
function chainOf(wineryName: string): LotChain {
  const winery = fx.wineries.find((w) => w.commercialName.includes(wineryName))!;
  const mine = <T extends { wineryId: string }>(xs: T[]) => xs.filter((x) => x.wineryId === winery.id);
  return {
    harvestBatches: mine(fx.harvestBatches),
    terroirs: mine(fx.terroirs),
    tanks: mine(fx.fermentationTanks),
    wineAgings: mine(fx.wineAging),
    productionBatches: mine(fx.productionBatches),
    bottlings: mine(fx.bottling),
  };
}

function dashboardOf(wineryName: string) {
  const chain = chainOf(wineryName);
  const lots = deriveLotViews(chain, { today: TODAY });
  const tankDetails = chain.tanks
    .filter((t) => t.status === "FERMENTING")
    .map((t) => ({ ...t, logs: fx.fermentationLogs.filter((l) => l.fermentationTankId === t.id) }));
  return { chain, lots, dashboard: buildDashboard({ chain, lots, tankDetails, today: TODAY }) };
}

describe("buildDashboard", () => {
  for (const name of ["Cinti", "Calamuchita"]) {
    it(`es coherente con la cadena de ${name}`, () => {
      const { chain, lots, dashboard } = dashboardOf(name);
      expect(dashboard.activeLots).toBe(lots.filter((l) => !["embotellado", "rechazado"].includes(l.stage)).length);
      expect(dashboard.fermenting).toBe(chain.tanks.filter((t) => t.status === "FERMENTING").length);
      expect(dashboard.kgToday).toBe(
        chain.harvestBatches
          .filter((h) => h.intakeDate.startsWith("2026-09-25"))
          .reduce((s, h) => s + h.netWeightKg, 0),
      );
      // Cada pesaje pendiente de inspección genera una tarea.
      const pending = chain.harvestBatches.filter((h) => h.phytosanitaryStatus === "PENDING_INSPECTION");
      expect(dashboard.tasks.filter((t) => t.kind === "phyto")).toHaveLength(pending.length);
      // Las tareas urgentes van primero.
      const firstNonUrgent = dashboard.tasks.findIndex((t) => !t.urgent);
      if (firstNonUrgent >= 0) expect(dashboard.tasks.slice(firstNonUrgent).every((t) => !t.urgent)).toBe(true);
    });
  }

  it("avisa de la temperatura alta de un tanque en fermentación", () => {
    const all = ["Cinti", "Calamuchita"].map((n) => dashboardOf(n).dashboard);
    const temps = all.flatMap((d) => d.tasks.filter((t) => t.kind === "temperature"));
    expect(temps.length).toBeGreaterThan(0);
    const hot = all.find((d) => d.tasks.some((t) => t.kind === "temperature"))!;
    expect(hot.alerts.count).toBeGreaterThan(0);
    expect(hot.alerts.detail).toMatch(/^Temperatura/);
    expect(TEMP_ALERT_C).toBe(26);
  });

  it("lista los candados con los días restantes, liberados al final", () => {
    const { dashboard } = dashboardOf("Cinti");
    const reposo = dashboard.locks.find((l) => l.kind === "reposo" && !l.released);
    expect(reposo?.daysRemaining).toBe(18);
    const firstReleased = dashboard.locks.findIndex((l) => l.released);
    if (firstReleased >= 0) expect(dashboard.locks.slice(firstReleased).every((l) => l.released)).toBe(true);
  });
});
