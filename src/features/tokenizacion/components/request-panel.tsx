"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import type { TokenizationRequest } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ErrorState,
  KeyValueList,
  Skeleton,
  StatusBadge,
  Timeline,
  getStatusBadge,
  toast,
} from "@drinks-on-chain/ui";
import { ReasonAction } from "@/components/reason-action";
import { actorText } from "@/features/lotes/lot-timeline";
import { errorMessage } from "@/lib/api/errors";
import { useTokenizationRequest, useWithdrawTokenizationRequest } from "@/lib/erp/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import {
  REQUEST_KIND,
  changeFieldLabel,
  pendingChangeRequests,
  requestActions,
  requestQuantityText,
  requestStatusText,
} from "../tokenization-model";

type Props = {
  requestId: string;
  /** Solo el dueño edita, reenvía y retira. */
  canManage: boolean;
  /** En la página de la solicitud se nombra el lote; en la ficha del lote sobra. */
  showLot?: boolean;
};

const missing = <span className="text-fg-muted">Sin indicar</span>;

function Actions({ request }: { request: TokenizationRequest }) {
  const withdraw = useWithdrawTokenizationRequest();
  const actions = requestActions(request, true);
  if (!actions.edit && !actions.withdraw) return null;
  return (
    <div className="flex flex-wrap items-start gap-3 border-t border-border pt-4">
      {actions.edit && (
        <Button asChild variant="secondary" iconStart={<Pencil aria-hidden size={16} />}>
          <Link href={`/lotes/${request.lotId}/tokenizar?solicitud=${request.id}`}>
            {actions.resubmit ? "Editar y reenviar" : "Editar la solicitud"}
          </Link>
        </Button>
      )}
      {actions.withdraw && (
        <ReasonAction
          label="Retirar solicitud"
          title={`¿Retirar la solicitud de ${request.lot.name}?`}
          description="La solicitud se cierra sin emitir nada. Podrás enviar otra más adelante. El motivo queda en el historial."
          confirmLabel="Sí, retirar"
          destructive
          variant="tertiary"
          onConfirm={async (reason) => {
            await withdraw.mutateAsync({ id: request.id, reason });
            toast({ title: "Solicitud retirada", description: request.lot.reference, tone: "success" });
          }}
        />
      )}
    </div>
  );
}

/**
 * Solicitud de tokenización (`GET /v1/tokenization-requests/{id}`, contrato de la Ola 3 §5): estado,
 * cambios pedidos con su mensaje, decisión, datos enviados e historial. El dueño puede editarla y
 * reenviarla o retirarla; el resto de roles la lee.
 */
export function RequestPanel({ requestId, canManage, showLot = false }: Props) {
  const query = useTokenizationRequest(requestId);

  if (query.isError) {
    return (
      <ErrorState description={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  }
  if (!query.data) return <Skeleton shape="block" className="h-72" />;

  const r = query.data;
  const changes = pendingChangeRequests(r);
  const draft = r.commercialDraft;
  const cover = draft.imageKeys.find((i) => i.isCover) ?? draft.imageKeys[0];

  return (
    <Card className="grid grid-cols-1 gap-4" role="group" aria-label="Solicitud de tokenización" data-status={r.status}>
      <CardHeader
        title={`${REQUEST_KIND[r.kind]} · ${requestQuantityText(r)}`}
        description={requestStatusText(r)}
        action={<StatusBadge kind="tokenizationRequest" status={r.status} />}
      />

      {changes.map((c) => (
        <Alert key={c.id} tone="warning" title="Drinks on Chain pidió cambios" data-testid="change-request">
          <p className="m-0">{c.message}</p>
          {c.fields.length > 0 && (
            <p className="m-0 text-sm">
              <span className="text-fg-muted">Campos a revisar: </span>
              {c.fields.map(changeFieldLabel).join(", ")}
            </p>
          )}
          <p className="m-0 text-sm text-fg-muted">
            {c.by.fullName} · {fmtDateTime(c.at)}
          </p>
        </Alert>
      ))}
      {r.decision?.outcome === "REJECTED" && (
        <Alert tone="danger" title="Solicitud rechazada">
          {r.decision.reason ?? "Drinks on Chain no indicó el motivo."}
        </Alert>
      )}
      {r.withdrawn && (
        <Alert tone="neutral" title="Solicitud retirada por la bodega">
          {r.withdrawn.reason} · {actorText(r.withdrawn.by)} · {fmtDateTime(r.withdrawn.at)}
        </Alert>
      )}

      <KeyValueList
        items={[
          ...(showLot
            ? [
                {
                  term: "Lote",
                  value: (
                    <Link href={`/lotes/${r.lotId}?pestana=tokenizacion`} className="font-medium hover:underline">
                      {r.lot.name} <span className="font-mono text-sm text-fg-muted">{r.lot.reference}</span>
                    </Link>
                  ),
                },
              ]
            : []),
          { term: "Enviada", value: `${fmtDateTime(r.submittedAt)} · ${actorText(r.submittedBy)}` },
          { term: "Cuota si se aprueba", value: `${fmtNumber(r.resultingQuota)} botellas` },
          {
            term: "Revisión",
            value: r.requiresApproval
              ? (r.assignee?.fullName ?? "Sin asignar todavía")
              : "No requiere aprobación de Drinks on Chain",
          },
          ...(r.kind === "INITIAL"
            ? [
                { term: "Nombre de la colección", value: draft.name ?? missing },
                { term: "Descripción", value: draft.description ?? missing },
                { term: "Notas de cata", value: draft.tastingNotes ?? missing },
                { term: "Maridaje", value: draft.pairing ?? missing },
                {
                  term: "Fotos",
                  value:
                    draft.imageKeys.length === 0 ? (
                      <span className="text-fg-muted">Ninguna todavía (hace falta una de portada para aprobar)</span>
                    ) : (
                      `${draft.imageKeys.length} · portada: ${cover?.alt || "sin descripción"}`
                    ),
                },
              ]
            : []),
          ...(r.wineryNotes ? [{ term: "Notas de la bodega", value: r.wineryNotes }] : []),
        ]}
      />

      <section aria-label="Historial de la solicitud" className="grid gap-2 border-t border-border pt-4">
        <h3 className="m-0 text-base font-medium">Historial</h3>
        <Timeline
          aria-label="Pasos de la solicitud"
          items={[...r.history].reverse().map((h, i) => ({
            key: `${h.at}-${i}`,
            status: "done" as const,
            title: getStatusBadge("tokenizationRequest", h.status).label,
            time: `${fmtDateTime(h.at)} · ${h.by}`,
            description: h.note ?? undefined,
          }))}
        />
      </section>

      {canManage && <Actions request={r} />}
    </Card>
  );
}
