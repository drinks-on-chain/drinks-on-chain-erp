import { describe, expect, it } from "vitest";
import {
  EMPTY_CODE_FILTERS,
  bottleCodeQuery,
  parseSerialRange,
  rangeText,
  replacementText,
} from "./bottle-codes-model";

describe("rango de series", () => {
  it("vacío = todas las series", () => {
    expect(parseSerialRange({ from: "", to: " " })).toEqual({ ok: true, range: {} });
    expect(rangeText({}, 2950)).toBe("todas las series");
  });

  it("lee las series en es-BO (1.200 = 1200) y admite solo un extremo", () => {
    expect(parseSerialRange({ from: "100", to: "1.200" })).toEqual({
      ok: true,
      range: { fromSerial: 100, toSerial: 1200 },
    });
    expect(parseSerialRange({ from: "", to: "50" })).toEqual({ ok: true, range: { toSerial: 50 } });
    expect(rangeText({ fromSerial: 100, toSerial: 250 }, 2950)).toBe("series 100–250");
    expect(rangeText({ fromSerial: 100 }, 2950)).toBe("series 100–2950");
    expect(rangeText({ fromSerial: 100 }, null)).toBe("desde la serie 100");
  });

  it("rechaza series que no son enteros desde 1 y rangos invertidos", () => {
    const bad = parseSerialRange({ from: "0", to: "1,5" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["from", "to"]);
    const inverted = parseSerialRange({ from: "20", to: "10" });
    expect(inverted).toEqual({ ok: false, errors: { to: "La serie final no puede ser menor que la inicial." } });
  });
});

describe("filtros de la tabla", () => {
  const page = { limit: 20, offset: 40 };

  it("sin filtros solo pagina", () => {
    expect(bottleCodeQuery(EMPTY_CODE_FILTERS, page)).toEqual(page);
  });

  it("estado y rango van al servidor; un rango mal escrito no se envía", () => {
    expect(bottleCodeQuery({ status: "VOIDED", from: "5", to: "9" }, page)).toEqual({
      ...page,
      status: "VOIDED",
      fromSerial: 5,
      toSerial: 9,
    });
    expect(bottleCodeQuery({ status: "ACTIVE", from: "x", to: "9" }, page)).toEqual({ ...page, status: "ACTIVE" });
  });
});

describe("sustitución de códigos", () => {
  it("dice qué código sustituye a cuál", () => {
    const voided = {
      at: "2026-09-25T12:00:00Z",
      by: { membershipId: "m1", userId: "u1", fullName: "Lucía Rojas", role: "ENOLOGIST" },
      reason: "Etiqueta rota",
    };
    expect(replacementText({ voided: { ...voided, replacedBy: "K7Q2-M9XA" }, replaces: null })).toBe(
      "Sustituido por K7Q2-M9XA",
    );
    expect(replacementText({ voided: null, replaces: "ABCD-EFGH" })).toBe("Sustituye a ABCD-EFGH");
    expect(replacementText({ voided: { ...voided, replacedBy: null }, replaces: null })).toBeNull();
  });
});
