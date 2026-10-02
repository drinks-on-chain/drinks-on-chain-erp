import { describe, expect, it } from "vitest";
import type { LotLockInfo } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { ApiError } from "@/lib/api/errors";
import { lotLookup } from "@/features/vinificacion/tank-model";
import {
  buildProductionRows,
  closeFieldErrors,
  cutShares,
  cutsOf,
  distillationCandidates,
  emptyClose,
  isOpenDistillation,
  restAllowsBottling,
  restView,
  toCloseDistillationDto,
  toOpenDistillationDto,
  type CloseValues,
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

  it("primero la destilación abierta, luego las que reposan por días que faltan, al final lo embotellado", () => {
    expect(rows.map((r) => r.rest.state)).toEqual(["open", "resting", "resting", "bottled", "bottled", "bottled"]);
    expect(rows[0]).toMatchObject({ tankCode: "TK-12", heartLiters: null });
    expect(rows[1]!.rest).toMatchObject({ state: "resting", daysRemaining: 18, restDays: 180, progress: 90 });
    expect(rows[1]).toMatchObject({ heartLiters: 1500, heartAbv: 60 });
    expect(rows[1]!.lotName).toBe("Parcela 1 · Los Parrales · Moscatel de Alejandría");
    expect(rows[2]!.rest.daysRemaining).toBe(167);
  });

  it("solo embotella con el reposo cumplido", () => {
    expect(restAllowsBottling(rows[0]!.rest)).toBe(false);
    expect(restAllowsBottling(rows[1]!.rest)).toBe(false);
    expect(restAllowsBottling({ state: "ready" })).toBe(true);
    expect(restAllowsBottling({ state: "none" })).toBe(true);
    expect(restAllowsBottling({ state: "bottled" })).toBe(false);
    expect(restAllowsBottling({ state: "discarded" })).toBe(false);
  });

  it("candidatos: tanques con la fermentación completada y destino singani", () => {
    const codes = distillationCandidates(mine(fx.fermentationTanks)).map((t) => t.tankCode);
    expect(codes).toEqual(["TK-08"]);
  });
});

describe("reposo", () => {
  const lock = (over: Partial<LotLockInfo>): LotLockInfo => ({
    kind: "REST",
    sourceId: "p1",
    unlockDate: "2026-10-13",
    daysRemaining: 18,
    released: false,
    rule: {
      settingKey: "trazabilidad.singani.reposoMinimoDias",
      applied: 180,
      unit: "días",
      minimum: 180,
      legalException: false,
    },
    ...over,
  });
  const closed = {
    processStartDate: "2026-04-15T00:00:00Z",
    processEndDate: "2026-04-16T00:00:00Z",
    restStatus: "RESTING" as const,
    mandatoryRestUntil: "2026-10-13T00:00:00Z",
  };

  it("con el candado del servidor, los días y la liberación son los suyos", () => {
    // El reloj local diría que faltan 18 días; el servidor dice 3.
    const view = restView({ ...closed, lock: lock({ daysRemaining: 3 }) }, TODAY);
    expect(view).toMatchObject({ state: "resting", daysRemaining: 3, restDays: 180 });
    const released = restView({ ...closed, lock: lock({ daysRemaining: 0, released: true }) }, TODAY);
    expect(released).toMatchObject({ state: "ready", daysRemaining: 0, progress: 100 });
  });

  it("sin candado se estima con la fecha de fin del reposo", () => {
    expect(restView(closed, TODAY)).toMatchObject({ state: "resting", daysRemaining: 18 });
    expect(restView(closed, new Date("2026-10-20T12:00:00Z")).state).toBe("ready");
  });

  it("una destilación sin cerrar no reposa todavía", () => {
    const open = { ...closed, processEndDate: null, mandatoryRestUntil: null };
    expect(restView(open, TODAY)).toMatchObject({ state: "open", progress: 0 });
    expect(isOpenDistillation(open)).toBe(true);
    expect(isOpenDistillation(closed)).toBe(false);
    expect(isOpenDistillation({ processEndDate: null, restStatus: "DISCARDED" })).toBe(false);
    expect(restView({ ...closed, restStatus: "DISCARDED" }, TODAY).state).toBe("discarded");
  });
});

describe("cortes del alambique", () => {
  it("proporciones de cabeza, corazón y cola", () => {
    expect(cutShares({ head: 99, heart: 1500, tail: 231 })).toEqual({ head: 5.4, heart: 82, tail: 12.6 });
    expect(cutShares({ head: null, heart: null, tail: null })).toEqual({ head: 0, heart: 0, tail: 0 });
  });

  it("lee los cortes del registro y, en los antiguos, de additionalParams", () => {
    expect(cutsOf({ headsLiters: 80, heartLiters: 900, tailsLiters: 180, additionalParams: null })).toEqual({
      head: 80,
      heart: 900,
      tail: 180,
    });
    expect(
      cutsOf({
        headsLiters: null,
        heartLiters: null,
        tailsLiters: null,
        additionalParams: { headDiscardLiters: 70, heartYieldLiters: 800, tailDiscardLiters: 150 },
      }),
    ).toEqual({ head: 70, heart: 800, tail: 150 });
  });
});

describe("abrir la destilación", () => {
  const base: DistillationValues = {
    fermentationTankId: "t1",
    equipmentIdentifier: " AL-01 ",
    processStartDate: "2026-09-20",
    inputVolumeLiters: "6.300",
    initialAlcoholPercentage: "",
    notes: "",
  };
  const ctx = { today: TODAY };

  it("envía solo lo que entra al alambique, sin D.O. ni cortes", () => {
    const r = toOpenDistillationDto(base, ctx);
    expect(r).toEqual({
      ok: true,
      dto: {
        fermentationTankId: "t1",
        equipmentIdentifier: "AL-01",
        processStartDate: "2026-09-20",
        inputVolumeLiters: 6300,
      },
    });
  });

  it("valida tanque, alambique, fecha y volumen", () => {
    const r = toOpenDistillationDto(
      {
        ...base,
        fermentationTankId: "",
        equipmentIdentifier: "",
        processStartDate: "2026-09-26",
        inputVolumeLiters: "0",
      },
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual([
        "equipmentIdentifier",
        "fermentationTankId",
        "inputVolumeLiters",
        "processStartDate",
      ]);
    }
  });
});

describe("cerrar la destilación", () => {
  const base: CloseValues = {
    ...emptyClose("2026-09-21"),
    headsLiters: "78",
    heartLiters: "900",
    tailsLiters: "182",
    heartAbvPercent: "62,1",
  };

  it("arma los cortes y el grado del corazón", () => {
    expect(toCloseDistillationDto({ ...base, vinasseLiters: "4.000" }, TODAY)).toEqual({
      ok: true,
      dto: {
        processEndDate: "2026-09-21",
        cuts: { headsLiters: 78, heartLiters: 900, tailsLiters: 182 },
        heartAbvPercent: 62.1,
        vinasseLiters: 4000,
      },
    });
  });

  it("exige el corazón, su grado y los cortes; el balance de masa queda para el servidor", () => {
    const r = toCloseDistillationDto(
      { ...base, heartLiters: "", headsLiters: "", heartAbvPercent: "120", processEndDate: "2026-09-26" },
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["headsLiters", "heartAbvPercent", "heartLiters", "processEndDate"]);
    }
    // Cortes muy por encima de cualquier entrada: la forma es válida, lo rechaza el servidor.
    expect(toCloseDistillationDto({ ...base, heartLiters: "90.000" }, TODAY).ok).toBe(true);
  });

  it("lleva los errores del servidor a sus campos (cuts → corazón)", () => {
    const error = new ApiError({
      status: 422,
      code: "TRC_MASS_BALANCE_EXCEEDED",
      message: "Los cortes superan la entrada",
      details: [
        { field: "cuts", message: "Los cortes suman más que la entrada", code: "TRC_MASS_BALANCE_EXCEEDED" },
        { field: "cuts.tailsLiters", message: "Colas inválidas" },
      ],
    });
    expect(closeFieldErrors(error)).toEqual({
      heartLiters: "Los cortes suman más que la entrada",
      tailsLiters: "Colas inválidas",
    });
  });
});
