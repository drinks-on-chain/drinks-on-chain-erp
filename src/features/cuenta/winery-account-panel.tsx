"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import type { BottlingBatchResponse, WineryResponse } from "@drinks-on-chain/mocks";
import { Alert, Badge, Card, DataTable, EmptyState, ErrorState, KeyValueList, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useBottlings, useWinery } from "@/lib/erp/hooks";
import { CERTIFICATION_STATUS, PRODUCT_TYPE } from "@/lib/erp/labels";
import { fmtDate, fmtNumber } from "@/lib/format";
import { AnchorBadge } from "@/features/envasado/anchor-badge";
import { ExternalLink, HashText, explorerAccountUrl, explorerTxUrl } from "./stellar";

const NOT_EXPOSED = "Disponible cuando el backend exponga los activos";

/**
 * WineryAccountPanel (05 §3.3, 09 §3 "Cuenta Stellar"): cuenta institucional de la bodega,
 * de solo lectura. La crea y custodia el backend; el ERP no guarda claves.
 */
export function WineryAccountPanel({ winery }: { winery: WineryResponse & { stellarPublicKey: string } }) {
  const cert = CERTIFICATION_STATUS[winery.certificationStatus];
  return (
    <Card className="grid grid-cols-1 gap-4" aria-label="Cuenta institucional">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-1 gap-1">
          <span className="text-fg-muted text-xs font-medium tracking-label uppercase">
            Cuenta institucional · testnet
          </span>
          <span className="flex flex-wrap items-center gap-x-3">
            <HashText
              value={winery.stellarPublicKey}
              head={4}
              tail={4}
              label="Copiar dirección"
              className="text-base"
            />
            <ExternalLink href={explorerAccountUrl(winery.stellarPublicKey)}>Ver en stellar.expert</ExternalLink>
          </span>
        </div>
        <Badge tone={cert.tone}>{cert.label}</Badge>
      </div>
      <KeyValueList
        items={[
          {
            term: "Dirección completa",
            value: <code className="font-mono text-sm break-all">{winery.stellarPublicKey}</code>,
          },
          {
            term: "Identificador de productor",
            value: winery.onchainProducerId ? (
              <code className="font-mono text-sm">{winery.onchainProducerId}</code>
            ) : (
              "—"
            ),
          },
          {
            term: "Registro en la red",
            value: winery.onchainRegisterTxHash ? (
              <span className="flex flex-wrap items-center gap-x-3">
                <HashText value={winery.onchainRegisterTxHash} label="Copiar transacción" />
                <ExternalLink href={explorerTxUrl(winery.onchainRegisterTxHash)}>Ver transacción</ExternalLink>
              </span>
            ) : (
              "Pendiente"
            ),
          },
          { term: "Certificación", value: cert.label },
          ...(winery.approvedAt ? [{ term: "Aprobada", value: fmtDate(winery.approvedAt) }] : []),
        ]}
      />
    </Card>
  );
}

export function AccountPage() {
  const me = useMe();
  const platform = me.data?.userRole === "PLATFORM_ADMIN";
  const winery = useWinery(!!me.data && !platform);
  const bottlings = useBottlings();
  const crumbs = [{ label: "Cuenta Stellar" }];

  if (platform) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle>Cuenta Stellar</ScreenTitle>
        <EmptyState
          icon={<Wallet aria-hidden size={32} strokeWidth={1.5} />}
          title="Sin bodega activa"
          description="La cuenta Stellar es de cada bodega. Consulta las cuentas desde el Backoffice."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Cuenta Stellar</h1>
        <p className="text-fg-muted max-w-3xl">
          La cuenta la crea y custodia Drinks on Chain al aprobar la bodega. Aquí solo se consulta: dirección, registro
          del productor y anclaje de cada lote embotellado.
        </p>
      </header>

      {winery.isError ? (
        <ErrorState
          description={errorMessage(winery.error)}
          onRetry={() => winery.refetch()}
          retrying={winery.isFetching}
        />
      ) : !winery.data ? (
        <Skeleton className="h-56 max-w-4xl" />
      ) : !winery.data.stellarPublicKey ? (
        <EmptyState
          icon={<Wallet aria-hidden size={32} strokeWidth={1.5} />}
          title="La bodega aún no tiene cuenta en Stellar"
          description="Se crea automáticamente cuando Drinks on Chain aprueba la bodega. Mientras tanto no hay nada que mostrar."
          action={
            <Link href="/ajustes" className="text-accent-text text-sm font-medium hover:underline">
              Ver estado de la bodega
            </Link>
          }
        />
      ) : (
        <>
          <div className="max-w-4xl">
            <WineryAccountPanel winery={{ ...winery.data, stellarPublicKey: winery.data.stellarPublicKey }} />
          </div>

          <section className="grid grid-cols-1 gap-3" aria-labelledby="anchoring-title">
            <h2 id="anchoring-title" className="text-lg font-medium">
              Anclaje de lotes embotellados
            </h2>
            {bottlings.isError ? (
              <ErrorState
                bare
                description={errorMessage(bottlings.error)}
                onRetry={() => bottlings.refetch()}
                retrying={bottlings.isFetching}
              />
            ) : (
              <DataTable<BottlingBatchResponse>
                caption="Anclaje de lotes"
                captionHidden
                data={bottlings.data?.items ?? []}
                loading={bottlings.isPending}
                getRowId={(b) => b.id}
                defaultSort={{ columnId: "date", direction: "desc" }}
                columns={[
                  {
                    id: "lot",
                    header: "Lote",
                    accessor: "internationalLotCode",
                    sortable: true,
                    cell: (b) => (
                      <Link href={`/envasado/${b.id}`} className="font-mono text-sm whitespace-nowrap hover:underline">
                        {b.internationalLotCode}
                      </Link>
                    ),
                  },
                  { id: "product", header: "Producto", cell: (b) => PRODUCT_TYPE[b.productType], hideBelow: "md" },
                  {
                    id: "date",
                    header: "Embotellado",
                    accessor: "bottlingDate",
                    sortable: true,
                    cell: (b) => fmtDate(b.bottlingDate),
                  },
                  { id: "state", header: "Estado", cell: (b) => <AnchorBadge anchored={b.isAnchoredOnChain} /> },
                  {
                    id: "hash",
                    header: "Huella",
                    hideBelow: "lg",
                    cell: (b) =>
                      b.blockchainDataHash ? <HashText value={b.blockchainDataHash} label="Copiar huella" /> : "—",
                  },
                  {
                    id: "tx",
                    header: "Transacción",
                    cell: (b) =>
                      b.blockchainAnchorTxHash ? (
                        <ExternalLink href={explorerTxUrl(b.blockchainAnchorTxHash)} className="font-mono">
                          {`${b.blockchainAnchorTxHash.slice(0, 4)}…${b.blockchainAnchorTxHash.slice(-2)}`}
                        </ExternalLink>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      ),
                  },
                ]}
                empty={
                  <EmptyState
                    bare
                    title="Aún no hay lotes embotellados"
                    description="Cada embotellado deja aquí su huella y su transacción de anclaje."
                    action={
                      <Link href="/envasado" className="text-accent-text text-sm font-medium hover:underline">
                        Ir a envasado
                      </Link>
                    }
                  />
                }
              />
            )}
          </section>

          <section className="grid grid-cols-1 gap-3" aria-labelledby="assets-title">
            <h2 id="assets-title" className="text-lg font-medium">
              Activos por lote
            </h2>
            <Alert tone="info" title={NOT_EXPOSED}>
              El backend aún no expone los tokens de cada lote (emitidas, en circulación y quemadas). Estas cifras
              aparecerán aquí cuando exista el endpoint; no se estiman en el ERP.
            </Alert>
            <DataTable<BottlingBatchResponse>
              caption="Activos por lote"
              captionHidden
              data={bottlings.data?.items ?? []}
              loading={bottlings.isPending}
              getRowId={(b) => b.id}
              columns={[
                {
                  id: "lot",
                  header: "Lote",
                  cell: (b) => <span className="font-mono text-sm">{b.internationalLotCode}</span>,
                },
                { id: "bottles", header: "Botellas", numeric: true, cell: (b) => fmtNumber(b.totalBottlesPackaged) },
                ...(["Emitidas", "En circulación", "Quemadas"] as const).map((h) => ({
                  id: h,
                  header: h,
                  numeric: true,
                  cell: () => (
                    <span className="text-fg-subtle" title={NOT_EXPOSED}>
                      No disponible
                    </span>
                  ),
                })),
              ]}
              empty={<EmptyState bare title="Sin lotes" description="No hay embotellados todavía." />}
            />
          </section>
        </>
      )}
    </div>
  );
}
