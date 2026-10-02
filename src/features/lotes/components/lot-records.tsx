"use client";

import Link from "next/link";
import type { LotGraphNode } from "@drinks-on-chain/mocks";
import { Alert, Badge, Button, EmptyState, Skeleton } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useLotGraph } from "@/lib/erp/hooks";
import { formatRuleValue } from "@/lib/erp/rule-violations";
import { fmtDate, fmtNumber } from "@/lib/format";

export const NODE_TYPE: Record<LotGraphNode["type"], string> = {
  TERROIR: "Parcela",
  HARVEST_BATCH: "Pesaje",
  TANK: "Tanque",
  WINE_AGING: "Crianza",
  DISTILLATION: "Destilación",
  BOTTLING: "Embotellado",
  LAB_ANALYSIS: "Laboratorio",
};

const UNIT: Record<NonNullable<LotGraphNode["quantity"]>["unit"], string> = { kg: "kg", L: "L", bottles: "botellas" };

/** Pantalla del registro de un nodo del grafo, si la tiene. */
export function nodeHref(node: Pick<LotGraphNode, "id" | "type">): string | null {
  switch (node.type) {
    case "TERROIR":
      return `/origen/${node.id}`;
    case "HARVEST_BATCH":
      return `/vendimia/${node.id}`;
    case "TANK":
      return `/vinificacion/${node.id}`;
    case "WINE_AGING":
      return `/crianza/${node.id}`;
    case "DISTILLATION":
      return `/destilacion/${node.id}`;
    case "BOTTLING":
      return `/envasado/${node.id}`;
    default:
      return null;
  }
}

export const quantityText = (q: LotGraphNode["quantity"]) =>
  q ? `${fmtNumber(q.value, Number.isInteger(q.value) ? 0 : 2)} ${UNIT[q.unit]}` : null;

/**
 * Registros que forman el lote (parcelas, pesajes, tanques, crianzas o destilaciones, embotellado
 * y laboratorio), con enlace a cada módulo. Salen del grafo real del lote (`GET /v1/lots/{id}/graph`).
 */
export function LotRecords({ lotId }: { lotId: string }) {
  const graph = useLotGraph(lotId);

  if (graph.isError) {
    return (
      <Alert
        tone="danger"
        title="No se pudieron cargar los registros del lote"
        action={
          <Button size="sm" variant="tertiary" onClick={() => graph.refetch()}>
            Reintentar
          </Button>
        }
      >
        {errorMessage(graph.error)}
      </Alert>
    );
  }
  if (!graph.data) return <Skeleton shape="block" className="h-48" />;
  if (graph.data.nodes.length === 0) {
    return (
      <EmptyState
        bare
        title="El lote aún no tiene registros"
        description="Empieza por registrar el pesaje de la uva."
      />
    );
  }

  return (
    <ul aria-label="Registros del lote" className="m-0 grid list-none gap-0 p-0">
      {graph.data.nodes.map((node) => {
        const href = nodeHref(node);
        const quantity = quantityText(node.quantity);
        return (
          <li
            key={`${node.type}-${node.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 last:border-b-0"
          >
            <span className="w-24 shrink-0 text-sm text-fg-muted">{NODE_TYPE[node.type]}</span>
            <span className="min-w-0 flex-1">
              {href ? (
                <Link href={href} className="font-medium hover:underline">
                  {node.label}
                </Link>
              ) : (
                <span className="font-medium">{node.label}</span>
              )}
              <span className="block text-sm text-fg-muted">
                {[fmtDate(node.occurredAt), quantity, formatRuleValue(node.status)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {node.corrected && <Badge tone="info">Corregido</Badge>}
          </li>
        );
      })}
    </ul>
  );
}
