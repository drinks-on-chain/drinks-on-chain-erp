import { describe, expect, it } from "vitest";
import {
  fmtDate,
  fmtDateTime,
  fmtDaysLeft,
  fmtKg,
  fmtLiters,
  fmtNumber,
  numberToInput,
  parseDecimal,
  shortHash,
} from "./format";

// Un solo parseDecimal en todo el ecosistema (es-BO): el punto separa miles y la coma decimales.
describe("parseDecimal", () => {
  it("lee comas decimales y puntos de miles (es-BO)", () => {
    expect(parseDecimal("23,4")).toBe(23.4);
    expect(parseDecimal("22,4")).toBe(22.4);
    expect(parseDecimal("3.40")).toBe(3.4);
    // "12.100" L son doce mil cien.
    expect(parseDecimal("12.100")).toBe(12100);
    expect(parseDecimal("18.400")).toBe(18400);
    expect(parseDecimal("1.048")).toBe(1048);
    expect(parseDecimal("1.200.000")).toBe(1200000);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("12.100,5")).toBe(12100.5);
    expect(parseDecimal("40.5")).toBe(40.5);
  });

  it("ignora espacios, también los de no separación", () => {
    expect(parseDecimal(" 150 ")).toBe(150);
    expect(parseDecimal("1 500")).toBe(1500);
    expect(parseDecimal("1 500")).toBe(1500);
  });

  it("sin agrupar, el punto siempre es decimal (densidades y coordenadas)", () => {
    expect(parseDecimal("1.048", { grouping: false })).toBe(1.048);
    expect(parseDecimal("-21.561", { grouping: false })).toBe(-21.561);
  });

  it("devuelve null si no es un número", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
    expect(parseDecimal(Number.NaN)).toBeNull();
  });

  it("acepta números ya leídos y vuelve de numberToInput", () => {
    expect(parseDecimal(7.5)).toBe(7.5);
    expect(numberToInput(4.125)).toBe("4,125");
    expect(numberToInput(null)).toBe("");
    expect(parseDecimal(numberToInput(4.125))).toBe(4.125);
  });
});

describe("formato es-BO", () => {
  it("cifras con separador de miles y decimales fijos", () => {
    expect(fmtNumber(12100)).toBe("12.100");
    expect(fmtNumber(4.2, 1)).toBe("4,2");
    expect(fmtKg(2350)).toBe("2.350 kg");
    expect(fmtLiters(1500.5, 1)).toBe("1.500,5 L");
  });

  it("fechas en UTC para no mover el día", () => {
    expect(fmtDate("2026-03-04T00:00:00Z")).toBe("4 mar 2026");
    expect(fmtDate("2026-09-25T23:30:00Z")).toBe("25 sept 2026");
    const dt = fmtDateTime("2026-03-04T09:05:00Z");
    expect(dt.startsWith("4 mar 2026")).toBe(true);
    expect(dt).toContain("09:05");
  });

  it("días restantes y hashes abreviados", () => {
    expect(fmtDaysLeft(0)).toBe("Liberado");
    expect(fmtDaysLeft(1)).toBe("Falta 1 día");
    expect(fmtDaysLeft(18)).toBe("Faltan 18 días");
    expect(shortHash("GDQ4ABCDEFGH7KXV")).toBe("GDQ4…7KXV");
    expect(shortHash("GDQ4")).toBe("GDQ4");
  });
});
