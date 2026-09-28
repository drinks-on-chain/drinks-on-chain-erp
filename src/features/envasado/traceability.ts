import type { TraceGraph, TraceNodeType } from "@/lib/erp/dag";

// Línea de tiempo del lote a partir del grafo de trazabilidad (GET /v1/traceability/dag/:id),
// convertido en pasos por `src/lib/erp/dag.ts`: se ordena por etapa y no por la posición en la
// respuesta.

const ORDER: TraceNodeType[] = [
  "TERROIR",
  "HARVEST_BATCH",
  "FERMENTATION_TANK",
  "WINE_AGING",
  "PRODUCTION_BATCH",
  "BOTTLING_BATCH",
  "LAB_ANALYSIS",
];

export const DAG_NODE_LABEL: Record<TraceNodeType, string> = {
  TERROIR: "Parcela",
  HARVEST_BATCH: "Vendimia",
  FERMENTATION_TANK: "Tanque",
  WINE_AGING: "Crianza",
  PRODUCTION_BATCH: "Destilación",
  BOTTLING_BATCH: "Embotellado",
  LAB_ANALYSIS: "Certificado de laboratorio",
};

const HREF: Partial<Record<TraceNodeType, string>> = {
  TERROIR: "/origen",
  HARVEST_BATCH: "/vendimia",
  FERMENTATION_TANK: "/vinificacion",
  WINE_AGING: "/crianza",
  PRODUCTION_BATCH: "/destilacion",
  BOTTLING_BATCH: "/envasado",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TraceStep = {
  id: string;
  type: TraceNodeType;
  stage: string;
  label: string;
  date: string | null;
  href: string | null;
};

export function dagSteps(dag: TraceGraph): TraceStep[] {
  return [...dag.nodes]
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map((n) => ({
      id: n.id,
      type: n.type,
      stage: DAG_NODE_LABEL[n.type],
      label: n.label,
      date: n.date,
      // El grafo del backend identifica los nodos con hashes de la cadena: sin enlace.
      href: HREF[n.type] && UUID.test(n.id) ? `${HREF[n.type]}/${n.id}` : null,
    }));
}
