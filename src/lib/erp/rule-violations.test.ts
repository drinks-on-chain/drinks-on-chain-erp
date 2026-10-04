import { describe, expect, it } from "vitest";
import { TRACE_ERROR_CODES } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import { isRuleError, parseRuleViolations, ruleViolationsOf } from "@/lib/api/rule-violations";
import { EXPLAINED_CODES, explainViolation, formatRuleValue, ruleLabel, ruleTitle } from "./rule-violations";

const violation = (v: Record<string, unknown>) => parseRuleViolations([{ field: null, message: "m", ...v }])[0]!;

describe("detalles de un error de regla", () => {
  it("lee code, rule, expected, actual y meta; ignora lo que no tiene mensaje", () => {
    const parsed = parseRuleViolations([
      {
        field: "bottlingDate",
        message: "Reposo",
        code: "TRC_LOCK_NOT_RELEASED",
        rule: "r",
        expected: 1,
        meta: { a: 1 },
      },
      { field: "", message: "sin campo" },
      { nada: true },
      "texto",
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      field: "bottlingDate",
      code: "TRC_LOCK_NOT_RELEASED",
      rule: "r",
      meta: { a: 1 },
    });
    expect(parsed[1]).toMatchObject({ field: null, code: null, rule: null, meta: {} });
    expect(parseRuleViolations(null)).toEqual([]);
  });

  it("reconoce los errores TRC_ por el código del error o de sus detalles", () => {
    const rule = new ApiError({ status: 422, code: "TRC_PHYTO_IN_CREATE", message: "El dictamen va aparte" });
    expect(isRuleError(rule)).toBe(true);
    // Sin detalles, el propio error es la violación.
    expect(ruleViolationsOf(rule)).toEqual([expect.objectContaining({ code: "TRC_PHYTO_IN_CREATE" })]);

    const validation = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: [{ field: "name", message: "obligatorio" }],
    });
    expect(isRuleError(validation)).toBe(false);
    expect(ruleViolationsOf(validation)).toEqual([]);
    expect(isRuleError(new Error("x"))).toBe(false);

    // `TRC_CORRECTION_BREAKS_RULES` trae la regla rota en cada detalle, con su propio código.
    const nested = new ApiError({
      status: 422,
      code: "TRC_CORRECTION_BREAKS_RULES",
      message: "La corrección dejaría el lote incumpliendo una regla",
      details: [
        { field: null, message: "Cortes mayores", code: "TRC_MASS_BALANCE_EXCEEDED" },
        { field: null, message: "otra" },
      ],
    });
    expect(ruleViolationsOf(nested).map((v) => v.code)).toEqual([
      "TRC_MASS_BALANCE_EXCEEDED",
      "TRC_CORRECTION_BREAKS_RULES",
    ]);
    // El único código anterior a la Ola 2 que se conserva.
    expect(
      isRuleError(new ApiError({ status: 409, code: "FERMENTATION_TANK_ALREADY_TRANSFERRED", message: "x" })),
    ).toBe(true);
  });
});

describe("explicación de cada regla", () => {
  it("tiene un texto propio para todos los códigos TRC_ del contrato §13", () => {
    const trace = TRACE_ERROR_CODES.filter((c) => c.startsWith("TRC_"));
    expect(trace.filter((c) => !EXPLAINED_CODES.includes(c))).toEqual([]);
    for (const code of trace) {
      const e = explainViolation(violation({ code }));
      expect(e.title, code).not.toBe("Regla del lote incumplida");
      expect(ruleTitle(code)).toBe(e.title);
    }
  });

  it("candado: regla de la instantánea, fecha y días que faltan", () => {
    const e = explainViolation(
      violation({
        code: "TRC_LOCK_NOT_RELEASED",
        message: "Reposo mínimo de 180 días: disponible el 2026-10-12 (faltan 15 días)",
        rule: "trazabilidad.singani.reposoMinimoDias",
        expected: "2026-10-12",
        actual: "2026-09-27",
        meta: { sourceId: "p1", kind: "REST", unlockDate: "2026-10-12", daysRemaining: 15 },
      }),
    );
    expect(e.title).toBe("Reposo obligatorio sin cumplir");
    expect(e.rule).toBe("Reposo mínimo tras la destilación");
    expect(e.facts).toEqual([
      { label: "Disponible el", value: "12 oct 2026" },
      { label: "Faltan", value: "15 días" },
    ]);
    expect(e.hint).toContain("12 oct 2026");
    expect(explainViolation(violation({ code: "TRC_LOCK_NOT_RELEASED", meta: { kind: "AGING" } })).title).toBe(
      "Crianza sin cumplir",
    );
  });

  it("D.O.: lo que exige el lote frente a lo que tiene la parcela, con su unidad", () => {
    const altitude = explainViolation(
      violation({
        code: "TRC_DO_TERROIR_NOT_ELIGIBLE",
        rule: "trazabilidad.singani.altitudMinimaMsnm",
        expected: 1600,
        actual: 1540,
        meta: { terroirId: "t", check: "ALTITUDE" },
      }),
    );
    expect(altitude.rule).toBe("Altitud mínima de la parcela (D.O. Singani)");
    expect(altitude.facts).toEqual([
      { label: "Exige el lote", value: "1.600 m s. n. m." },
      { label: "Tiene la parcela", value: "1.540 m s. n. m." },
    ]);
    const variety = explainViolation(
      violation({
        code: "TRC_DO_NOT_ELIGIBLE",
        rule: "trazabilidad.singani.variedadesExigidas",
        expected: ["Moscatel de Alejandría"],
        actual: "Vischoqueña",
      }),
    );
    expect(variety.facts.map((f) => f.value)).toEqual(["Moscatel de Alejandría", "Vischoqueña"]);
  });

  it("balances del embotellado: botellas, merma y alcohol puro", () => {
    const volume = explainViolation(
      violation({ code: "TRC_BOTTLING_EXCEEDS_VOLUME", expected: 3000, actual: 3200, meta: { maxBottles: 3000 } }),
    );
    expect(volume.facts).toEqual([
      { label: "Caben como máximo", value: "3.000 botellas" },
      { label: "Indicadas", value: "3.200 botellas" },
    ]);
    const loss = explainViolation(
      violation({
        code: "TRC_BOTTLING_LOSS_ABOVE_TOLERANCE",
        rule: "trazabilidad.embotellado.mermaMaximaPorcentaje",
        expected: 5,
        actual: 11.11,
        meta: { lossPercent: 11.11 },
      }),
    );
    expect(loss.facts).toEqual([
      { label: "Merma tolerada", value: "5 %" },
      { label: "Merma resultante", value: "11,11 %" },
    ]);
    const alcohol = explainViolation(violation({ code: "TRC_ALCOHOL_BALANCE_EXCEEDED", expected: 900, actual: 1005 }));
    expect(alcohol.facts.map((f) => f.value)).toEqual(["900 L", "1.005 L"]);
  });

  it("dictamen, crianza, cortes y disponibilidad", () => {
    const phyto = explainViolation(
      violation({
        code: "TRC_PHYTO_NOT_APPROVED",
        rule: "trazabilidad.fitosanitario.exigirAprobado",
        expected: ["APPROVED"],
        actual: "QUARANTINE",
        meta: { harvestBatchCode: "HARV-2026-X-001", status: "QUARANTINE" },
      }),
    );
    expect(phyto.facts).toEqual([
      { label: "Pesaje", value: "HARV-2026-X-001" },
      { label: "Dictamen actual", value: "En cuarentena" },
    ]);
    const aging = explainViolation(
      violation({
        code: "TRC_AGING_BELOW_MINIMUM",
        rule: "trazabilidad.vino.crianzaMinimaMeses",
        expected: 6,
        actual: 3,
      }),
    );
    expect(aging.facts.map((f) => f.value)).toEqual(["6 meses", "3 meses"]);
    const mass = explainViolation(
      violation({ code: "TRC_MASS_BALANCE_EXCEEDED", meta: { inputLiters: 12100, outputLiters: 12500 } }),
    );
    expect(mass.facts.map((f) => f.value)).toEqual(["12.100 L", "12.500 L"]);
    const kg = explainViolation(
      violation({ code: "TRC_VOLUME_EXCEEDS_AVAILABLE", meta: { available: 18400, requested: 20000, unit: "kg" } }),
    );
    expect(kg.facts.map((f) => f.value)).toEqual(["18.400 kg", "20.000 kg"]);
  });

  it("un código desconocido se explica con lo exigido y lo registrado", () => {
    const e = explainViolation(violation({ code: "TRC_FUTURO", message: "Regla nueva", expected: 3, actual: 5 }));
    expect(e.title).toBe("Regla del lote incumplida");
    expect(e.message).toBe("Regla nueva");
    expect(e.facts).toEqual([
      { label: "Exigido", value: "3" },
      { label: "Registrado", value: "5" },
    ]);
    expect(ruleTitle(null)).toBe("Regla del lote incumplida");
  });

  it("formatea valores y etiquetas de regla", () => {
    expect(formatRuleValue(true)).toBe("Sí");
    expect(formatRuleValue(null)).toBe("—");
    expect(formatRuleValue(1.667, "%")).toBe("1,667 %");
    expect(formatRuleValue("2026-10-13")).toBe("13 oct 2026");
    expect(formatRuleValue("SINGANI_DIST")).toBe("Destilación (singani)");
    expect(formatRuleValue(["APPROVED", "PENDING_INSPECTION"])).toBe("Aprobado, Pendiente de inspección");
    expect(ruleLabel("clave.desconocida")).toBe("clave.desconocida");
    expect(ruleLabel(null)).toBeNull();
  });
});
