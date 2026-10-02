import { describe, expect, it } from "vitest";
import type { LotLockInfo, LotSummary, TraceDashboard } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { dashboardView } from "./trace-dashboard";

const lot = (over: Partial<LotSummary>): LotSummary => ({ ...(fx.lots[0] as LotSummary), ...over });

const lock = (over: Partial<LotLockInfo>): LotLockInfo => ({
  kind: "REST",
  sourceId: "p1",
  unlockDate: "2026-10-13",
  released: false,
  daysRemaining: 18,
  rule: {
    settingKey: "trazabilidad.singani.reposoMinimoDias",
    minimum: 180,
    applied: 180,
    unit: "días",
    legalException: false,
  },
  ...over,
});

const EMPTY: TraceDashboard = {
  lotsByStage: {
    ORIGIN: 0,
    HARVEST: 0,
    FERMENTING: 0,
    AGING: 0,
    DISTILLING: 0,
    RESTING: 0,
    BOTTLED: 0,
    CERTIFIED: 0,
    ANCHORED: 0,
    REJECTED: 0,
    DISCARDED: 0,
  },
  locksDueSoon: [],
  fermentationAlerts: [],
  pendingPhyto: [],
  bottledWithoutLab: [],
  readyToClose: [],
  complianceIssuesOpen: 0,
  unassignedHarvestBatches: 0,
};

describe("panel de la bodega", () => {
  it("sin datos: ni tareas ni alertas", () => {
    expect(dashboardView(EMPTY)).toMatchObject({
      activeLots: 0,
      bottledLots: 0,
      alerts: { count: 0, detail: null },
      tasks: [],
      locks: [],
      stages: [],
    });
  });

  it("cuenta los lotes en proceso y los embotellados con las etapas del servidor", () => {
    const view = dashboardView({
      ...EMPTY,
      lotsByStage: {
        ...EMPTY.lotsByStage,
        ORIGIN: 1,
        HARVEST: 1,
        FERMENTING: 2,
        RESTING: 1,
        BOTTLED: 3,
        CERTIFIED: 1,
        DISCARDED: 1,
      },
    });
    expect(view).toMatchObject({ activeLots: 5, bottledLots: 4, fermentingLots: 2 });
    expect(view.stages.map((s) => s.stage)).toEqual([
      "ORIGIN",
      "HARVEST",
      "FERMENTING",
      "RESTING",
      "BOTTLED",
      "CERTIFIED",
      "DISCARDED",
    ]);
  });

  it("convierte lo que entrega el servidor en tareas, con lo urgente primero", () => {
    const view = dashboardView({
      ...EMPTY,
      fermentationAlerts: [
        {
          tankId: "t1",
          tankCode: "TK-04",
          lotId: "l1",
          kind: "HIGH_TEMPERATURE",
          value: 33.5,
          lastReadingAt: "2026-09-25T08:00:00Z",
        },
        { tankId: "t2", tankCode: "TK-10", lotId: "l2", kind: "NO_READING", value: null, lastReadingAt: null },
      ],
      pendingPhyto: [
        {
          harvestBatchId: "h1",
          harvestBatchCode: "HARV-2026-ROQUE-05",
          lotId: "l3",
          intakeDate: "2026-09-24T00:00:00Z",
          status: "PENDING_INSPECTION",
        },
        {
          harvestBatchId: "h2",
          harvestBatchCode: "HARV-2026-VIEJO-09",
          lotId: null,
          intakeDate: "2026-09-20T00:00:00Z",
          status: "QUARANTINE",
        },
      ],
      bottledWithoutLab: [lot({ id: "l4", name: "Singani Gran Reserva 2026", lotCode: "CVJ-2026-SINGANI-004" })],
      readyToClose: [lot({ id: "l5", name: "Tannat 2025", lotCode: "ALT-2026-WINE-001" })],
      complianceIssuesOpen: 2,
      unassignedHarvestBatches: 1,
    });

    expect(view.tasks.map((t) => [t.kind, t.urgent])).toEqual([
      ["temperature", true],
      ["no-reading", true],
      ["quarantine", true],
      ["issues", true],
      ["phyto", false],
      ["lab", false],
      ["close", false],
      ["unassigned", false],
    ]);
    expect(view.tasks[0]).toMatchObject({ subject: "TK-04 · 33,5 °C", href: "/vinificacion/t1" });
    expect(view.tasks[1]!.subject).toBe("TK-10 · sin lecturas");
    expect(view.tasks.find((t) => t.kind === "phyto")).toMatchObject({
      title: "Dictaminar ingreso de uva",
      subject: "HARV-2026-ROQUE-05 · pesada el 24 sept 2026",
      href: "/vendimia/h1",
    });
    expect(view.tasks.find((t) => t.kind === "lab")!.href).toBe("/lotes/l4?pestana=laboratorio");
    expect(view.tasks.find((t) => t.kind === "close")!.href).toBe("/lotes/l5?pestana=expediente");
    expect(view.tasks.find((t) => t.kind === "issues")).toMatchObject({
      subject: "2 incidencias abiertas",
      href: "/lotes?incidencias=1",
    });
    // Alertas: dos de fermentación, una cuarentena y dos incidencias.
    expect(view.alerts).toEqual({ count: 5, detail: "Temperatura · TK-04" });
  });

  it("ordena los candados por días que faltan y ofrece embotellar el liberado", () => {
    const view = dashboardView({
      ...EMPTY,
      locksDueSoon: [
        { lotId: "a", reference: "CVJ-L2026-001", name: "Moscatel 2026", lock: lock({ daysRemaining: 12 }) },
        { lotId: "b", reference: "CVJ-L2026-005", name: "Gran Reserva", lock: lock({ daysRemaining: 3 }) },
        { lotId: "c", reference: "CVJ-L2026-007", name: "Listo", lock: lock({ daysRemaining: 0, released: true }) },
      ],
    });
    expect(view.locks.map((l) => l.lotId)).toEqual(["b", "a", "c"]);
    expect(view.locksDueSoon).toBe(3);
    expect(view.tasks).toEqual([
      {
        id: "bottle-c",
        kind: "bottle",
        title: "Embotellar lote liberado",
        subject: "Listo · CVJ-L2026-007",
        href: "/lotes/c/embotellar",
        due: "Disponible",
        urgent: false,
      },
    ]);
  });
});
