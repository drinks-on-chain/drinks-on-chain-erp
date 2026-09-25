import { describe, expect, it } from "vitest";
import type { LotChain } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { lockMessage, parseDecimal, validateBottling } from "./bottling-form-model";
import { computeYield, SHRINKAGE_WARN_PCT, yieldInputFromSource } from "./bottling-summary";
import { bottleCodes, bottleCodesCsv, marketplaceOrigin, passportUrl, serialWidth } from "./qr-codes";
import { bottlingSources, resolvePreselected, sourceKey } from "./sources";

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

describe("bottlingSources", () => {
  it("Altos: todas las crianzas sin embotellar siguen bloqueadas el 25-09-2026", () => {
    const open = bottlingSources(chainOf("Altos"), TODAY).filter((s) => !s.bottled);
    expect(open.length).toBe(2);
    expect(open.every((s) => s.kind === "crianza" && s.locked)).toBe(true);
    const first = open.find((s) => s.aging?.lockUntilDate === "2026-11-03T00:00:00Z")!;
    expect(first.daysRemaining).toBe(39);
    expect(first.productType).toBe("WINE");
  });

  it("Cinti Viejo: una destilación con reposo cumplido y dos en reposo", () => {
    const open = bottlingSources(chainOf("Cinti"), TODAY).filter((s) => !s.bottled);
    const ready = open.filter((s) => !s.locked);
    expect(ready.map((s) => s.id)).toEqual(["a6dd3060-8612-5595-b9b4-33a7d039159c"]);
    expect(ready[0]!.productType).toBe("SINGANI");
    const resting = open.filter((s) => s.locked);
    expect(resting.map((s) => s.daysRemaining).sort((a, b) => a - b)).toEqual([18, 167]);
  });

  it("una crianza READY que ya tiene embotellado cuenta como embotellada", () => {
    const s = bottlingSources(chainOf("Cinti"), TODAY).find((x) => x.id === "a48ddc67-0e24-51fe-a43d-877f55ac9de6")!;
    expect(s.bottled).toBe(true);
  });

  it("resuelve la fuente de la URL, y por lote prefiere la liberada sin embotellar", () => {
    const sources = bottlingSources(chainOf("Cinti"), TODAY);
    const id = "a6dd3060-8612-5595-b9b4-33a7d039159c";
    expect(resolvePreselected(sources, { destilacion: id })?.key).toBe(sourceKey("destilacion", id));
    const harvestId = sources.find((s) => s.id === id)!.harvest!.id;
    expect(resolvePreselected(sources, { lote: harvestId })?.id).toBe(id);
    expect(resolvePreselected(sources, { crianza: "nope" })).toBeNull();
    expect(resolvePreselected(sources, {})).toBeNull();
  });
});

describe("computeYield", () => {
  it("singani: corazón a 60 % bajado a 40 % (ejemplo de la maqueta)", () => {
    const y = computeYield({
      productType: "SINGANI",
      harvestKg: 18_400,
      baseWineLiters: 12_100,
      heartLiters: 1_500,
      heartAbv: 60,
      agingLiters: null,
      finalAbv: 40,
      waterLiters: 750,
      bottles: 2_950,
      formatCl: 75,
    });
    expect(y.availableLiters).toBe(2_250);
    expect(y.recommendedWaterLiters).toBe(750);
    expect(y.bottledLiters).toBe(2_212.5);
    expect(y.shrinkagePct).toBeCloseTo(1.667, 2);
    expect(y.warning).toBeNull();
    expect(y.steps.map((s) => s.key)).toEqual(["uva", "base", "corazon", "final", "botellas"]);
    expect(y.steps.find((s) => s.key === "final")!.label).toBe("A 40 % vol");
  });

  it("avisa si la merma supera el umbral y si se declaran más litros que los disponibles", () => {
    const base = {
      productType: "WINE" as const,
      harvestKg: 9_000,
      baseWineLiters: 6_700,
      heartLiters: null,
      heartAbv: null,
      agingLiters: 4_050,
      finalAbv: 14,
      waterLiters: null,
      formatCl: 75,
    };
    const high = computeYield({ ...base, bottles: 5_000 });
    expect(high.shrinkagePct!).toBeGreaterThan(SHRINKAGE_WARN_PCT);
    expect(high.warning).toBe("merma-alta");
    expect(computeYield({ ...base, bottles: 5_400 }).warning).toBeNull();
    expect(computeYield({ ...base, bottles: 5_500 }).warning).toBe("excede-volumen");
  });

  it("marca como desconocidos los pasos sin dato y no calcula merma", () => {
    const y = computeYield({
      productType: "SINGANI",
      harvestKg: null,
      baseWineLiters: null,
      heartLiters: null,
      heartAbv: null,
      agingLiters: null,
      finalAbv: 40,
      waterLiters: null,
      bottles: 100,
      formatCl: 75,
    });
    expect(y.steps.filter((s) => s.value === null).map((s) => s.key)).toEqual(["uva", "base", "corazon", "final"]);
    expect(y.shrinkagePct).toBeNull();
    expect(y.warning).toBeNull();
  });

  it("sin grado del corazón usa corazón + agua", () => {
    const y = computeYield({
      productType: "SINGANI",
      harvestKg: null,
      baseWineLiters: null,
      heartLiters: 1_000,
      heartAbv: null,
      agingLiters: null,
      finalAbv: 40,
      waterLiters: 500,
      bottles: null,
      formatCl: 75,
    });
    expect(y.availableLiters).toBe(1_500);
    expect(y.recommendedWaterLiters).toBeNull();
  });

  it("toma los datos de la cadena (embotellado real CVJ-2026-SINGANI-001: merma < 1 %)", () => {
    const chain = chainOf("Cinti");
    const src = bottlingSources(chain, TODAY).find((s) => s.id === "c667fe6f-790b-5fe9-89b1-a13cdef77a4c")!;
    const input = yieldInputFromSource(src, { finalAbv: 40, waterLiters: 1321, bottles: 4080, formatCl: 75 });
    expect(input.heartLiters).toBe(1750);
    expect(input.heartAbv).toBe(70.2);
    expect(input.baseWineLiters).toBe(10_000);
    expect(input.harvestKg).toBeGreaterThan(0);
    const y = computeYield(input);
    expect(y.shrinkagePct!).toBeLessThan(1);
    expect(y.warning).toBeNull();
  });
});

describe("códigos QR", () => {
  it("usa NEXT_PUBLIC_URL_APP y, si falta, el origen de qrBatchUrl", () => {
    expect(marketplaceOrigin("https://app.example.com/", "https://drinksonchain.com/trace/batch/X")).toBe(
      "https://app.example.com",
    );
    expect(marketplaceOrigin("", "https://drinksonchain.com/trace/batch/X")).toBe("https://drinksonchain.com");
    expect(marketplaceOrigin("", null)).toBeNull();
    expect(marketplaceOrigin("", "no es url")).toBeNull();
    expect(passportUrl("https://app.x", "CVJ-2026-SINGANI-001")).toBe("https://app.x/b/CVJ-2026-SINGANI-001");
  });

  it("genera un código por botella con correlativo de al menos 4 dígitos", () => {
    const codes = bottleCodes("ALT-2026-WINE-002", 3, "https://app.x");
    expect(codes).toEqual([
      { serial: "0001", code: "ALT-2026-WINE-002-0001", url: "https://app.x/b/ALT-2026-WINE-002?n=0001" },
      { serial: "0002", code: "ALT-2026-WINE-002-0002", url: "https://app.x/b/ALT-2026-WINE-002?n=0002" },
      { serial: "0003", code: "ALT-2026-WINE-002-0003", url: "https://app.x/b/ALT-2026-WINE-002?n=0003" },
    ]);
    expect(serialWidth(12_000)).toBe(5);
    expect(bottleCodes("L", 12_000, "https://app.x").at(-1)!.serial).toBe("12000");
  });

  it("el CSV tiene cabecera y una fila por botella", () => {
    const csv = bottleCodesCsv("L-1", bottleCodes("L-1", 2, "https://app.x"));
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("codigo,lote,botella,url,estado");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("L-1-0001,L-1,0001,https://app.x/b/L-1?n=0001,provisional");
  });
});

describe("validateBottling", () => {
  const values = {
    finalAbv: "40",
    waterLiters: "150",
    bottles: "800",
    formatCl: "75",
    bottleType: " Vidrio flint 750 ml ",
    bottlingDate: "2026-09-25",
  };
  const sources = bottlingSources(chainOf("Cinti"), TODAY);
  const ready = sources.find((s) => s.id === "a6dd3060-8612-5595-b9b4-33a7d039159c")!;

  it("arma el DTO de una destilación liberada", () => {
    const { errors, dto } = validateBottling(ready, values);
    expect(errors).toEqual({});
    expect(dto).toEqual({
      wineAgingBatchId: null,
      productionBatchId: ready.id,
      productType: "SINGANI",
      finalAlcoholAbv: 40,
      waterDilutionLiters: 150,
      totalBottlesPackaged: 800,
      packagingFormatCl: 75,
      bottleType: "Vidrio flint 750 ml",
      bottlingDate: "2026-09-25",
    });
  });

  it("bloquea una fuente con candado con el motivo y la fecha", () => {
    const locked = bottlingSources(chainOf("Altos"), TODAY).find((s) => s.locked && !s.bottled)!;
    const { errors, dto } = validateBottling(locked, values);
    expect(dto).toBeNull();
    expect(errors.source).toMatch(/Crianza en curso hasta el .* \(faltan \d+ días\)/);
    expect(lockMessage(locked)).toBe(errors.source);
  });

  it("valida cifras: grado sobre el corazón, botellas enteras y fecha", () => {
    const { errors } = validateBottling(ready, { ...values, finalAbv: "70", bottles: "10,5", bottlingDate: "" });
    expect(errors.finalAbv).toMatch(/corazón/);
    expect(errors.bottles).toBeDefined();
    expect(errors.bottlingDate).toBeDefined();
    expect(validateBottling(null, values).errors.source).toBeDefined();
  });

  it("parseDecimal entiende miles y decimales en es-BO", () => {
    expect(parseDecimal("1.500")).toBe(1500);
    expect(parseDecimal("1 500")).toBe(1500);
    expect(parseDecimal("40,5")).toBe(40.5);
    expect(parseDecimal("40.5")).toBe(40.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
});
