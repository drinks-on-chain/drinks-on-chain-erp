import { describe, expect, it } from "vitest";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { parseDecimal } from "./form-utils";
import {
  buildTankCards,
  doEligibility,
  fermentationDay,
  fillPercent,
  filterTanks,
  lotLookup,
  nextStep,
  sortLogsDesc,
  suggestTankCode,
  validateLog,
  validateNewTank,
  validateTreatment,
  type NewTankValues,
} from "./tank-model";

const TODAY = new Date("2026-09-25T12:00:00Z");
const altos = fx.wineries.find((w) => w.commercialName.includes("Calamuchita"))!;
const mine = <T extends { wineryId: string }>(xs: T[]) => xs.filter((x) => x.wineryId === altos.id);

describe("parseDecimal", () => {
  it("acepta coma, punto y miles", () => {
    expect(parseDecimal("22,4")).toBe(22.4);
    // En es-BO el punto separa miles: "12.100" L son doce mil cien.
    expect(parseDecimal("12.100")).toBe(12100);
    expect(parseDecimal("1.048")).toBe(1048);
    // Las densidades (tres decimales) se leen sin agrupar.
    expect(parseDecimal("1.048", { grouping: false })).toBe(1.048);
    expect(parseDecimal("12.100,5")).toBe(12100.5);
    expect(parseDecimal("1.200.000")).toBe(1200000);
    expect(parseDecimal(" 8300 ")).toBe(8300);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
});

describe("mapa de tanques", () => {
  const tanks = mine(fx.fermentationTanks);
  const lookup = lotLookup(mine(fx.harvestBatches), mine(fx.terroirs));
  const logsByTank = new Map(
    tanks.map((t) => [t.id, fx.fermentationLogs.filter((l) => l.fermentationTankId === t.id)] as const),
  );
  const cards = buildTankCards({ tanks, lookup, logsByTank, today: TODAY });

  it("marca en ámbar el tanque con la última lectura por encima de 26 °C", () => {
    const hot = cards.filter((c) => c.hot);
    expect(hot.map((c) => c.tankCode)).toEqual(["TK-04"]);
    expect(hot[0]!.temperature).toBe(27.5);
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
    expect(filterTanks(cards, { status: "FERMENTING", destination: "ALL" })).toHaveLength(2);
    expect(filterTanks(cards, { status: "ALL", destination: "OTHER" }).map((c) => c.tankCode)).toEqual(["TK-07"]);
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

describe("aptitud D.O. Singani", () => {
  const byName = (n: string) => fx.terroirs.find((t) => t.parcelName.includes(n))!;
  it("Moscatel de Alejandría sobre 1.600 m y apta", () => {
    expect(doEligibility(byName("Los Sauces")).eligible).toBe(true);
    expect(doEligibility(byName("Los Parrales")).eligible).toBe(true);
  });
  it("explica por qué no es apta", () => {
    const portillo = doEligibility(byName("El Portillo"));
    expect(portillo.eligible).toBe(false);
    expect(portillo.reasons.join(" ")).toMatch(/1\.540 m/);
    const tannat = doEligibility(byName("La Angostura"));
    expect(tannat.eligible).toBe(false);
    expect(tannat.reasons[0]).toMatch(/Tannat/);
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
    expect(nextStep({ ...tank, destinationType: "OTHER" }, [], [])).toBeNull();
  });
});

describe("formularios", () => {
  it("sugiere el siguiente código de tanque", () => {
    expect(suggestTankCode(["TK-01", "TK-10", "TK-RED-01"])).toBe("TK-11");
    expect(suggestTankCode([])).toBe("TK-01");
  });

  const base: NewTankValues = {
    harvestBatchId: "h1",
    tankCode: "TK-11",
    capacityLiters: "10000",
    material: "Acero inoxidable",
    volumeFilledLiters: "8.300",
    status: "FERMENTING",
    startDate: "2026-09-25",
  };
  const ctx = { approvedHarvestIds: new Set(["h1"]), activeCodes: ["TK-04"], today: TODAY };

  it("alta de tanque válida y con errores", () => {
    expect(validateNewTank(base, ctx)).toEqual({});
    const e = validateNewTank(
      { ...base, harvestBatchId: "h2", tankCode: "tk-04", volumeFilledLiters: "12000", startDate: "2026-09-26" },
      ctx,
    );
    expect(Object.keys(e).sort()).toEqual(["harvestBatchId", "startDate", "tankCode", "volumeFilledLiters"]);
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
