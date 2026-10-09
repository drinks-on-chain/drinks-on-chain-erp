"use client";

import Link from "next/link";
import { useState } from "react";
import type { TokenizationRequestStatus, TokenizationRequestSummary } from "@drinks-on-chain/mocks";
import { Button, DataTable, EmptyState, ErrorState, Select, StatusBadge } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useTokenizationRequests } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtDateTime } from "@/lib/format";
import { RequestPanel } from "./components/request-panel";
import { REQUEST_KIND, REQUEST_STATUS_FILTERS, requestQuantityText } from "./tokenization-model";

const PAGE_SIZE = 20;
const TITLE = "Solicitudes de tokenización";
const CRUMBS = [{ label: "Tokenización", href: "/tokenizacion" }];

function NoAccess() {
  return (
    <EmptyState
      title="Sin acceso a la tokenización"
      description="Las solicitudes y las colecciones las consultan la dirección de la bodega, enología y contabilidad. El resto ve la marca de cada lote en la lista de lotes."
      action={
        <Button asChild variant="secondary">
          <Link href="/lotes">Ir a los lotes</Link>
        </Button>
      }
    />
  );
}

/**
 * Solicitudes de tokenización de la bodega (`GET /v1/tokenization-requests`, contrato de la Ola 3
 * §5.3): filtra y pagina el servidor. Se autoriza desde la ficha de cada lote.
 */
export function RequestsPage() {
  const me = useMe();
  const allowed = can(me.data, "tokenization.read");
  const [status, setStatus] = useState<TokenizationRequestStatus | "ALL">("ALL");
  const [offset, setOffset] = useState(0);
  const requests = useTokenizationRequests(
    { limit: PAGE_SIZE, offset, ...(status !== "ALL" ? { status } : {}) },
    !!me.data && allowed,
  );

  if (me.data && !allowed) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={[{ label: "Tokenización" }]} />
        <ScreenTitle>{TITLE}</ScreenTitle>
        <NoAccess />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Tokenización" }]} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">{TITLE}</h1>
        <p className="m-0 max-w-3xl text-fg-muted">
          Lo que la bodega pidió tokenizar y en qué quedó cada solicitud. Para autorizar un lote o ampliar su cuota,
          abre su ficha.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Filtrar por estado"
          className="w-56"
          value={status}
          onValueChange={(v) => {
            setStatus(v as TokenizationRequestStatus | "ALL");
            setOffset(0);
          }}
          options={REQUEST_STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
      </div>

      {requests.isError ? (
        <ErrorState
          description={errorMessage(requests.error)}
          onRetry={() => requests.refetch()}
          retrying={requests.isFetching}
        />
      ) : (
        <DataTable<TokenizationRequestSummary>
          caption={TITLE}
          captionHidden
          data={requests.data?.items ?? []}
          loading={requests.isPending}
          getRowId={(r) => r.id}
          manualSorting
          pagination={{ total: requests.data?.total ?? 0, limit: PAGE_SIZE, offset, onOffsetChange: setOffset }}
          columns={[
            {
              id: "lot",
              header: "Lote",
              cell: (r) => (
                <span className="grid gap-0.5">
                  <Link href={`/lotes/${r.lotId}?pestana=tokenizacion`} className="font-medium hover:underline">
                    {r.lot.name}
                  </Link>
                  <span className="font-mono text-xs text-fg-muted">{r.lot.reference}</span>
                </span>
              ),
            },
            { id: "kind", header: "Tipo", hideBelow: "md", cell: (r) => REQUEST_KIND[r.kind] },
            { id: "quantity", header: "Cantidad", cell: (r) => requestQuantityText(r) },
            {
              id: "status",
              header: "Estado",
              cell: (r) => <StatusBadge kind="tokenizationRequest" status={r.status} />,
            },
            { id: "date", header: "Enviada", hideBelow: "lg", cell: (r) => fmtDateTime(r.submittedAt) },
          ]}
          rowActions={(r) => (
            <Button asChild size="sm" variant="tertiary">
              <Link
                href={`/tokenizacion/${r.id}`}
                aria-label={`Ver la solicitud de ${r.lot.name} del ${fmtDateTime(r.submittedAt)}`}
              >
                Ver
              </Link>
            </Button>
          )}
          empty={
            status !== "ALL" ? (
              <EmptyState
                bare
                title="Ninguna solicitud en ese estado"
                description="Prueba con otro estado o mira todas."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStatus("ALL");
                      setOffset(0);
                    }}
                  >
                    Ver todas
                  </Button>
                }
              />
            ) : (
              <EmptyState
                bare
                title="Aún no hay solicitudes de tokenización"
                description="Se autorizan desde la pestaña «Tokenización» de la ficha de cada lote."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/lotes">Ir a los lotes</Link>
                  </Button>
                }
              />
            )
          }
        />
      )}
    </div>
  );
}

/** Una solicitud con su historial completo (`GET /v1/tokenization-requests/{id}`). */
export function RequestPage({ id }: { id: string }) {
  const me = useMe();
  const allowed = can(me.data, "tokenization.read");
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[...CRUMBS, { label: "Solicitud" }]} />
      <h1 className="font-display text-3xl">Solicitud de tokenización</h1>
      {me.data && !allowed ? (
        <NoAccess />
      ) : me.data ? (
        <div className="max-w-4xl">
          <RequestPanel requestId={id} canManage={can(me.data, "tokenization.manage")} showLot />
        </div>
      ) : null}
    </div>
  );
}
