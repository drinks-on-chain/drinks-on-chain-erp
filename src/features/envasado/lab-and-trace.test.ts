import { describe, expect, it } from "vitest";
import type { TraceGraph } from "@/lib/erp/dag";
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

  it("arma el DTO sin los opcionales vacíos", () => {
    const { errors, dto } = validateLab("b1", filled, true);
    expect(errors).toEqual({});
    expect(dto).toMatchObject({
      bottlingBatchId: "b1",
      certifiedLaboratoryName: "Laboratorio Enológico de Tarija",
      actualAlcoholAbv: 40.1,
      totalAcidityTartaricGl: 0.35,
      methanolContentMgL: 180,
      conformsToSenasagStandards: true,
      conformsToEuStandards: false,
    });
    expect(dto).not.toHaveProperty("freeSulfurDioxideMgL");
    expect(dto).not.toHaveProperty("analysisRequestDate");
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
  const T = "36cf86bf-e2a7-5af1-a370-5ba573d0bdcc";
  const P = "e58a7714-0a95-5cc4-8fd8-07999cb576e3";
  const B = "c95f78e7-f72a-556c-8bae-e6670da39e8b";

  it("ordena por etapa y enlaza cada nodo con su módulo", () => {
    const node = (id: string, type: TraceGraph["nodes"][number]["type"]) => ({
      id,
      type,
      label: id,
      date: "2026-01-01T00:00:00Z",
      data: {},
    });
    const dag: TraceGraph = {
      bottlingBatchId: "b",
      lotCode: "L",
      nodes: [node(B, "BOTTLING_BATCH"), node("lab", "LAB_ANALYSIS"), node(T, "TERROIR"), node(P, "PRODUCTION_BATCH")],
      edges: [],
    };
    const steps = dagSteps(dag);
    expect(steps.map((s) => s.type)).toEqual(["TERROIR", "PRODUCTION_BATCH", "BOTTLING_BATCH", "LAB_ANALYSIS"]);
    expect(steps.map((s) => s.href)).toEqual([`/origen/${T}`, `/destilacion/${P}`, `/envasado/${B}`, null]);
    expect(steps[1]!.stage).toBe("Destilación");
  });

  it("sin enlace cuando el nodo no es un id de la base (hashes de la cadena del backend)", () => {
    const dag: TraceGraph = {
      bottlingBatchId: "0x36cb",
      lotCode: "L",
      nodes: [{ id: "0xdc58", type: "TERROIR", label: "Parcela", date: null, data: {} }],
      edges: [],
    };
    expect(dagSteps(dag)[0]!.href).toBeNull();
  });
});
