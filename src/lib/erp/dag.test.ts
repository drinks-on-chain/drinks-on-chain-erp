import { describe, expect, it } from "vitest";
import { DagResponseSchema } from "./dag";

// Forma real de GET /v1/traceability/dag/:id en el backend de desarrollo (27-09-2026), recortada.
const chainDag = {
  rootBatchId: "0x36cb",
  internationalLotCode: "CVJ-2026-SINGANI-001",
  productType: "SINGANI",
  nodes: [
    {
      batchId: "0xdc58",
      stage: 0,
      stageName: "Plot",
      parents: [],
      timestamp: "2026-02-07T11:00:00.000Z",
      volumeOrUnits: 3.3,
      metrics: [241000],
      metadataHash: "0x1",
      isCertified: true,
      operator: { name: "Ingeniero Agrónomo", role: "Agronomist", wineryName: "Destilería Cinti Viejo" },
      details: { parcelName: "Parcela 2 · Cañón Viejo", varietyName: "Moscatel de Alejandría" },
    },
    {
      batchId: "0xaa01",
      stage: 1,
      stageName: "Harvest",
      parents: ["0xdc58"],
      timestamp: "2025-03-10T00:00:00.000Z",
      details: { harvestBatchCode: "HARV-2025-VIEJO-02" },
    },
    {
      batchId: "0xbb02",
      stage: 4,
      stageName: "Distillation",
      parents: ["0xaa01"],
      timestamp: "2025-05-20T00:00:00.000Z",
      details: { equipmentIdentifier: "Alambique de cobre Charentais AL-01" },
    },
    {
      batchId: "0x36cb",
      stage: 5,
      stageName: "Bottling",
      parents: ["0xbb02"],
      timestamp: "2026-03-01T00:00:00.000Z",
      details: {
        internationalLotCode: "CVJ-2026-SINGANI-001",
        labAnalysis: {
          certifiedLaboratoryName: "Laboratorio ISO 17025",
          accreditedLabCertificationCode: "LAB-CVJ-2026-001",
          actualAlcoholAbv: 40,
        },
      },
    },
    { batchId: "0xzz", stage: 9, stageName: "Desconocida", parents: [], timestamp: null, details: null },
  ],
};

describe("DagResponseSchema", () => {
  it("normaliza el grafo del backend (etapas, nombres, fechas y aristas)", () => {
    const dag = DagResponseSchema.parse(chainDag);
    expect(dag.lotCode).toBe("CVJ-2026-SINGANI-001");
    expect(dag.bottlingBatchId).toBe("0x36cb");
    expect(dag.nodes.map((n) => [n.type, n.label])).toEqual([
      ["TERROIR", "Parcela 2 · Cañón Viejo"],
      ["HARVEST_BATCH", "HARV-2025-VIEJO-02"],
      ["PRODUCTION_BATCH", "Alambique de cobre Charentais AL-01"],
      ["BOTTLING_BATCH", "CVJ-2026-SINGANI-001"],
      ["LAB_ANALYSIS", "LAB-CVJ-2026-001"],
    ]);
    expect(dag.nodes[0]!.date).toBe("2026-02-07T11:00:00.000Z");
    expect(dag.edges).toContainEqual({ from: "0xaa01", to: "0xbb02" });
    expect(dag.edges).toContainEqual({ from: "0x36cb", to: "0x36cb:lab" });
  });

  it("sin certificado (labAnalysis null) no añade el nodo de laboratorio", () => {
    const bottlingOnly = {
      ...chainDag,
      nodes: [{ ...chainDag.nodes[3]!, details: { internationalLotCode: "CVJ-2026-SINGANI-001", labAnalysis: null } }],
    };
    expect(DagResponseSchema.parse(bottlingOnly).nodes.map((n) => n.type)).toEqual(["BOTTLING_BATCH"]);
  });

  it("acepta también la forma de los mocks tal cual", () => {
    const mock = {
      bottlingBatchId: "b",
      lotCode: "L",
      nodes: [{ id: "b", type: "BOTTLING_BATCH", label: "L", date: "2026-01-01T00:00:00.000Z", data: {} }],
      edges: [],
    };
    expect(DagResponseSchema.parse(mock)).toEqual(mock);
  });

  it("rechaza lo que no es ninguna de las dos formas", () => {
    expect(DagResponseSchema.safeParse({ nodes: [] }).success).toBe(false);
  });
});
