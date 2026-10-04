import type { ReactNode } from "react";
import { Badge, cn } from "@drinks-on-chain/ui";
import { fmtDateTime } from "@/lib/format";

/**
 * Valor de un registro anulado por una corrección (`voided: true`): tachado y atenuado. El registro
 * sigue en su historial (nada se borra), pero ya no cuenta para el lote.
 */
export function VoidedText({ voided, children }: { voided: boolean; children: ReactNode }) {
  return <span className={cn(voided && "text-fg-muted line-through")}>{children}</span>;
}

/** Marca «Anulado» (con la fecha, si el servidor la da). No se fía solo del tachado. */
export function VoidedBadge({ at, feminine = false }: { at?: string | null; feminine?: boolean }) {
  return (
    <Badge tone="neutral" dot={false} title={at ? `El ${fmtDateTime(at)}` : undefined}>
      {feminine ? "Anulada" : "Anulado"}
    </Badge>
  );
}
