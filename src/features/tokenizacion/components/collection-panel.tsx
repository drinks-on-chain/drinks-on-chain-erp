"use client";

import { useEffect, useRef } from "react";
import type { Collection, Mint } from "@drinks-on-chain/mocks";
import { Alert, Badge, Card, CardHeader, ChainAddress, ErrorState, KeyValueList, Skeleton } from "@drinks-on-chain/ui";
import { TxBadge } from "@/features/cuenta/components/identity-card";
import { errorMessage } from "@/lib/api/errors";
import { COLLECTION_STATUS, MINT_STATUS, soldCount } from "@/lib/erp/chain";
import { useCollection, useCollectionClosure, useRefreshErp } from "@/lib/erp/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { CLOSURE_OUTCOME, CLOSURE_STATUS, closureSummary } from "../tokenization-model";

const ITEMS_SHOWN = 8;

/** «botellas 1–100» de una emisión confirmada. */
function rangeText(mint: Mint): string | null {
  const first = mint.ranges[0];
  const last = mint.ranges.at(-1);
  if (!first || !last) return null;
  return `botellas ${fmtNumber(first.firstBottleNumber)}–${fmtNumber(last.lastBottleNumber)}`;
}

function Mints({ mints }: { mints: Mint[] }) {
  return (
    <ul aria-label="Emisiones" className="m-0 grid list-none gap-0 p-0">
      {[...mints]
        .sort((a, b) => b.sequence - a.sequence)
        .map((mint) => {
          const range = rangeText(mint);
          return (
            <li
              key={mint.id}
              data-mint={mint.status}
              className="grid gap-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {mint.sequence === 1 ? "Emisión inicial" : `Ampliación ${mint.sequence - 1}`} ·{" "}
                  {fmtNumber(mint.quantity)} NFT
                  {range ? <span className="font-normal text-fg-muted"> · {range}</span> : null}
                </span>
                <Badge tone={MINT_STATUS[mint.status].tone}>{MINT_STATUS[mint.status].label}</Badge>
              </div>
              <ul aria-label={`Transacciones de la emisión ${mint.sequence}`} className="m-0 grid list-none gap-1 p-0">
                {mint.transactions.map((tx) => (
                  <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <TxBadge tx={tx} />
                    <span className="text-fg-muted">{fmtDateTime(tx.confirmedAt ?? tx.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
    </ul>
  );
}

/** Cierre del lote con faltante (§8.4), en solo lectura: lo decide y lo resuelve Drinks on Chain. */
function Closure({ collectionId }: { collectionId: string }) {
  const closure = useCollectionClosure(collectionId);
  if (closure.isPending) return <Skeleton shape="block" className="h-32" />;
  // Sin cierre calculado (409) o sin permiso: no hay nada que mostrar aquí.
  if (closure.isError || !closure.data) return null;
  const c = closure.data;
  const status = CLOSURE_STATUS[c.status];
  return (
    <Card className="grid grid-cols-1 gap-4" role="group" aria-label="Cierre del lote" data-closure={c.status}>
      <CardHeader
        title="Cierre del lote"
        description="Compara los NFT emitidos con las botellas reales. Solo lectura."
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <p className="m-0 text-sm">{closureSummary(c)}</p>
      <KeyValueList
        items={[
          { term: "Botellas con código activo", value: fmtNumber(c.bottles) },
          { term: "NFT emitidos", value: fmtNumber(c.minted) },
          { term: "NFT vendidos", value: fmtNumber(c.sold) },
          { term: "NFT sin vender", value: fmtNumber(c.unsold) },
          ...(c.shortfall > 0
            ? [
                { term: "Faltante", value: `${fmtNumber(c.shortfall)} NFT sin botella` },
                { term: "Sin vender que se queman", value: fmtNumber(c.unsoldToBurn) },
                { term: "Vendidos sin botella", value: fmtNumber(c.soldWithoutBottle) },
              ]
            : []),
          ...(c.decision ? [{ term: "Decisión", value: `${c.decision.reason} · ${fmtDateTime(c.decision.at)}` }] : []),
        ]}
      />
      {c.items.length > 0 && (
        <div className="grid gap-2">
          <h3 className="m-0 text-base font-medium">NFT afectados</h3>
          <ul aria-label="NFT afectados por el faltante" className="m-0 grid list-none gap-1 p-0 text-sm">
            {c.items.slice(0, ITEMS_SHOWN).map((item) => (
              <li key={item.tokenId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium tabular-nums">Botella n.º {fmtNumber(item.bottleNumber)}</span>
                <span className="text-fg-muted">{CLOSURE_OUTCOME[item.outcome]}</span>
                {item.burnTx && <TxBadge tx={item.burnTx} />}
              </li>
            ))}
          </ul>
          {c.items.length > ITEMS_SHOWN && (
            <p className="m-0 text-sm text-fg-muted">y {fmtNumber(c.items.length - ITEMS_SHOWN)} más.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function CollectionCard({ c }: { c: Collection }) {
  // Con la emisión inicial fallida la colección sigue en MINTING: se dice que falló, no que emite.
  const status =
    c.status === "MINTING" && c.mintStatus === "FAILED"
      ? { label: "Emisión fallida", tone: "danger" as const }
      : COLLECTION_STATUS[c.status];
  const minting = c.pendingMintQuantity > 0 || c.mintStatus === "PENDING" || c.mintStatus === "IN_PROGRESS";
  return (
    <Card className="grid grid-cols-1 gap-4" role="group" aria-label="Colección y emisión" data-collection={c.status}>
      <CardHeader
        title="Colección y emisión"
        description={c.name}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      {c.mintStatus === "FAILED" ? (
        <Alert tone="danger" title="La emisión falló en la red">
          No se emitió ningún NFT de esta tanda. Drinks on Chain tiene que reintentarla; la solicitud sigue aprobada y
          no tienes que volver a enviarla.
        </Alert>
      ) : minting ? (
        <Alert tone="info" title="Emisión en curso">
          Drinks on Chain está emitiendo{" "}
          {c.pendingMintQuantity > 0 ? `${fmtNumber(c.pendingMintQuantity)} NFT` : "los NFT"} en la red. Suele tardar
          menos de un minuto; esta pantalla se actualiza sola.
        </Alert>
      ) : null}
      <KeyValueList
        items={[
          { term: "Cuota autorizada", value: `${fmtNumber(c.quota)} botellas` },
          { term: "NFT emitidos", value: fmtNumber(c.counts.minted) },
          { term: "En el inventario de la bodega", value: fmtNumber(c.counts.available) },
          { term: "Vendidos", value: fmtNumber(soldCount(c.counts)) },
          { term: "Quemados", value: fmtNumber(c.counts.burned) },
          {
            term: "Contrato de NFT",
            value: (
              <ChainAddress
                value={c.contract.address}
                label="Contrato de NFT de la bodega"
                explorerUrl={c.contract.explorerUrl}
              />
            ),
          },
          ...(c.publishedAt ? [{ term: "Publicada", value: fmtDateTime(c.publishedAt) }] : []),
          {
            term: "Precio",
            value: c.price ? `Bs ${fmtNumber(c.price.amountMinor / 100, 2)}` : "Por anunciar (lo fija Drinks on Chain)",
          },
        ]}
      />
      <section aria-label="Emisiones de la colección" className="grid gap-3 border-t border-border pt-4">
        <h3 className="m-0 text-base font-medium">Emisiones</h3>
        <Mints mints={c.mints} />
      </section>
    </Card>
  );
}

type Props = {
  collectionId: string;
  /** El cierre con faltante lo leen dirección y contabilidad, y solo existe con el lote embotellado o descartado. */
  showClosure: boolean;
};

/**
 * Colección del lote con sus emisiones (`GET /v1/collections/{id}`, contrato de la Ola 3 §6): cada
 * transacción con su `TxStatusBadge`. Se vuelve a consultar cada 5 s mientras haya alguna en curso;
 * al terminar la emisión se refresca el resto del lote (marca, límites, cuenta).
 */
export function CollectionPanel({ collectionId, showClosure }: Props) {
  const query = useCollection(collectionId);
  const refresh = useRefreshErp();

  const mintStatus = query.data?.mintStatus ?? null;
  const seen = useRef(mintStatus);
  useEffect(() => {
    const before = seen.current;
    seen.current = mintStatus;
    if (before !== null && before !== mintStatus && (mintStatus === "CONFIRMED" || mintStatus === "FAILED")) {
      void refresh();
    }
  }, [mintStatus, refresh]);

  if (query.isError) {
    return (
      <ErrorState description={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  }
  if (!query.data) return <Skeleton shape="block" className="h-80" />;
  return (
    <>
      <CollectionCard c={query.data} />
      {showClosure && <Closure collectionId={collectionId} />}
    </>
  );
}
