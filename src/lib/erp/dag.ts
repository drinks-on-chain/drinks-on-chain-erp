import { z } from "zod";
import { TraceabilityDagSchema, type DagNodeType, type TraceabilityDag } from "@drinks-on-chain/mocks";

// Grafo de `GET /v1/traceability/dag/:bottlingBatchId`. El OpenAPI del backend no declara su forma
// y los mocks 0.3.0-rc.2 proponen otra (`{ bottlingBatchId, lotCode, nodes[{ id, type, label,
// date, data }], edges }`). El backend real (O0-ERP-2, 27-09-2026) devuelve la del contrato de la
// cadena: `{ rootBatchId, internationalLotCode, productType, nodes[{ batchId, stage, stageName,
// parents, timestamp, details, … }] }`, con ids que son hashes de la cadena y no ids de la base.
// Se aceptan las dos y se normalizan a la de los mocks hasta que el contrato fije una.

/** `stageName` del backend → tipo de nodo del ERP. Lo que no se reconoce se descarta. */
const STAGE_TYPE: Record<string, DagNodeType> = {
  Plot: "TERROIR",
  Harvest: "HARVEST_BATCH",
  Vinification: "FERMENTATION_TANK",
  Aging: "WINE_AGING",
  Distillation: "PRODUCTION_BATCH",
  Bottling: "BOTTLING_BATCH",
  LabAnalysis: "LAB_ANALYSIS",
  Lab: "LAB_ANALYSIS",
};

/** Campo de `details` que nombra el nodo en cada etapa (como `label` en los mocks). */
const LABEL_KEYS: Record<DagNodeType, readonly string[]> = {
  TERROIR: ["parcelName"],
  HARVEST_BATCH: ["harvestBatchCode"],
  FERMENTATION_TANK: ["tankCode"],
  WINE_AGING: ["containerCode", "containerType"],
  PRODUCTION_BATCH: ["equipmentIdentifier"],
  BOTTLING_BATCH: ["internationalLotCode"],
  LAB_ANALYSIS: ["accreditedLabCertificationCode", "certifiedLaboratoryName"],
};

const chainDagSchema = z.looseObject({
  rootBatchId: z.string(),
  internationalLotCode: z.string(),
  nodes: z.array(
    z.looseObject({
      batchId: z.string(),
      stageName: z.string(),
      parents: z.array(z.string()).default([]),
      timestamp: z.string().nullish(),
      details: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
});
type ChainDag = z.infer<typeof chainDagSchema>;

function labelOf(type: DagNodeType, details: Record<string, unknown>, fallback: string): string {
  for (const key of LABEL_KEYS[type]) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

/** Convierte el grafo del backend a la forma que usa el ERP. */
export function fromChainDag(dag: ChainDag): TraceabilityDag {
  const nodes: TraceabilityDag["nodes"] = [];
  const edges: TraceabilityDag["edges"] = [];
  for (const n of dag.nodes) {
    const type = STAGE_TYPE[n.stageName];
    if (!type) continue;
    const details = n.details ?? {};
    nodes.push({
      id: n.batchId,
      type,
      label: labelOf(type, details, n.stageName),
      date: n.timestamp ?? null,
      data: details,
    });
    for (const parent of n.parents) edges.push({ from: parent, to: n.batchId });
  }
  const bottling = dag.nodes.find((n) => STAGE_TYPE[n.stageName] === "BOTTLING_BATCH");
  return {
    bottlingBatchId: bottling?.batchId ?? dag.rootBatchId,
    lotCode: dag.internationalLotCode,
    nodes,
    edges,
  };
}

/** Esquema de la respuesta: la forma de los mocks o la del backend, siempre normalizada. */
export const DagResponseSchema: z.ZodType<TraceabilityDag> = z.union([
  TraceabilityDagSchema,
  chainDagSchema.transform(fromChainDag),
]) as unknown as z.ZodType<TraceabilityDag>;
