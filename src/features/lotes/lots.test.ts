import { describe, expect, it } from "vitest";
import { deriveLotViews, type LotChain } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { filterLots, lockLabel, lotLock, lotTimeline } from "./lots";

const TODAY = new Date("2026-09-25T12:00:00Z");

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

const cinti = chainOf("Cinti");
const lots = deriveLotViews(cinti, { today: TODAY });

describe("filterLots", () => {
  it("filtra por etapa, tipo y búsqueda sin acentos", () => {
    const all = { stage: "todas", kind: "todos", q: "" } as const;
    expect(filterLots(lots, all)).toHaveLength(lots.length);
    const reposo = filterLots(lots, { ...all, stage: "reposo" });
    expect(reposo.length).toBeGreaterThan(0);
    expect(reposo.every((l) => l.stage === "reposo")).toBe(true);
    expect(filterLots(lots, { ...all, kind: "vino" }).every((l) => l.kind === "vino")).toBe(true);
    expect(filterLots(lots, { ...all, q: "parrales" }).map((l) => l.harvestBatchCode)).toContain(
      "HARV-2026-PARRALES-01",
    );
    expect(filterLots(lots, { ...all, q: "canon viejo" }).length).toBeGreaterThan(0);
    expect(filterLots(lots, { ...all, q: "CVJ-2026-SINGANI-001" })).toHaveLength(1);
  });
});

describe("lotLock", () => {
  it("días de reposo y crianza a la fecha de hoy", () => {
    const parrales = lots.find((l) => l.harvestBatchCode === "HARV-2026-PARRALES-01")!;
    const lock = lotLock(parrales, TODAY)!;
    expect(lock).toMatchObject({ kind: "reposo", released: false, days: 18 });
    expect(lockLabel(lock)).toBe("Faltan 18 días");
    const bottled = lots.find((l) => l.stage === "embotellado")!;
    expect(lotLock(bottled, TODAY)).toBeNull();
    expect(lockLabel(null)).toBe("—");
  });

  it("una crianza con la fecha cumplida figura como liberada", () => {
    const altos = deriveLotViews(chainOf("Altos"), { today: TODAY });
    const crianza = altos.filter((l) => l.stage === "crianza").map((l) => lotLock(l, TODAY)!);
    expect(crianza.map((l) => l.days).sort((a, b) => a - b)).toEqual([39, 156]);
    expect(
      lotLock({ ...altos[0]!, lock: { kind: "crianza", unlockAt: "2026-09-01T00:00:00Z", released: false } }, TODAY),
    ).toMatchObject({
      released: true,
      days: 0,
    });
  });
});

describe("lotTimeline", () => {
  it("singani en reposo: parcela → pesaje → tanques → destilación (actual) → embotellado pendiente", () => {
    const parrales = lots.find((l) => l.harvestBatchCode === "HARV-2026-PARRALES-01")!;
    const steps = lotTimeline(parrales.harvestBatchId, cinti, TODAY)!;
    // Dos tanques (TK-03 y TK-08) y una destilación de cada uno, ambas en reposo.
    expect(steps.map((s) => s.stage)).toEqual([
      "Parcela",
      "Pesaje",
      "Tanque",
      "Tanque",
      "Destilación",
      "Destilación",
      "Embotellado",
    ]);
    expect(steps[0]!.href).toBe(`/origen/${parrales.terroir.id}`);
    expect(steps[1]!.href).toBe(`/vendimia/${parrales.harvestBatchId}`);
    expect(steps.find((s) => s.stage === "Destilación")).toMatchObject({ status: "current" });
    expect(steps.at(-1)).toMatchObject({ status: "pending", href: null });
  });

  it("lote embotellado enlaza con el embotellado", () => {
    const bottled = lots.find((l) => l.internationalLotCode === "CVJ-2026-SINGANI-001")!;
    const steps = lotTimeline(bottled.harvestBatchId, cinti, TODAY)!;
    expect(steps.at(-1)).toMatchObject({
      stage: "Embotellado",
      title: "CVJ-2026-SINGANI-001",
      href: `/envasado/${bottled.bottlingBatchId}`,
      status: "done",
    });
  });

  it("devuelve null si el lote no existe y corta en el rechazo", () => {
    expect(lotTimeline("nope", cinti, TODAY)).toBeNull();
    const all = [...fx.harvestBatches];
    const rejected = all.find((h) => h.phytosanitaryStatus === "REJECTED");
    if (rejected) {
      const chain = { ...cinti, harvestBatches: [rejected], terroirs: fx.terroirs };
      expect(lotTimeline(rejected.id, chain, TODAY)!.map((s) => s.stage)).toEqual(["Parcela", "Pesaje"]);
    }
  });
});
