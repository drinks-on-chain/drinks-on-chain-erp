"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { Lot, TokenizationRequestSummary } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  StatusBadge,
} from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { errorMessage } from "@/lib/api/errors";
import { parseRuleViolations } from "@/lib/api/rule-violations";
import { useMe } from "@/lib/auth/hooks";
import { CHAIN_IDENTITY_STATUS } from "@/lib/erp/chain";
import { useLotTokenization, useRefreshErp } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { CollectionPanel } from "./components/collection-panel";
import { RequestPanel } from "./components/request-panel";
import { REQUEST_KIND, limitsView, requestQuantityText } from "./tokenization-model";

/**
 * Pestaña «Tokenización» de la ficha del lote (1K, contrato de la Ola 3 §5–§6): el límite de la
 * cuota y los bloqueos que calcula el servidor (`GET /v1/lots/{id}/tokenization`), «Autorizar
 * tokenización» o «Ampliar cuota» para el dueño, la solicitud abierta con su historial, la colección
 * con su emisión y las solicitudes anteriores. Enología y contabilidad la leen.
 */
export function LotTokenization({ lot }: { lot: Lot }) {
  const me = useMe();
  const canManage = can(me.data, "tokenization.manage");
  const canClosure = can(me.data, "tokenization.closure.read");
  const status = useLotTokenization(lot.id);
  const refresh = useRefreshErp();

  if (status.isError) {
    return (
      <ErrorState
        description={errorMessage(status.error)}
        onRetry={() => status.refetch()}
        retrying={status.isFetching}
      />
    );
  }
  if (!status.data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-busy="true">
        <Skeleton shape="block" className="h-72" />
        <Skeleton shape="block" className="h-72" />
      </div>
    );
  }

  const s = status.data;
  const limits = limitsView(s.limits);
  const increase = s.collection !== null;
  // Con una solicitud abierta a la vista, ese bloqueo no necesita aviso aparte.
  const blockers = parseRuleViolations(s.blockers).filter(
    (b) => !(s.openRequest && b.code === "TOK_REQUEST_ALREADY_OPEN"),
  );
  // La más reciente ya cerrada, si no hay ninguna abierta (p. ej. rechazada: se ve el motivo).
  const shown = s.openRequest ?? s.requests[0] ?? null;
  const identity = CHAIN_IDENTITY_STATUS[s.chainIdentity.status];
  // El cierre existe desde el embotellado o si el lote se descartó.
  const closureApplies = lot.bottles !== null || lot.stage === "DISCARDED";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid grid-cols-1 gap-6">
        <Card className="grid grid-cols-1 gap-4" role="group" aria-label="Tokenización del lote">
          <CardHeader
            title="Tokenización del lote"
            description="Cada NFT representa una botella. La cuota la autoriza la bodega y la aprueba Drinks on Chain."
            action={
              <Button
                size="sm"
                variant="tertiary"
                iconStart={<RefreshCw aria-hidden size={14} />}
                loading={status.isFetching}
                onClick={() => void refresh()}
              >
                Actualizar
              </Button>
            }
          />
          <p className="m-0" data-testid="limits-summary">
            {limits.summary}
          </p>
          <KeyValueList
            items={[
              {
                term: "Base del límite",
                value: (
                  <span>
                    <Badge tone="neutral" dot={false}>
                      {limits.basis}
                    </Badge>{" "}
                    <span className="text-sm text-fg-muted">{limits.basisText}</span>
                  </span>
                ),
              },
              {
                term: limits.basis === "botellas" ? "Botellas del lote" : "Estimación del lote",
                value: limits.limit != null ? fmtNumber(limits.limit) : "Sin declarar",
              },
              { term: "Cuota autorizada", value: fmtNumber(limits.authorized) },
              ...(limits.pending > 0
                ? [{ term: "Pedidas en la solicitud abierta", value: fmtNumber(limits.pending) }]
                : []),
              { term: "Aún se puede pedir", value: fmtNumber(limits.max) },
              {
                term: "Aprobación",
                value: s.approvalRequired
                  ? "Cada solicitud la revisa Drinks on Chain"
                  : "Se aprueba sola al enviarla (configuración de la plataforma)",
              },
            ]}
          />

          {blockers.length > 0 && (
            <RuleViolationNotice title="Ahora no se puede enviar una solicitud" violations={blockers} />
          )}
          {s.chainIdentity.status !== "ACTIVE" && (
            <Alert tone="info" title={`Cuenta de la bodega en la red: ${identity.label.toLowerCase()}`}>
              Drinks on Chain no puede aprobar ni emitir hasta que la cuenta esté activa.{" "}
              <Link href="/cuenta" className="font-medium text-accent-text hover:underline">
                Ver la cuenta de la bodega
              </Link>
            </Alert>
          )}

          <div className="grid justify-items-start gap-2 border-t border-border pt-4">
            {canManage && s.tokenizable ? (
              // Secundario: la acción principal en oro de la ficha es el siguiente paso del lote (arriba).
              <Button asChild variant="secondary">
                <Link href={`/lotes/${lot.id}/tokenizar`}>{increase ? "Ampliar cuota" : "Autorizar tokenización"}</Link>
              </Button>
            ) : canManage ? (
              <p className="m-0 text-sm text-fg-muted">
                {s.openRequest
                  ? "Hay una solicitud abierta: no se puede enviar otra hasta que se resuelva o la retires."
                  : "El servidor no admite una solicitud nueva para este lote ahora."}
              </p>
            ) : (
              <p className="m-0 text-sm text-fg-muted">
                Solo la dirección de la bodega autoriza la tokenización y amplía la cuota. Aquí puedes consultarla.
              </p>
            )}
          </div>
        </Card>

        {shown ? (
          <RequestPanel key={shown.id} requestId={shown.id} canManage={canManage} />
        ) : (
          <EmptyState
            title="Este lote aún no tiene solicitudes"
            description={
              canManage
                ? "Autoriza cuántas botellas del lote tendrán su NFT. Puedes hacerlo en cualquier momento antes de cerrar el expediente."
                : "Cuando la dirección de la bodega autorice la tokenización, la solicitud aparecerá aquí."
            }
          />
        )}

        {s.requests.length > 1 && (
          <section className="grid grid-cols-1 gap-3" aria-labelledby="lot-requests-title">
            <h2 id="lot-requests-title" className="text-lg font-medium">
              Solicitudes del lote
            </h2>
            <DataTable<TokenizationRequestSummary>
              caption="Solicitudes de tokenización del lote"
              captionHidden
              data={s.requests}
              getRowId={(r) => r.id}
              columns={[
                { id: "kind", header: "Tipo", cell: (r) => REQUEST_KIND[r.kind] },
                { id: "quantity", header: "Cantidad", cell: (r) => requestQuantityText(r) },
                {
                  id: "status",
                  header: "Estado",
                  cell: (r) => <StatusBadge kind="tokenizationRequest" status={r.status} />,
                },
                { id: "date", header: "Enviada", hideBelow: "md", cell: (r) => fmtDateTime(r.submittedAt) },
              ]}
              rowActions={(r) => (
                <Button asChild size="sm" variant="tertiary">
                  <Link
                    href={`/tokenizacion/${r.id}`}
                    aria-label={`Ver la solicitud del ${fmtDateTime(r.submittedAt)}`}
                  >
                    Ver
                  </Link>
                </Button>
              )}
            />
          </section>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {s.collection ? (
          <CollectionPanel collectionId={s.collection.id} showClosure={canClosure && closureApplies} />
        ) : (
          <Card className="grid grid-cols-1 gap-3">
            <CardHeader title="Colección y emisión" />
            <p className="m-0 text-sm text-fg-muted">
              Aún no hay NFT de este lote. Se emiten a nombre de la bodega cuando Drinks on Chain aprueba la solicitud.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
