import { DagGraphSchema, type DagGraph, type DagStageName } from "@drinks-on-chain/mocks";

// Grafo de `GET /v1/traceability/dag/:bottlingBatchId`: `DagGraphResponseDto` del backend (el mismo
// que sirven los mocks desde 0.4.0-rc.1): `{ rootBatchId, internationalLotCode, productType,
// nodes[{ batchId, stage, stageName, parents, timestamp, details, … }] }`, con ids que son hashes
// de la cadena y no ids de la base; el certificado de laboratorio va en `details.labAnalysis` del
// embotellado (o `null`). Se valida con `DagGraphSchema` y se convierte a los pasos que pinta la
// línea de tiempo del lote.

/** Tipo de paso de la línea de tiempo: una etapa de la cadena o el certificado de laboratorio. */
export type TraceNodeType =
  | "TERROIR"
  | "HARVEST_BATCH"
  | "FERMENTATION_TANK"
  | "WINE_AGING"
  | "PRODUCTION_BATCH"
  | "BOTTLING_BATCH"
  | "LAB_ANALYSIS";

export type TraceNode = {
  id: string;
  type: TraceNodeType;
  label: string;
  date: string | null;
  data: Record<string, unknown>;
};

export type TraceGraph = {
  bottlingBatchId: string;
  lotCode: string;
  nodes: TraceNode[];
  edges: { from: string; to: string }[];
};

/** `stageName` del backend → tipo de paso del ERP. */
const STAGE_TYPE: Record<DagStageName, TraceNodeType> = {
  Plot: "TERROIR",
  Harvest: "HARVEST_BATCH",
  Vinification: "FERMENTATION_TANK",
  Aging: "WINE_AGING",
  Distillation: "PRODUCTION_BATCH",
  Bottling: "BOTTLING_BATCH",
};

/** Campo de `details` que nombra el paso en cada etapa. */
const LABEL_KEYS: Record<TraceNodeType, readonly string[]> = {
  TERROIR: ["parcelName"],
  HARVEST_BATCH: ["harvestBatchCode"],
  FERMENTATION_TANK: ["tankCode"],
  WINE_AGING: ["containerCode", "containerType"],
  PRODUCTION_BATCH: ["equipmentIdentifier"],
  BOTTLING_BATCH: ["internationalLotCode"],
  LAB_ANALYSIS: ["accreditedLabCertificationCode", "certifiedLaboratoryName"],
};

function labelOf(type: TraceNodeType, details: Record<string, unknown>, fallback: string): string {
  for (const key of LABEL_KEYS[type]) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

/** Convierte el grafo del backend en los pasos de la línea de tiempo (con el certificado aparte). */
export function fromDagGraph(dag: DagGraph): TraceGraph {
  const nodes: TraceNode[] = [];
  const edges: TraceGraph["edges"] = [];
  for (const n of dag.nodes) {
    const type = STAGE_TYPE[n.stageName];
    nodes.push({
      id: n.batchId,
      type,
      label: labelOf(type, n.details, n.stageName),
      date: n.timestamp,
      data: n.details,
    });
    for (const parent of n.parents) edges.push({ from: parent, to: n.batchId });
    // Certificado de laboratorio del embotellado: un paso más de la línea de tiempo.
    const lab = type === "BOTTLING_BATCH" ? n.details.labAnalysis : null;
    if (lab && typeof lab === "object") {
      const data = lab as Record<string, unknown>;
      const id = `${n.batchId}:lab`;
      const at = data.testPerformedAt;
      nodes.push({
        id,
        type: "LAB_ANALYSIS",
        label: labelOf("LAB_ANALYSIS", data, "Certificado de laboratorio"),
        date: typeof at === "string" ? at : null,
        data,
      });
      edges.push({ from: n.batchId, to: id });
    }
  }
  const bottling = dag.nodes.find((n) => n.stageName === "Bottling");
  return {
    bottlingBatchId: bottling?.batchId ?? dag.rootBatchId,
    lotCode: dag.internationalLotCode,
    nodes,
    edges,
  };
}

/** Esquema de la respuesta: el grafo del backend, convertido a los pasos de la línea de tiempo. */
export const DagResponseSchema = DagGraphSchema.transform(fromDagGraph);
