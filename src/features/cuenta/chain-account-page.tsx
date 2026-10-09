"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import type { ChainAccountLot, ChainTxRef, WineryChainAccountView } from "@drinks-on-chain/mocks";
import { Badge, ChainAddress, DataTable, EmptyState, ErrorState, Skeleton, StatCard } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { ANCHOR_STATUS, COLLECTION_STATUS, fmtXlm, soldCount, txKindLabel } from "@/lib/erp/chain";
import { useChainAccount } from "@/lib/erp/hooks";
import { LOT_STAGE_CODE } from "@/lib/erp/labels";
import { isPlatform } from "@/lib/erp/permissions";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { ChainAccountUnavailable, IdentityCard, TxBadge } from "./components/identity-card";

const TITLE = "Cuenta de la bodega";
const CRUMBS = [{ label: TITLE }];

function LotsTable({ lots }: { lots: ChainAccountLot[] }) {
  return (
    <DataTable<ChainAccountLot>
      caption="NFT por lote"
      captionHidden
      data={lots}
      getRowId={(l) => l.lotId}
      columns={[
        {
          id: "lot",
          header: "Lote",
          cell: (l) => (
            <span className="grid gap-0.5">
              <Link href={`/lotes/${l.lotId}?pestana=tokenizacion`} className="font-medium hover:underline">
                {l.name}
              </Link>
              <span className="font-mono text-xs text-fg-muted">{l.lotCode ?? l.reference}</span>
            </span>
          ),
        },
        {
          id: "stage",
          header: "Etapa",
          hideBelow: "lg",
          cell: (l) => <Badge tone={LOT_STAGE_CODE[l.stage].tone}>{LOT_STAGE_CODE[l.stage].label}</Badge>,
        },
        {
          id: "collection",
          header: "Colección",
          hideBelow: "md",
          cell: (l) => (
            <Badge tone={COLLECTION_STATUS[l.collectionStatus].tone}>
              {COLLECTION_STATUS[l.collectionStatus].label}
            </Badge>
          ),
        },
        { id: "quota", header: "Cuota", numeric: true, hideBelow: "lg", cell: (l) => fmtNumber(l.quota) },
        { id: "minted", header: "Emitidos", numeric: true, cell: (l) => fmtNumber(l.counts.minted) },
        { id: "sold", header: "Vendidos", numeric: true, cell: (l) => fmtNumber(soldCount(l.counts)) },
        { id: "burned", header: "Quemados", numeric: true, cell: (l) => fmtNumber(l.counts.burned) },
      ]}
      empty={
        <EmptyState
          bare
          title="Aún no hay NFT emitidos"
          description="Cuando Drinks on Chain apruebe la tokenización de un lote, sus NFT aparecerán aquí."
          action={
            <Link href="/lotes" className="text-sm font-medium text-accent-text hover:underline">
              Ir a los lotes
            </Link>
          }
        />
      }
    />
  );
}

type AnchoredLot = ChainAccountLot & { anchor: NonNullable<ChainAccountLot["anchor"]> };

function AnchorsTable({ lots }: { lots: ChainAccountLot[] }) {
  const anchored = lots.filter((l): l is AnchoredLot => l.anchor !== null);
  return (
    <DataTable<AnchoredLot>
      caption="Anclajes de expedientes"
      captionHidden
      data={anchored}
      getRowId={(l) => l.lotId}
      columns={[
        {
          id: "lot",
          header: "Lote",
          cell: (l) => (
            <span className="grid gap-0.5">
              <Link href={`/lotes/${l.lotId}?pestana=expediente`} className="font-medium hover:underline">
                {l.name}
              </Link>
              <span className="font-mono text-xs text-fg-muted">{l.lotCode ?? l.reference}</span>
            </span>
          ),
        },
        {
          id: "status",
          header: "Estado",
          cell: (l) => <Badge tone={ANCHOR_STATUS[l.anchor.status].tone}>{ANCHOR_STATUS[l.anchor.status].label}</Badge>,
        },
        {
          id: "date",
          header: "Anclado",
          hideBelow: "md",
          cell: (l) =>
            l.anchor.anchoredAt ? fmtDateTime(l.anchor.anchoredAt) : <span className="text-fg-muted">—</span>,
        },
        {
          id: "hash",
          header: "Huella del expediente",
          hideBelow: "lg",
          cell: (l) => <ChainAddress value={l.anchor.memoHashHex} label={`Huella del expediente de ${l.name}`} />,
        },
        {
          id: "tx",
          header: "Transacción",
          cell: (l) => <TxBadge tx={l.anchor.transaction} />,
        },
      ]}
      empty={
        <EmptyState
          bare
          title="Ningún expediente anclado todavía"
          description="Al cerrar el expediente de un lote con NFT, su huella se publica en la red y aparece aquí."
        />
      }
    />
  );
}

function TransactionsTable({ txs }: { txs: ChainTxRef[] }) {
  return (
    <DataTable<ChainTxRef>
      caption="Últimas transacciones de la bodega"
      captionHidden
      data={txs}
      getRowId={(t) => t.id}
      columns={[
        { id: "kind", header: "Operación", cell: (t) => txKindLabel(t.kind) },
        { id: "status", header: "Estado", cell: (t) => <TxBadge tx={t} /> },
        { id: "date", header: "Fecha", hideBelow: "md", cell: (t) => fmtDateTime(t.confirmedAt ?? t.createdAt) },
        {
          id: "hash",
          header: "Hash",
          hideBelow: "lg",
          cell: (t) =>
            t.txHash ? (
              <ChainAddress value={t.txHash} label={`Transacción: ${txKindLabel(t.kind)}`} />
            ) : (
              <span className="text-fg-muted">Aún sin firmar</span>
            ),
        },
      ]}
      empty={
        <EmptyState
          bare
          title="Sin transacciones todavía"
          description="Las emisiones, los anclajes y las pausas de la bodega aparecerán aquí."
        />
      }
    />
  );
}

function AccountView({ view }: { view: WineryChainAccountView }) {
  const sold = soldCount(view.totals);
  return (
    <>
      <div className="max-w-4xl">
        <IdentityCard identity={view.identity} />
      </div>

      <section aria-label="NFT de la bodega" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="NFT emitidos"
          value={fmtNumber(view.totals.minted)}
          delta={`${fmtNumber(view.totals.available)} en el inventario de la bodega`}
        />
        <StatCard
          label="NFT vendidos"
          value={fmtNumber(sold)}
          delta={sold > 0 ? `${fmtNumber(view.totals.redeemable)} canjeables` : "Ninguno todavía"}
        />
        <StatCard
          label="NFT quemados"
          value={fmtNumber(view.totals.burned)}
          delta="Por canje o por cierre con faltante"
        />
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="chain-lots-title">
        <h2 id="chain-lots-title" className="text-lg font-medium">
          NFT por lote
        </h2>
        <LotsTable lots={view.byLot} />
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="chain-anchors-title">
        <h2 id="chain-anchors-title" className="text-lg font-medium">
          Anclajes de expedientes
        </h2>
        <AnchorsTable lots={view.byLot} />
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="chain-txs-title">
        <h2 id="chain-txs-title" className="text-lg font-medium">
          Últimas transacciones
        </h2>
        <TransactionsTable txs={view.recentTransactions} />
        <p className="m-0 text-sm text-fg-muted">
          Las comisiones de la red las paga Drinks on Chain: {fmtXlm(view.chainCosts.feesChargedXlm)}
          {view.chainCosts.since ? ` desde el ${fmtDate(view.chainCosts.since)}` : ""} por esta bodega.
        </p>
      </section>
    </>
  );
}

/**
 * 1F · Cuenta de la bodega (`GET /v1/organizations/current/chain-account`, contrato de la Ola 3
 * §3.4): identidad en la red, NFT por lote, anclajes y últimas transacciones. Solo lectura: la
 * cuenta la crea y custodia Drinks on Chain; el ERP no guarda claves ni firma nada.
 */
export function ChainAccountPage() {
  const me = useMe();
  const platform = isPlatform(me.data);
  const account = useChainAccount(!!me.data && !platform);

  if (platform) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={CRUMBS} />
        <ScreenTitle>{TITLE}</ScreenTitle>
        <EmptyState
          icon={<Landmark aria-hidden size={32} strokeWidth={1.5} />}
          title="Sin bodega activa"
          description="La cuenta en la red es de cada bodega. Consulta las cuentas desde el Backoffice."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6" aria-busy={account.isPending || undefined}>
      <PageChrome breadcrumbs={CRUMBS} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">{TITLE}</h1>
        <p className="m-0 max-w-3xl text-fg-muted">
          La cuenta de la bodega en la red Stellar y su contrato de NFT los crea y custodia Drinks on Chain. Aquí solo
          se consultan: el ERP no guarda claves ni firma nada.
        </p>
      </header>

      {account.isError ? (
        <ErrorState
          description={errorMessage(account.error)}
          onRetry={() => account.refetch()}
          retrying={account.isFetching}
        />
      ) : account.data === null ? (
        <ChainAccountUnavailable />
      ) : !account.data ? (
        <>
          <Skeleton className="h-64 max-w-4xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </>
      ) : (
        <AccountView view={account.data} />
      )}
    </div>
  );
}
