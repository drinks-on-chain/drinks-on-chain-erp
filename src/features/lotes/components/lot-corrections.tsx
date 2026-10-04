"use client";

import { useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import type { Correction, Lot, LotGraphNode } from "@drinks-on-chain/mocks";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCorrections, useLotGraph } from "@/lib/erp/hooks";
import { canCorrect } from "@/lib/erp/permissions";
import { fmtDateTime } from "@/lib/format";
import { NODE_TARGET, TARGET_LABEL, changeText, correctableFields, isVoidable } from "../correction-model";
import { actorText } from "../lot-timeline";
import { CorrectionDialog, type CorrectableRecord } from "./correction-dialog";

type Props = { lot: Pick<Lot, "id" | "name" | "reference" | "dossierStatus" | "complianceIssues"> };

/**
 * Correcciones del lote (contrato de la Ola 2 §9): lista de lo corregido (qué, de qué valor a cuál,
 * por qué y quién) y el diálogo para registrar una nueva sobre los registros principales del lote.
 * Los análisis de madurez, los dictámenes, las lecturas y los tratamientos se corrigen o anulan
 * desde la ficha del pesaje y del tanque. Ningún registro se edita ni se borra.
 */
export function LotCorrections({ lot }: Props) {
  const me = useMe();
  const corrections = useCorrections(lot.id);
  const graph = useLotGraph(lot.id);
  const [open, setOpen] = useState(false);

  // Registros del lote que esta persona puede corregir (S-17: quien puede crearlos).
  const records = useMemo<CorrectableRecord[]>(
    () =>
      (graph.data?.nodes ?? [])
        .map((n: LotGraphNode) => ({ id: n.id, type: NODE_TARGET[n.type], label: n.label }))
        .filter((r) => canCorrect(me.data, r.type) && (isVoidable(r.type) || correctableFields(r.type).length > 0)),
    [graph.data, me.data],
  );
  const labels = useMemo(() => new Map((graph.data?.nodes ?? []).map((n) => [n.id, n.label] as const)), [graph.data]);
  const fromCorrections = lot.complianceIssues.filter((i) => i.source === "CORRECTION" && !i.resolvedAt).length;
  const add =
    records.length > 0 ? (
      <Button variant="secondary" iconStart={<PenLine aria-hidden size={16} />} onClick={() => setOpen(true)}>
        Registrar corrección
      </Button>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4">
      {lot.dossierStatus === "CLOSED" && (
        <Alert tone="info" title="El expediente está cerrado">
          Su huella ya está fijada: el servidor no admite más correcciones en este lote.
        </Alert>
      )}
      {fromCorrections > 0 && (
        <Alert
          tone="warning"
          title={
            fromCorrections === 1
              ? "Una corrección dejó una incidencia abierta"
              : `${fromCorrections} incidencias abiertas por correcciones`
          }
        >
          El lote ya estaba embotellado cuando se corrigió: la corrección quedó registrada aunque incumple una regla del
          embotellado, y el servidor abrió una incidencia de cumplimiento. Bloquea el cierre del expediente hasta que
          otra corrección la resuelva.
        </Alert>
      )}
      <Card className="grid grid-cols-1 gap-4">
        <CardHeader
          title="Correcciones"
          description="Un registro no se edita ni se borra: se corrige con otro registro que guarda el valor anterior, el motivo y quién lo hizo. Los análisis, dictámenes, lecturas y tratamientos se corrigen desde su pesaje o su tanque."
          action={add}
        />
        {corrections.isError ? (
          <ErrorState
            bare
            description={errorMessage(corrections.error)}
            onRetry={() => corrections.refetch()}
            retrying={corrections.isFetching}
          />
        ) : !corrections.data ? (
          <Skeleton shape="block" className="h-32" />
        ) : corrections.data.items.length === 0 ? (
          <EmptyState
            bare
            title="Sin correcciones"
            description="Los registros de este lote están como se escribieron."
          />
        ) : (
          <ul aria-label="Correcciones del lote" className="m-0 grid list-none gap-0 p-0">
            {corrections.data.items.map((c) => (
              <CorrectionItem key={c.id} correction={c} label={labels.get(c.target.id)} />
            ))}
          </ul>
        )}
      </Card>
      {records.length > 0 && (
        <CorrectionDialog
          lotId={lot.id}
          lotLabel={`${lot.name} · ${lot.reference}`}
          records={records}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}

function CorrectionItem({ correction: c, label }: { correction: Correction; label: string | undefined }) {
  return (
    <li className="grid gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {TARGET_LABEL[c.target.type]}
          {label ? ` · ${label}` : ""}
        </span>
        <Badge tone={c.kind === "VOID" ? "warning" : "info"}>{c.kind === "VOID" ? "Anulado" : "Corregido"}</Badge>
      </div>
      {c.kind === "AMEND" && c.changes.length > 0 && (
        <ul className="m-0 grid list-none gap-0.5 p-0 text-sm tabular-nums">
          {c.changes.map((change) => (
            <li key={change.field}>{changeText(change)}</li>
          ))}
        </ul>
      )}
      <p className="m-0 text-sm">Motivo: {c.reason}</p>
      <p className="m-0 text-sm text-fg-muted">
        {fmtDateTime(c.createdAt)} · {actorText(c.createdBy)}
      </p>
    </li>
  );
}
