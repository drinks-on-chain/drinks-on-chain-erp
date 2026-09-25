import type { DagNodeType, TraceabilityDag } from "@drinks-on-chain/mocks";

// Línea de tiempo del lote a partir del grafo de trazabilidad (GET /v1/traceability/dag/:id).
// La forma del grafo es una propuesta de los mocks (el OpenAPI no la declara): se ordena por
// etapa y no por la posición en la respuesta.

const ORDER: DagNodeType[] = [
  "TERROIR",
  "HARVEST_BATCH",
  "FERMENTATION_TANK",
  "WINE_AGING",
  "PRODUCTION_BATCH",
  "BOTTLING_BATCH",
  "LAB_ANALYSIS",
];

export const DAG_NODE_LABEL: Record<DagNodeType, string> = {
  TERROIR: "Parcela",
  HARVEST_BATCH: "Vendimia",
  FERMENTATION_TANK: "Tanque",
  WINE_AGING: "Crianza",
  PRODUCTION_BATCH: "Destilación",
  BOTTLING_BATCH: "Embotellado",
  LAB_ANALYSIS: "Certificado de laboratorio",
};

const HREF: Partial<Record<DagNodeType, string>> = {
  TERROIR: "/origen",
  HARVEST_BATCH: "/vendimia",
  FERMENTATION_TANK: "/vinificacion",
  WINE_AGING: "/crianza",
  PRODUCTION_BATCH: "/destilacion",
  BOTTLING_BATCH: "/envasado",
};

export type TraceStep = {
  id: string;
  type: DagNodeType;
  stage: string;
  label: string;
  date: string | null;
  href: string | null;
};

export function dagSteps(dag: TraceabilityDag): TraceStep[] {
  return [...dag.nodes]
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map((n) => ({
      id: n.id,
      type: n.type,
      stage: DAG_NODE_LABEL[n.type],
      label: n.label,
      date: n.date,
      href: HREF[n.type] ? `${HREF[n.type]}/${n.id}` : null,
    }));
}
