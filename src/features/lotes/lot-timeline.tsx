"use client";

import Link from "next/link";
import type { LotEvent } from "@drinks-on-chain/mocks";
import { Badge, EmptyState, ErrorState, Skeleton, Timeline } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useLotTimeline } from "@/lib/erp/hooks";
import { LOT_EVENT } from "@/lib/erp/labels";
import { roleLabel } from "@/lib/erp/permissions";
import { fmtDate } from "@/lib/format";

/** Ficha del registro al que se refiere un evento, si tiene pantalla propia. */
export function eventHref(resource: LotEvent["resource"]): string | null {
  switch (resource.type) {
    case "harvest_batch":
      return `/vendimia/${resource.id}`;
    case "fermentation_tank":
      return `/vinificacion/${resource.id}`;
    case "wine_aging_batch":
      return `/crianza/${resource.id}`;
    case "production_batch":
      return `/destilacion/${resource.id}`;
    case "bottling_batch":
      return `/envasado/${resource.id}`;
    default:
      return null;
  }
}

/** "Lic. Marcela Flores · Enología" o "Sistema" (tarea diaria, migración). */
export const actorText = (actor: LotEvent["actor"]) =>
  actor ? `${actor.fullName} · ${roleLabel(actor.role)}` : "Sistema";

/**
 * Línea de tiempo del lote (`GET /v1/lots/{id}/timeline`, contrato de la Ola 2 §11.1): cada hecho
 * con su fecha declarada, quién lo registró y, si fue tardío o corregido, la marca visible.
 */
export function LotTimeline({ lotId }: { lotId: string }) {
  const timeline = useLotTimeline(lotId);

  if (timeline.isError) {
    return (
      <ErrorState
        description={errorMessage(timeline.error)}
        onRetry={() => timeline.refetch()}
        retrying={timeline.isFetching}
      />
    );
  }
  if (!timeline.data) return <Skeleton shape="block" className="h-80" />;
  if (timeline.data.events.length === 0) {
    return <EmptyState bare title="Sin eventos todavía" description="Cada registro del lote aparecerá aquí." />;
  }

  // Lo más reciente primero: es lo que se viene a mirar.
  const events = [...timeline.data.events].sort((a, b) => b.seq - a.seq);
  return (
    <Timeline
      aria-label="Línea de tiempo del lote"
      items={events.map((e) => {
        const href = eventHref(e.resource);
        return {
          key: e.id,
          status: "done" as const,
          title: (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-fg-muted">{LOT_EVENT[e.type]} ·</span>
              {href ? (
                <Link href={href} className="font-medium hover:underline">
                  {e.summary}
                </Link>
              ) : (
                <span className="font-medium">{e.summary}</span>
              )}
              {e.corrected && <Badge tone="info">Corregido</Badge>}
              {e.lateEntry && (
                <Badge tone="warning" title="Registrado más de 7 días después del hecho">
                  Registro tardío
                </Badge>
              )}
            </span>
          ),
          time: e.lateEntry
            ? `${fmtDate(e.occurredAt)} · registrado el ${fmtDate(e.recordedAt)}`
            : fmtDate(e.occurredAt),
          description: actorText(e.actor),
        };
      })}
    />
  );
}
