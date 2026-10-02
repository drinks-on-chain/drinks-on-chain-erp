"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Lot } from "@drinks-on-chain/mocks";
import { Badge, EmptyState, ErrorState, Skeleton } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useLotGraph } from "@/lib/erp/hooks";
import { formatRuleValue } from "@/lib/erp/rule-violations";
import { fmtDate } from "@/lib/format";
import { graphQuantity, graphStages } from "../graph-model";
import { actorText } from "../lot-timeline";
import { nodeHref } from "./lot-records";

/**
 * Grafo de trazabilidad del lote (`GET /v1/lots/{id}/graph`): cada etapa con sus registros, lo que
 * recibe de la anterior y sus métricas reales. Lo que no se midió se lee «No registrado».
 */
export function LotGraphView({ lot }: { lot: Pick<Lot, "id" | "name"> }) {
  const graph = useLotGraph(lot.id);
  const stages = useMemo(() => (graph.data ? graphStages(graph.data) : []), [graph.data]);

  if (graph.isError) {
    return (
      <ErrorState description={errorMessage(graph.error)} onRetry={() => graph.refetch()} retrying={graph.isFetching} />
    );
  }
  if (!graph.data) return <Skeleton shape="block" className="h-96" />;
  if (stages.length === 0) {
    return (
      <EmptyState
        title="El lote aún no tiene registros"
        description="El grafo se forma con el pesaje, los tanques, la crianza o la destilación y el embotellado."
      />
    );
  }

  return (
    <ol aria-label={`Trazabilidad de ${lot.name}`} className="m-0 grid list-none gap-0 p-0">
      {stages.map((stage, i) => (
        <li
          key={stage.type}
          className="grid gap-3 border-l-2 border-border pb-6 pl-5 last:pb-0"
          data-stage={stage.type}
        >
          <h3 className="relative m-0 font-ui text-sm font-semibold tracking-wide text-fg-muted uppercase">
            <span
              aria-hidden
              className="absolute top-1/2 -left-[27px] size-3 -translate-y-1/2 rounded-full border-2 border-accent bg-bg"
            />
            {i + 1}. {stage.title}
          </h3>
          <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
            {stage.nodes.map((node) => {
              const href = nodeHref(node);
              const quantity = graphQuantity(node.quantity);
              return (
                <li key={node.id} className="grid content-start gap-2 rounded-md border border-border bg-bg-raised p-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {href ? (
                      <Link href={href} className="font-medium hover:underline">
                        {node.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{node.label}</span>
                    )}
                    {quantity && <span className="text-sm tabular-nums">· {quantity}</span>}
                    {node.corrected && <Badge tone="info">Corregido</Badge>}
                  </div>
                  <p className="m-0 text-sm text-fg-muted">
                    {[fmtDate(node.occurredAt), formatRuleValue(node.status), node.actor ? actorText(node.actor) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {node.inputs.length > 0 && (
                    <p className="m-0 text-sm">
                      <span className="text-fg-muted">Recibe: </span>
                      {node.inputs.join("; ")}
                    </p>
                  )}
                  {node.metricViews.length > 0 && (
                    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      {node.metricViews.map((m) => (
                        <div key={m.key} className="contents">
                          <dt className="text-fg-muted">{m.label}</dt>
                          <dd className={m.recorded ? "m-0 tabular-nums" : "m-0 text-fg-muted"}>{m.text}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
