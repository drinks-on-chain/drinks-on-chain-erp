import { describe, expect, it } from "vitest";
import { erpFixtures } from "@drinks-on-chain/mocks/fixtures";
import type { TerroirResponse } from "@drinks-on-chain/mocks";
import { numberToInput, parseDecimal } from "@/lib/format";
import { detailPairs } from "./api-details";
import { doBadgeText, doEligibility, isDoVariety } from "./do-eligibility";
import { filterTerroirs, shortVariety, varietiesOf } from "./filter-terroirs";
import { outerRing, ringToSvgPoints } from "./parcel-shape";
import { EMPTY_TERROIR, terroirFieldErrors, terroirToValues, toTerroirDto } from "./terroir-form-values";

const terroirs = erpFixtures.terroirs as TerroirResponse[];
const byName = (part: string) => terroirs.find((t) => t.parcelName.includes(part))!;

describe("doEligibility", () => {
  it("es apta con Moscatel de Alejandría, altitud ≥ 1.600 m y aptitud declarada", () => {
    const r = doEligibility({ varietyName: "Moscatel de Alejandría", altitudeMasl: 2350, isDoEligible: true });
    expect(r).toEqual({ eligible: true, applicable: true, reasons: [] });
    expect(doBadgeText(r)).toBe("Apto para Singani D.O.");
  });

  it("1.600 m justos es apto (el backend rechaza < 1600)", () => {
    expect(
      doEligibility({ varietyName: "Moscatel de Alejandría", altitudeMasl: 1600, isDoEligible: true }).eligible,
    ).toBe(true);
    expect(
      doEligibility({ varietyName: "Moscatel de Alejandría", altitudeMasl: 1599, isDoEligible: true }).eligible,
    ).toBe(false);
  });

  it("El Portillo (1.540 m) no es apto por altitud, como en la maqueta", () => {
    const r = doEligibility(byName("El Portillo"));
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toBe("altitude");
    expect(doBadgeText(r)).toBe("No apto D.O. · altitud < 1.600 m");
  });

  it("otra cepa no aplica a la D.O. Singani aunque esté declarada apta", () => {
    const r = doEligibility(byName("La Angostura"));
    expect(r).toMatchObject({ eligible: false, applicable: false, reasons: ["variety"] });
  });

  it("sin aptitud declarada no es apta aunque cumpla cepa y altitud", () => {
    const r = doEligibility({ varietyName: "moscatel de alejandria", altitudeMasl: 2000, isDoEligible: false });
    expect(r.reasons).toEqual(["not-declared"]);
    expect(doBadgeText(r)).toBe("No apto D.O. · sin aptitud D.O. declarada");
  });

  it("reconoce la cepa sin tildes ni mayúsculas y rechaza vacíos", () => {
    expect(isDoVariety("MOSCATEL DE ALEJANDRIA")).toBe(true);
    expect(isDoVariety("Moscatel")).toBe(false);
    expect(isDoVariety("")).toBe(false);
    expect(doEligibility({ varietyName: "", altitudeMasl: null, isDoEligible: false }).reasons).toEqual([
      "variety",
      "altitude",
      "not-declared",
    ]);
  });
});

describe("filtros del directorio", () => {
  const altos = terroirs.filter((t) => t.wineryId === byName("El Portillo").wineryId);

  it("lista las cepas con su cuenta", () => {
    expect(varietiesOf(altos)).toEqual([
      { name: "Cabernet Sauvignon", count: 1 },
      { name: "Moscatel de Alejandría", count: 2 },
      { name: "Syrah", count: 1 },
      { name: "Tannat", count: 1 },
    ]);
    expect(shortVariety("Moscatel de Alejandría")).toBe("Moscatel");
  });

  it("filtra por cepa, aptitud D.O. y búsqueda sin tildes", () => {
    expect(filterTerroirs(altos, { variety: "Moscatel de Alejandría" })).toHaveLength(2);
    expect(filterTerroirs(altos, { doOnly: true }).map((t) => t.parcelName)).toEqual([byName("Los Sauces").parcelName]);
    expect(filterTerroirs(altos, { search: "compania" })).toHaveLength(1);
    expect(filterTerroirs(altos, { search: "CAT-TAR-1101" })).toHaveLength(1);
    expect(filterTerroirs(altos, {})).toHaveLength(altos.length);
  });
});

describe("silueta de la parcela", () => {
  it("normaliza el polígono en la caja con el norte arriba", () => {
    const ring = outerRing(byName("La Angostura").geographicPolygonGeojson)!;
    expect(ring).toHaveLength(5);
    const pts = ringToSvgPoints(ring).split(" ");
    // el primer vértice es el suroeste: abajo a la izquierda
    const [x, y] = pts[0]!.split(",").map(Number);
    expect(x).toBeLessThan(50);
    expect(y).toBeGreaterThan(50);
    for (const p of pts) for (const n of p.split(",").map(Number)) expect(n).toBeGreaterThanOrEqual(0);
  });

  it("descarta geometrías que no son polígonos", () => {
    expect(outerRing(null)).toBeNull();
    expect(outerRing({ type: "Point", coordinates: [1, 2] })).toBeNull();
    expect(
      outerRing({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
    ).toBeNull();
  });
});

describe("formulario de terroir", () => {
  const valid = {
    ...EMPTY_TERROIR,
    parcelName: "Parcela 9 · La Cumbre",
    surfaceHectares: "3,5",
    altitudeMasl: "2.450",
    varietyName: "Moscatel de Alejandría",
    isDoEligible: true,
    doType: "D.O. Singani",
  };

  it("convierte cifras escritas en es-BO y deja null lo opcional vacío", () => {
    const r = toTerroirDto(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.create).toMatchObject({
      surfaceHectares: 3.5,
      altitudeMasl: 2450,
      latitude: null,
      cadastreCode: null,
      geographicPolygonGeojson: null,
      isDoEligible: true,
    });
    expect(r.update.isActive).toBe(true);
  });

  it("valida obligatorios, rangos y el JSON del polígono", () => {
    const r = toTerroirDto({ ...EMPTY_TERROIR, latitude: "-95", polygon: "{ nope" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["altitudeMasl", "latitude", "parcelName", "polygon", "surfaceHectares", "varietyName"].sort(),
    );
    expect(r.errors.polygon).toBe("No es un JSON válido.");
    const point = toTerroirDto({ ...valid, polygon: '{"type":"Point","coordinates":[1,2]}' });
    expect(point.ok).toBe(false);
  });

  it("ida y vuelta con una parcela existente", () => {
    const t = byName("La Angostura");
    const r = toTerroirDto(terroirToValues(t));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.update).toMatchObject({
      parcelName: t.parcelName,
      altitudeMasl: t.altitudeMasl,
      geographicPolygonGeojson: t.geographicPolygonGeojson,
      doCertificateUrl: t.doCertificateUrl,
    });
  });

  it("lleva los details del backend a los campos", () => {
    expect(terroirFieldErrors(["altitudeMasl: Too small", "geographicPolygonGeojson: Invalid", "otro: x"])).toEqual({
      altitudeMasl: "Too small",
      polygon: "Invalid",
    });
    expect(detailPairs(["brixDegrees es obligatorio"])).toEqual([["brixDegrees", "es obligatorio"]]);
    expect(detailPairs({ initialPh: ["fuera de rango"] })).toEqual([["initialPh", "fuera de rango"]]);
  });
});

describe("parseDecimal", () => {
  it("lee comas decimales y puntos de miles", () => {
    expect(parseDecimal("23,4")).toBe(23.4);
    expect(parseDecimal("3.40")).toBe(3.4);
    expect(parseDecimal("18.400")).toBe(18400);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal(" 150 ")).toBe(150);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
    expect(parseDecimal("-21.561", { grouping: false })).toBe(-21.561);
    expect(parseDecimal(numberToInput(4.125))).toBe(4.125);
  });
});
