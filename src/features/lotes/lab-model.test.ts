import { describe, expect, it } from "vitest";
import type { BatchLabAnalysisResponse } from "@drinks-on-chain/mocks";
import { erpFixtures as fx } from "@drinks-on-chain/mocks/fixtures";
import { ApiError } from "@/lib/api/errors";
import {
  checkValueText,
  emptyLab,
  labFieldErrors,
  labValueRows,
  limitText,
  parameterLabel,
  sortLabs,
  toLotLabDto,
  type LabValues,
} from "./lab-model";

const base: LabValues = {
  ...emptyLab("2026-09-25"),
  certifiedLaboratoryName: " Laboratorio Enológico de Tarija ",
  accreditedLabCertificationCode: "IBMETRO-LE-042",
  actualAlcoholAbv: "40,1",
  totalAcidityTartaricGl: "0,3",
  volatileAcidityAceticGl: "0,1",
  methanolMg100mlAa: "85",
  copperContentMgL: "2,1",
  laboratoryReportKey: "org/cinti/lab-reports/informe.pdf",
};

describe("formulario del análisis", () => {
  it("no envía la conformidad: la calcula el servidor", () => {
    const r = toLotLabDto(base);
    expect(r).toEqual({
      ok: true,
      dto: {
        certifiedLaboratoryName: "Laboratorio Enológico de Tarija",
        accreditedLabCertificationCode: "IBMETRO-LE-042",
        testPerformedAt: "2026-09-25",
        actualAlcoholAbv: 40.1,
        totalAcidityTartaricGl: 0.3,
        volatileAcidityAceticGl: 0.1,
        methanolMg100mlAa: 85,
        copperContentMgL: 2.1,
        conformsToEuStandards: false,
        conformsToUsaStandards: false,
        laboratoryReportKey: "org/cinti/lab-reports/informe.pdf",
      },
    });
    expect(r.ok && "conformsToSenasagStandards" in r.dto).toBe(false);
  });

  it("exige laboratorio, acreditación, fecha, grado, acideces e informe; el metanol y el cobre son opcionales", () => {
    const r = toLotLabDto(emptyLab(""));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual([
        "accreditedLabCertificationCode",
        "actualAlcoholAbv",
        "certifiedLaboratoryName",
        "laboratoryReportKey",
        "testPerformedAt",
        "totalAcidityTartaricGl",
        "volatileAcidityAceticGl",
      ]);
    }
    // Sin metanol ni cobre el formulario es válido: el servidor lo dejará «Incompleto» en un singani.
    expect(toLotLabDto({ ...base, methanolMg100mlAa: "", copperContentMgL: "" }).ok).toBe(true);
  });

  it("valida rangos y fechas", () => {
    const r = toLotLabDto({
      ...base,
      actualAlcoholAbv: "140",
      copperContentMgL: "-1",
      analysisRequestDate: "2026-09-26",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["actualAlcoholAbv", "analysisRequestDate", "copperContentMgL"]);
    }
  });

  it("lleva los errores del servidor a su campo (el alias del informe incluido)", () => {
    const error = new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "Datos no válidos",
      details: [
        { field: "methanolMg100mlAa", message: "No coincide con el metanol en mg/L" },
        { field: "laboratoryReportPdfUrl", message: "Informe no encontrado" },
      ],
    });
    expect(labFieldErrors(error)).toEqual({
      methanolMg100mlAa: "No coincide con el metanol en mg/L",
      laboratoryReportKey: "Informe no encontrado",
    });
  });
});

describe("conformidad", () => {
  it("escribe el límite del lote con su unidad", () => {
    expect(limitText({ max: 150, unidad: "mg/100 mL a.a." })).toBe("≤ 150 mg/100 mL a.a.");
    expect(limitText({ min: 38, max: 46, unidad: "% vol" })).toBe("38 a 46 % vol");
    expect(limitText({ min: 0.5, unidad: "g/L" })).toBe("≥ 0,50 g/L");
    expect(limitText(null)).toBe("Sin límite en las reglas del lote");
  });

  it("lo que no se midió se lee «No registrado»", () => {
    expect(checkValueText({ value: null, unit: "mg/L" })).toBe("No registrado");
    expect(checkValueText({ value: 2.1, unit: "mg/L" })).toBe("2,10 mg/L");
    expect(parameterLabel("metanol")).toBe("Metanol");
    expect(parameterLabel("otroParametro")).toBe("otroParametro");
  });
});

describe("análisis registrados", () => {
  const lab = fx.labAnalyses[0]!;

  it("lista solo las cifras registradas, con su unidad", () => {
    const rows = labValueRows({ ...lab, copperContentMgL: null, methanolMg100mlAa: 85 } as BatchLabAnalysisResponse);
    expect(rows.find((r) => r.key === "copperContentMgL")).toBeUndefined();
    expect(rows.find((r) => r.key === "methanolMg100mlAa")).toMatchObject({
      value: "85",
      unit: "mg/100 mL de alcohol anhidro",
    });
    expect(rows[0]).toMatchObject({ key: "actualAlcoholAbv", unit: "% v/v a 20 °C" });
  });

  it("pone primero el vigente y después los sustituidos, del más reciente al más antiguo", () => {
    const mk = (id: string, createdAt: string, supersededAt: string | null, current?: boolean) =>
      ({ ...lab, id, createdAt, supersededAt, current }) as BatchLabAnalysisResponse;
    const sorted = sortLabs([
      mk("viejo", "2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z", false),
      mk("vigente", "2026-09-20T00:00:00Z", null, true),
      mk("medio", "2026-09-10T00:00:00Z", "2026-09-20T00:00:00Z", false),
    ]);
    expect(sorted.map((l) => l.id)).toEqual(["vigente", "medio", "viejo"]);
  });
});
