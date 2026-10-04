import { describe, expect, it } from "vitest";
import { erpFixtures } from "@drinks-on-chain/mocks/fixtures";
import type { DoCheck, DoEvaluation, TerroirResponse } from "@drinks-on-chain/mocks";
import { doBadgeText, doRuleHints, doStatus, failedChecks, isDoApt, isWineParcel } from "./do-eligibility";
import { filterTerroirs, shortVariety, varietiesOf } from "./filter-terroirs";
import { outerRing, ringToSvgPoints } from "./parcel-shape";
import { ApiError } from "@/lib/api/errors";
import { EMPTY_TERROIR, terroirFieldErrors, terroirToValues, toTerroirDto } from "./terroir-form-values";

const terroirs = erpFixtures.terroirs as TerroirResponse[];
const byName = (part: string) => terroirs.find((t) => t.parcelName.includes(part))!;

/** Evaluación tal como la devuelve `GET /v1/terroirs` (calculada por el servidor). */
const evaluation = (checks: Partial<DoCheck>[], status: DoEvaluation["status"]): DoEvaluation => ({
  status,
  rulesSource: "EFFECTIVE_SETTINGS",
  evaluatedAt: "2026-09-25T12:00:00Z",
  checks: checks.map((c) => ({
    rule: "ALTITUDE",
    settingKey: "trazabilidad.singani.altitudMinimaMsnm",
    required: 1600,
    legalMinimum: 1600,
    actual: 2350,
    pass: true,
    terroirId: "t1",
    ...c,
  })),
});
const VARIETY = {
  rule: "VARIETY" as const,
  settingKey: "trazabilidad.singani.variedadesExigidas",
  required: ["Moscatel de Alejandría"],
  legalMinimum: ["Moscatel de Alejandría"],
};

describe("aptitud D.O. calculada por el servidor", () => {
  it("apta: el estado manda, no lo que se declare", () => {
    const apt = {
      isDoEligible: true,
      doEvaluation: evaluation([{}, { ...VARIETY, actual: "Moscatel de Alejandría" }], "ELIGIBLE"),
    };
    expect(doStatus(apt)).toBe("ELIGIBLE");
    expect(isDoApt(apt)).toBe(true);
    expect(doBadgeText(apt)).toBe("Apto para Singani D.O.");
    expect(failedChecks(apt)).toEqual([]);
  });

  it("El Portillo (1.540 m) no es apto por altitud: el motivo sale de la comprobación fallida", () => {
    const portillo = {
      isDoEligible: false,
      doEvaluation: evaluation(
        [
          { actual: 1540, pass: false },
          { ...VARIETY, actual: "Moscatel de Alejandría" },
        ],
        "NOT_ELIGIBLE",
      ),
    };
    expect(isDoApt(portillo)).toBe(false);
    expect(isWineParcel(portillo)).toBe(false);
    expect(doBadgeText(portillo)).toBe("No apto D.O. · altitud < 1.600 m s. n. m.");
  });

  it("apta por excepción legal de la bodega (A-31)", () => {
    const exception = {
      isDoEligible: true,
      doEvaluation: evaluation([{ required: 1500, actual: 1540 }], "ELIGIBLE_BY_EXCEPTION"),
    };
    expect(isDoApt(exception)).toBe(true);
    expect(doBadgeText(exception)).toBe("Apto D.O. por excepción legal");
  });

  it("otra cepa: parcela de vino, con su motivo", () => {
    const tannat = {
      isDoEligible: false,
      doEvaluation: evaluation([{}, { ...VARIETY, actual: "Tannat", pass: false }], "NOT_ELIGIBLE"),
    };
    expect(isWineParcel(tannat)).toBe(true);
    expect(doBadgeText(tannat)).toBe("No apto D.O. · cepa distinta de Moscatel de Alejandría");
  });

  it("sin el detalle de la evaluación vale el booleano calculado", () => {
    expect(doStatus({ isDoEligible: true })).toBe("ELIGIBLE");
    expect(doStatus({ isDoEligible: false })).toBe("NOT_ELIGIBLE");
    expect(doBadgeText({ isDoEligible: false })).toBe("No apto D.O.");
  });

  it("las reglas vigentes se muestran como ayuda, sin evaluar nada en el cliente", () => {
    const setting = (key: string, value: unknown) => ({
      key,
      description: key,
      value,
      source: "GLOBAL" as const,
      appliesAt: "LOT" as const,
    });
    expect(
      doRuleHints([
        setting("trazabilidad.singani.altitudMinimaMsnm", 1600),
        setting("trazabilidad.singani.variedadesExigidas", ["Moscatel de Alejandría"]),
      ]),
    ).toEqual({ altitude: "1.600 m s. n. m.", varieties: "Moscatel de Alejandría" });
    expect(doRuleHints([])).toEqual({ altitude: null, varieties: null });
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
    // `isDoEligible` de los fixtures es el calculado: El Portillo es apto por la excepción legal de Altos.
    expect(filterTerroirs(altos, { doOnly: true }).map((t) => t.parcelName)).toEqual([
      byName("Los Sauces").parcelName,
      byName("El Portillo").parcelName,
    ]);
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
    doType: "D.O. Singani",
  };

  it("convierte cifras escritas en es-BO y omite lo opcional vacío", () => {
    const r = toTerroirDto(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.create).toMatchObject({
      surfaceHectares: 3.5,
      altitudeMasl: 2450,
    });
    // La aptitud D.O. no se envía: la calcula el servidor.
    for (const key of ["latitude", "cadastreCode", "geographicPolygonGeojson", "isDoEligible"])
      expect(r.create).not.toHaveProperty(key);
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

  it("lleva los details[].field de un 422 a los campos", () => {
    const error = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: [
        { field: "altitudeMasl", message: "Too small" },
        { field: "geographicPolygonGeojson.coordinates", message: "Invalid" },
        { field: "otro", message: "x" },
      ],
    });
    expect(terroirFieldErrors(error)).toEqual({ altitudeMasl: "Too small", polygon: "Invalid" });
    // Las cadenas "campo: mensaje" del backend anterior a O0-BE-2 se retiraron en H1.
    const legacy = new ApiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "x",
      details: ["altitudeMasl: Too small"],
    });
    expect(terroirFieldErrors(legacy)).toEqual({});
  });
});
