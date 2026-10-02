import { describe, expect, it } from "vitest";
import type { ProductionBatchResponse, WineAgingResponse } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { ApiError } from "@/lib/api/errors";
import {
  bottlingFieldErrors,
  emptyBottling,
  lotBottlingSources,
  suggestedWaterLiters,
  toLotBottlingDto,
  violationField,
  type BottlingSource,
  type BottlingValues,
} from "./bottling-model";

const base: BottlingValues = {
  ...emptyBottling("2026-09-25", { plannedFormatCl: 75, targetAbvPercent: 40 }),
  totalBottlesPackaged: "2.950",
};

describe("formulario del embotellado", () => {
  it("parte del formato y el grado previstos del lote", () => {
    expect(base).toMatchObject({ bottlingDate: "2026-09-25", packagingFormatCl: "75", finalAlcoholAbv: "40" });
    expect(emptyBottling("2026-09-25", { plannedFormatCl: null, targetAbvPercent: 12.5 })).toMatchObject({
      packagingFormatCl: "75",
      finalAlcoholAbv: "12,5",
    });
  });

  it("envía lo que se llenó, sin tipo de producto ni fuentes: los deriva el servidor", () => {
    expect(toLotBottlingDto(base)).toEqual({
      ok: true,
      dto: { bottlingDate: "2026-09-25", packagingFormatCl: 75, totalBottlesPackaged: 2950, finalAlcoholAbv: 40 },
    });
  });

  it("lee las cifras en es-BO: 2.950 botellas, 750 L de agua, 12,5 L de remanente", () => {
    const r = toLotBottlingDto({
      ...base,
      waterDilutionLiters: "750",
      leftoverLiters: "12,5",
      leftoverDisposition: "DISCARDED",
      leftoverNotes: " Fondo del depósito ",
      bottleType: "Bordelesa",
      labelDesignKey: "uploads/etiqueta.png",
    });
    expect(r.ok && r.dto).toEqual({
      bottlingDate: "2026-09-25",
      packagingFormatCl: 75,
      totalBottlesPackaged: 2950,
      finalAlcoholAbv: 40,
      waterDilutionLiters: 750,
      leftover: { liters: 12.5, disposition: "DISCARDED", notes: "Fondo del depósito" },
      bottleType: "Bordelesa",
      labelDesignKey: "uploads/etiqueta.png",
    });
  });

  it("valida la forma, no el balance", () => {
    const r = toLotBottlingDto({
      ...base,
      bottlingDate: "",
      packagingFormatCl: "0,5",
      totalBottlesPackaged: "1,5",
      finalAlcoholAbv: "140",
      waterDilutionLiters: "-3",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual([
        "bottlingDate",
        "finalAlcoholAbv",
        "packagingFormatCl",
        "totalBottlesPackaged",
        "waterDilutionLiters",
      ]);
    }
    // 90.000 botellas de un lote de 1.500 L: lo rechaza el servidor con su regla, no el formulario.
    expect(toLotBottlingDto({ ...base, totalBottlesPackaged: "90.000" }).ok).toBe(true);
  });

  it("lleva los errores y las violaciones del servidor a sus campos", () => {
    const error = new ApiError({
      status: 422,
      code: "TRC_BOTTLING_EXCEEDS_VOLUME",
      message: "Se embotella más de lo disponible",
      details: [
        { field: "totalBottlesPackaged", message: "Caben 2.950 botellas", code: "TRC_BOTTLING_EXCEEDS_VOLUME" },
        { field: "leftover.liters", message: "Remanente inválido" },
      ],
    });
    expect(bottlingFieldErrors(error)).toEqual({
      totalBottlesPackaged: "Caben 2.950 botellas",
      leftoverLiters: "Remanente inválido",
    });
    expect(violationField("finalAlcoholAbv")).toBe("finalAlcoholAbv");
    expect(violationField("leftover")).toBe("leftoverLiters");
    expect(violationField("sources")).toBeUndefined();
    expect(violationField(null)).toBeUndefined();
  });
});

describe("fuentes del lote", () => {
  const LOT = "4af50d09-875b-5d1d-b026-62d60ae13b35"; // Moscatel de Alejandría 2026, en reposo.

  it("singani: las destilaciones del lote sin embotellar ni descartar, con su corazón", () => {
    const sources = lotBottlingSources(LOT, fx.wineAging, fx.productionBatches);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.kind === "REST")).toBe(true);
    expect(sources.find((s) => s.liters === 1500)).toMatchObject({ abvPercent: 60, open: false });
  });

  const aging = (over: Partial<WineAgingResponse>): WineAgingResponse => ({ ...fx.wineAging[0]!, lotId: "L", ...over });
  const production = (over: Partial<ProductionBatchResponse>): ProductionBatchResponse => ({
    ...fx.productionBatches[0]!,
    lotId: "L",
    ...over,
  });

  it("deja fuera lo embotellado, lo descartado y lo de otros lotes; marca la destilación abierta", () => {
    const sources = lotBottlingSources(
      "L",
      [
        aging({ id: "a1", agingStatus: "AGING", containerType: "Barrica", containerCode: "B-1", volumeLiters: 225 }),
        aging({ id: "a2", agingStatus: "BOTTLED" }),
        aging({ id: "a3", agingStatus: "DISCARDED" }),
        aging({ id: "a4", agingStatus: "READY", lotId: "otro" }),
      ],
      [
        production({ id: "p1", restStatus: "RESTING", processEndDate: null }),
        production({ id: "p2", restStatus: "BOTTLED" }),
      ],
    );
    expect(sources.map((s) => [s.id, s.kind, s.open])).toEqual([
      ["a1", "AGING", false],
      ["p1", "REST", true],
    ]);
    expect(sources[0]!.label).toBe("Barrica B-1");
  });
});

describe("agua sugerida para la dilución", () => {
  const heart = (liters: number | null, abvPercent: number | null): BottlingSource => ({
    id: "p",
    kind: "REST",
    label: "AL-01",
    liters,
    abvPercent,
    lock: null,
    open: false,
  });

  it("1.500 L al 60 % bajados a 40 %: 750 L de agua", () => {
    expect(suggestedWaterLiters([heart(1500, 60)], 40)).toBe(750);
  });

  it("no sugiere nada sin datos, sin corazones o si el grado final no es menor", () => {
    expect(suggestedWaterLiters([heart(1500, null)], 40)).toBeNull();
    expect(suggestedWaterLiters([heart(1500, 60)], 60)).toBeNull();
    expect(suggestedWaterLiters([heart(1500, 60)], null)).toBeNull();
    expect(suggestedWaterLiters([], 40)).toBeNull();
  });
});
