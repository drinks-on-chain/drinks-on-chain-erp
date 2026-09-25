import { describe, expect, it } from "vitest";
import type { TraceabilityDag } from "@drinks-on-chain/mocks";
import { emptyLabForm, validateLab } from "./lab-form-model";
import { dagSteps } from "./traceability";

describe("validateLab", () => {
  const filled = {
    ...emptyLabForm(),
    certifiedLaboratoryName: " Laboratorio Enológico de Tarija ",
    accreditedLabCertificationCode: "IBMETRO-LE-042",
    testPerformedAt: "2026-09-24",
    actualAlcoholAbv: "40,1",
    totalAcidityTartaricGl: "0,35",
    volatileAcidityAceticGl: "0,2",
    methanolContentMgL: "180",
    conformsToSenasagStandards: true,
  };

  it("arma el DTO con opcionales en null", () => {
    const { errors, dto } = validateLab("b1", filled, true);
    expect(errors).toEqual({});
    expect(dto).toMatchObject({
      bottlingBatchId: "b1",
      certifiedLaboratoryName: "Laboratorio Enológico de Tarija",
      actualAlcoholAbv: 40.1,
      totalAcidityTartaricGl: 0.35,
      methanolContentMgL: 180,
      freeSulfurDioxideMgL: null,
      analysisRequestDate: null,
      conformsToSenasagStandards: true,
      conformsToEuStandards: false,
    });
  });

  it("exige laboratorio, fecha, lecturas obligatorias y el PDF", () => {
    const { errors, dto } = validateLab("b1", emptyLabForm(), false);
    expect(dto).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(
      [
        "accreditedLabCertificationCode",
        "actualAlcoholAbv",
        "certifiedLaboratoryName",
        "pdf",
        "testPerformedAt",
        "totalAcidityTartaricGl",
        "volatileAcidityAceticGl",
      ].sort(),
    );
  });

  it("rechaza grados fuera de rango y solicitudes posteriores al análisis", () => {
    const { errors } = validateLab(
      "b1",
      { ...filled, actualAlcoholAbv: "140", analysisRequestDate: "2026-09-30" },
      true,
    );
    expect(errors.actualAlcoholAbv).toBeDefined();
    expect(errors.analysisRequestDate).toBeDefined();
  });
});

describe("dagSteps", () => {
  it("ordena por etapa y enlaza cada nodo con su módulo", () => {
    const node = (id: string, type: TraceabilityDag["nodes"][number]["type"]) => ({
      id,
      type,
      label: id,
      date: "2026-01-01T00:00:00Z",
      data: {},
    });
    const dag: TraceabilityDag = {
      bottlingBatchId: "b",
      lotCode: "L",
      nodes: [
        node("b", "BOTTLING_BATCH"),
        node("lab", "LAB_ANALYSIS"),
        node("t", "TERROIR"),
        node("p", "PRODUCTION_BATCH"),
      ],
      edges: [],
    };
    const steps = dagSteps(dag);
    expect(steps.map((s) => s.type)).toEqual(["TERROIR", "PRODUCTION_BATCH", "BOTTLING_BATCH", "LAB_ANALYSIS"]);
    expect(steps.map((s) => s.href)).toEqual(["/origen/t", "/destilacion/p", "/envasado/b", null]);
    expect(steps[1]!.stage).toBe("Destilación");
  });
});
