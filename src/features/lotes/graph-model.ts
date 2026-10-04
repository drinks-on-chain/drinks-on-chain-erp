import type { LotGraph, LotGraphNode } from "@drinks-on-chain/mocks";
import { fmtDate, fmtNumber } from "@/lib/format";

// Grafo del lote (contrato de la Ola 2 §11.3, `GET /v1/lots/{id}/graph`): de la parcela al
// laboratorio, con cantidades y métricas reales. Lo que no se registró llega como `null` y se
// muestra como "No registrado" (EA-05): nunca se rellena con cifras de ejemplo.

const ORDER: readonly LotGraphNode["type"][] = [
  "TERROIR",
  "HARVEST_BATCH",
  "TANK",
  "WINE_AGING",
  "DISTILLATION",
  "BOTTLING",
  "LAB_ANALYSIS",
];

export const STAGE_TITLE: Record<LotGraphNode["type"], string> = {
  TERROIR: "Parcelas",
  HARVEST_BATCH: "Pesajes",
  TANK: "Tanques",
  WINE_AGING: "Crianza",
  DISTILLATION: "Destilación y reposo",
  BOTTLING: "Embotellado",
  LAB_ANALYSIS: "Laboratorio",
};

const UNIT = { kg: "kg", L: "L", bottles: "botellas" } as const;

type Quantity = { value: number; unit: keyof typeof UNIT } | null;

export const graphQuantity = (q: Quantity) =>
  q ? `${fmtNumber(q.value, Number.isInteger(q.value) ? 0 : 2)} ${UNIT[q.unit]}` : null;

export type GraphMetric = { key: string; label: string; text: string; recorded: boolean };

/** "23,4 °Bx" o "No registrado". */
export function metricView(m: LotGraphNode["metrics"][number]): GraphMetric {
  if (m.value === null) return { key: m.key, label: m.label, text: "No registrado", recorded: false };
  const value =
    typeof m.value === "number"
      ? fmtNumber(m.value, Number.isInteger(m.value) ? 0 : 2)
      : /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(m.value)
        ? fmtDate(m.value)
        : m.value;
  return { key: m.key, label: m.label, text: m.unit ? `${value} ${m.unit}` : value, recorded: true };
}

export type GraphNodeView = LotGraphNode & {
  /** De dónde recibe: "18.400 kg de HARV-2026-VIEJO-008". */
  inputs: string[];
  metricViews: GraphMetric[];
};

export type GraphStage = { type: LotGraphNode["type"]; title: string; nodes: GraphNodeView[] };

/** Etapas del grafo en el orden del proceso, cada una con sus registros y lo que recibe cada uno. */
export function graphStages(graph: Pick<LotGraph, "nodes" | "edges">): GraphStage[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const view = (node: LotGraphNode): GraphNodeView => ({
    ...node,
    inputs: graph.edges
      .filter((e) => e.to === node.id)
      .map((e) => {
        const from = byId.get(e.from)?.label ?? "un registro anterior";
        const quantity = graphQuantity(e.quantity);
        return quantity ? `${quantity} de ${from}` : `De ${from}`;
      }),
    metricViews: node.metrics.map(metricView),
  });
  return ORDER.map((type) => ({
    type,
    title: STAGE_TITLE[type],
    nodes: graph.nodes
      .filter((n) => n.type === type)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map(view),
  })).filter((stage) => stage.nodes.length > 0);
}
