import { describe, expect, it } from "vitest";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import {
  buildTankCards,
  doEligibility,
  fermentationDay,
  fillPercent,
  filterTanks,
  lotLookup,
  nextStep,
  sortLogsDesc,
  lotOfInputs,
  suggestTankCode,
  tankFieldErrors,
  tankLotErrors,
  toCompleteTankDto,
  toCreateTankDto,
  validateLog,
  validateTreatment,
  type NewTankValues,
} from "./tank-model";
import { emptyLotForm } from "@/features/lotes/lot-model";
import { ApiError } from "@/lib/api/errors";

const TODAY = new Date("2026-09-25T12:00:00Z");

/** Filas de `fermentation-logs.json` (registro de la semilla) con la forma de la respuesta de la API. */
const asLog = (l: (typeof fx.fermentationLogs)[number]) => ({
  specificGravity: null,
  phValue: null,
  co2Observations: null,
  notes: null,
  ...l,
  recordedByUserId: l.recordedByMemberId ?? "",
});
const altos = fx.wineries.find((w) => w.commercialName.includes("Calamuchita"))!;
const mine = <T extends { wineryId: string }>(xs: T[]) => xs.filter((x) => x.wineryId === altos.id);

describe("mapa de tanques", () => {
  const tanks = mine(fx.fermentationTanks);
  const lookup = lotLookup(mine(fx.harvestBatches), mine(fx.terroirs));
  const logsByTank = new Map(
    tanks.map((t) => [t.id, fx.fermentationLogs.filter((l) => l.fermentationTankId === t.id).map(asLog)] as const),
  );
  const cards = buildTankCards({ tanks, lookup, logsByTank, today: TODAY });

  it("marca en ámbar el tanque con la última lectura por encima de 26 °C", () => {
    const hot = cards.filter((c) => c.hot);
    expect(hot.map((c) => c.tankCode).sort()).toEqual(["TK-04", "TK-15"]);
    expect(hot.find((c) => c.tankCode === "TK-04")!.temperature).toBe(27.5);
    expect(cards.find((c) => c.tankCode === "TK-10")!.hot).toBe(false);
  });

  it("calcula llenado, día de fermentación y ordena lo vivo primero", () => {
    const tk04 = cards.find((c) => c.tankCode === "TK-04")!;
    expect(tk04.fillPct).toBe(83);
    expect(tk04.day).toBe(fermentationDay({ status: "FERMENTING", startDate: "2026-03-10T14:30:00Z" }, TODAY));
    expect(cards[0]!.status).toBe("FERMENTING");
    expect(cards.at(-1)!.status).toBe("CLEANED");
    expect(tk04.lotName).toBe("Cuartel 2 · Los Sauces · Moscatel de Alejandría");
  });

  it("filtra por estado y destino", () => {
    expect(filterTanks(cards, { status: "FERMENTING", destination: "ALL" })).toHaveLength(3);
    // TK-15 fermenta sin destino: se decide al completar la fermentación.
    expect(filterTanks(cards, { status: "ALL", destination: "SINGANI_DIST" }).map((c) => c.tankCode)).toEqual([
      "TK-32",
    ]);
    expect(cards.find((c) => c.tankCode === "TK-15")!.destination).toBeNull();
    expect(filterTanks(cards, { status: "ALL", destination: "ALL" })).toHaveLength(cards.length);
  });

  it("llenado y día en casos límite", () => {
    expect(fillPercent({ capacityLiters: 0, volumeFilledLiters: 10 })).toBe(0);
    expect(fillPercent({ capacityLiters: 100, volumeFilledLiters: 150 })).toBe(100);
    expect(fermentationDay({ status: "FILLING", startDate: "2026-09-24T00:00:00Z" }, TODAY)).toBeNull();
    expect(fermentationDay({ status: "FERMENTING", startDate: "2026-09-25T08:00:00Z" }, TODAY)).toBe(1);
    expect(fermentationDay({ status: "FERMENTING", startDate: "2026-09-16T08:00:00Z" }, TODAY)).toBe(10);
  });

  it("ordena la bitácora de la más reciente a la más antigua", () => {
    const logs = sortLogsDesc(logsByTank.get(cards[0]!.id));
    expect(logs[0]!.recordedAt >= logs.at(-1)!.recordedAt).toBe(true);
  });
});

describe("aptitud D.O. Singani (evaluación del servidor)", () => {
  const parcel = (pass: boolean, actual: number) => ({
    parcelName: "Cuartel 3 · El Portillo",
    isDoEligible: pass,
    doEvaluation: {
      status: pass ? ("ELIGIBLE" as const) : ("NOT_ELIGIBLE" as const),
      rulesSource: "EFFECTIVE_SETTINGS" as const,
      evaluatedAt: "2026-09-25T12:00:00Z",
      checks: [
        {
          rule: "ALTITUDE" as const,
          settingKey: "trazabilidad.singani.altitudMinimaMsnm",
          required: 1600,
          legalMinimum: 1600,
          actual,
          pass,
          terroirId: "t",
        },
      ],
    },
  });
  it("traduce a frases las comprobaciones que el servidor da por fallidas", () => {
    expect(doEligibility(parcel(true, 1875))).toEqual({ eligible: true, reasons: [] });
    const portillo = doEligibility(parcel(false, 1540));
    expect(portillo.eligible).toBe(false);
    expect(portillo.reasons).toEqual(["Cuartel 3 · El Portillo: altitud < 1.600 m s. n. m."]);
    expect(doEligibility(undefined).eligible).toBe(false);
  });
});

describe("siguiente paso", () => {
  it("crianza: disponible sin crianza previa, enlaza la existente si la hay", () => {
    const tank = { id: "t1", status: "COMPLETED" as const, destinationType: "WINE_AGING" as const };
    const step = nextStep(tank, [], [])!;
    expect(step).toMatchObject({ kind: "crianza", href: "/crianza/nueva?tanque=t1", available: true });
    const done = nextStep(
      tank,
      [{ id: "a1", fermentationTankId: "t1", containerCode: "BAR-1", containerType: "Barrica" }],
      [],
    )!;
    expect(done.available).toBe(false);
    expect(done.existing[0]).toEqual({ id: "a1", href: "/crianza/a1", label: "BAR-1" });
  });
  it("destilación admite varias tandas; llenando no puede continuar; sin destino no hay paso", () => {
    const tank = { id: "t2", status: "TRANSFERRED" as const, destinationType: "SINGANI_DIST" as const };
    const step = nextStep(tank, [], [{ id: "p1", fermentationTankId: "t2", equipmentIdentifier: "AL-01" }])!;
    expect(step).toMatchObject({ kind: "destilacion", available: true, href: "/destilacion/nueva?tanque=t2" });
    expect(nextStep({ ...tank, status: "FILLING" }, [], [])!.available).toBe(false);
    // Fermentando aún no se continúa: antes hay que completar la fermentación (bifurcación).
    expect(nextStep({ ...tank, status: "FERMENTING" }, [], [])!.available).toBe(false);
    expect(nextStep({ ...tank, destinationType: "OTHER" }, [], [])).toBeNull();
  });
});

describe("formularios", () => {
  it("sugiere el siguiente código de tanque", () => {
    expect(suggestTankCode(["TK-01", "TK-10", "TK-RED-01"])).toBe("TK-11");
    expect(suggestTankCode([])).toBe("TK-01");
  });

  const base: NewTankValues = {
    inputs: { h1: "18.400" },
    lotChoice: "auto",
    tankCode: "TK-11",
    capacityLiters: "15000",
    material: "Acero inoxidable",
    volumeFilledLiters: "12.100",
    startFermentation: true,
    startDate: "2026-09-25",
  };
  const harvests = [
    { id: "h1", lotId: "lot-1", harvestYear: 2026, availableKg: 18400, netWeightKg: 18400 },
    { id: "h2", lotId: null, harvestYear: 2026, availableKg: 4200, netWeightKg: 4200 },
  ];
  const ctx = { harvests, today: TODAY };

  it("alta de tanque: entradas por pesaje, sin destino ni estado final", () => {
    expect(toCreateTankDto(base, ctx)).toEqual({
      ok: true,
      dto: {
        inputs: [{ harvestBatchId: "h1", kg: 18400 }],
        tankCode: "TK-11",
        capacityLiters: 15000,
        material: "Acero inoxidable",
        volumeFilledLiters: 12100,
        startFermentation: true,
        startDate: "2026-09-25",
      },
    });
    expect(lotOfInputs(base.inputs, harvests)).toBe("lot-1");
    // Sin cifra, entra todo lo disponible del pesaje: lo calcula el servidor.
    const all = toCreateTankDto({ ...base, inputs: { h1: "" } }, ctx);
    expect(all.ok && all.dto.inputs).toEqual([{ harvestBatchId: "h1" }]);
  });

  it("uva sin lote: se asigna a un lote existente o nace uno con la añada de la uva", () => {
    const loose = { ...base, inputs: { h2: "4.200" } };
    expect(lotOfInputs(loose.inputs, harvests)).toBeNull();
    const undecided = toCreateTankDto(loose, ctx);
    expect(undecided.ok).toBe(false);
    expect(!undecided.ok && undecided.errors.lotChoice).toBeDefined();

    const existing = toCreateTankDto({ ...loose, lotChoice: "lot-9" }, ctx);
    expect(existing.ok && existing.dto.lotId).toBe("lot-9");

    const lot = { ...emptyLotForm(TODAY), name: "Singani Gran Reserva 2026", productType: "SINGANI" as const };
    const created = toCreateTankDto({ ...loose, lotChoice: "new" }, { ...ctx, newLot: lot });
    expect(created.ok && created.dto.newLot).toEqual({
      name: "Singani Gran Reserva 2026",
      harvestYear: 2026,
      productType: "SINGANI",
    });
    expect(created.ok && created.dto).not.toHaveProperty("lotId");

    const unnamed = toCreateTankDto({ ...loose, lotChoice: "new" }, ctx);
    expect(!unnamed.ok && unnamed.lotErrors.name).toBeDefined();
  });

  it("solo valida forma: capacidad, código en uso y dictamen los decide el servidor", () => {
    // Volumen sobre la capacidad y código repetido no son errores del formulario.
    expect(
      toCreateTankDto({ ...base, capacityLiters: "8000", volumeFilledLiters: "9000", tankCode: "TK-04" }, ctx).ok,
    ).toBe(true);
    const e = toCreateTankDto(
      { ...base, inputs: {}, tankCode: " ", volumeFilledLiters: "", startDate: "2026-09-26" },
      ctx,
    );
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(Object.keys(e.errors).sort()).toEqual(["inputs", "startDate", "tankCode", "volumeFilledLiters"]);
    const kg = toCreateTankDto({ ...base, inputs: { h1: "-5" } }, ctx);
    expect(!kg.ok && kg.inputErrors.h1).toBeDefined();
  });

  it("lleva los details del servidor a los campos del tanque y del lote nuevo", () => {
    const error = new ApiError({
      status: 422,
      code: "TRC_PHYTO_NOT_APPROVED",
      message: "Uva sin dictamen fitosanitario aprobado",
      details: [
        { field: "inputs", message: "El pesaje HARV-1 está en QUARANTINE", code: "TRC_PHYTO_NOT_APPROVED" },
        { field: "inputs.0.kg", message: "Kilos por encima de lo disponible" },
        { field: "tankCode", message: "Tanque físico ocupado" },
        { field: "newLot.name", message: "muy corto" },
      ],
    });
    expect(tankFieldErrors(error)).toEqual({
      inputs: "El pesaje HARV-1 está en QUARANTINE",
      tankCode: "Tanque físico ocupado",
    });
    expect(tankLotErrors(error)).toEqual({ name: "muy corto" });
  });

  it("completar la fermentación: fecha, volumen final y destino", () => {
    expect(toCompleteTankDto({ endDate: "2026-09-25", finalVolumeLiters: "12.100" }, "SINGANI_DIST", TODAY)).toEqual({
      ok: true,
      dto: { endDate: "2026-09-25", finalVolumeLiters: 12100, destination: "SINGANI_DIST" },
    });
    const e = toCompleteTankDto({ endDate: "2026-09-26", finalVolumeLiters: "" }, "WINE_AGING", TODAY);
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(Object.keys(e.errors).sort()).toEqual(["endDate", "finalVolumeLiters"]);
  });

  it("lectura diaria: la temperatura es obligatoria", () => {
    const ok = {
      temperatureCelsius: "22,4",
      specificGravity: "1,048",
      phValue: "3,4",
      co2Observations: "",
      recordedAt: "2026-09-25T12:00",
      notes: "",
    };
    expect(validateLog(ok, TODAY)).toEqual({});
    expect(validateLog({ ...ok, temperatureCelsius: "" }, TODAY).temperatureCelsius).toBeDefined();
    expect(validateLog({ ...ok, specificGravity: "1048" }, TODAY).specificGravity).toBeDefined();
    expect(validateLog({ ...ok, recordedAt: "2026-09-26T08:00" }, TODAY).recordedAt).toBeDefined();
  });

  it("tratamiento: tipo, aditivo, dosis y código SENASAG", () => {
    const e = validateTreatment(
      {
        treatmentType: "",
        additiveName: "",
        additiveSupplier: "",
        dosageAppliedGPerHl: "",
        totalAppliedG: "",
        regulatoryAuthCode: "",
        appliedAt: "2026-09-25",
        notes: "",
      },
      TODAY,
    );
    expect(Object.keys(e).sort()).toEqual([
      "additiveName",
      "dosageAppliedGPerHl",
      "regulatoryAuthCode",
      "treatmentType",
    ]);
  });
});
