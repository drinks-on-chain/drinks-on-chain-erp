"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { BottlingBatchResponse } from "@drinks-on-chain/mocks";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  Timeline,
  type TimelineItem,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useBottling, useTraceabilityDag } from "@/lib/erp/hooks";
import { PRODUCT_TYPE } from "@/lib/erp/labels";
import { env } from "@/lib/env";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { ExternalLink, HashText, explorerTxUrl } from "@/features/cuenta/stellar";
import { AnchorBadge } from "./anchor-badge";
import { LabCertificateCard } from "./lab-certificate-card";
import { QrExportCard } from "./qr-export-card";
import { marketplaceOrigin } from "./qr-codes";
import { dagSteps } from "./traceability";

const abv = (n: number) => `${fmtNumber(n, Number.isInteger(n) ? 0 : 1)} % vol`;

/** Sello de éxito tras cerrar la producción (6.2 de la maqueta). */
function SealHeader({ b }: { b: BottlingBatchResponse }) {
  const origin = marketplaceOrigin(env.urlApp, b.qrBatchUrl);
  return (
    <section
      aria-label="Producción cerrada"
      className="border-border bg-bg-raised grid justify-items-center gap-2 rounded-lg border px-6 py-8 text-center"
    >
      <span className="border-success text-success grid size-18 place-items-center rounded-full border-2" aria-hidden>
        <Check size={34} strokeWidth={1.75} />
      </span>
      <h1 className="font-display text-3xl">
        {PRODUCT_TYPE[b.productType]} {b.bottlingDate.slice(0, 4)} · sellado
      </h1>
      <p className="text-fg-muted text-sm">
        Lote <span className="font-mono font-medium">{b.internationalLotCode}</span> ·{" "}
        {fmtNumber(b.totalBottlesPackaged)} códigos QR generados · apuntan a{" "}
        <code className="font-mono text-xs">{origin ? `${origin}/b/{código}` : "app./b/{código}"}</code>
      </p>
    </section>
  );
}

function TraceabilityCard({ b }: { b: BottlingBatchResponse }) {
  const dag = useTraceabilityDag(b.id);
  const steps = dag.data ? dagSteps(dag.data) : [];
  const items: TimelineItem[] = steps.map((s) => ({
    key: s.id,
    title: s.href ? (
      <Link href={s.href} className="hover:underline">
        {s.stage} · {s.label}
      </Link>
    ) : (
      `${s.stage} · ${s.label}`
    ),
    time: s.date ? (s.type === "TERROIR" ? `Registrada el ${fmtDate(s.date)}` : fmtDate(s.date)) : undefined,
    status: "done",
  }));
  if (dag.data && !steps.some((s) => s.type === "LAB_ANALYSIS")) {
    items.push({ key: "lab", title: "Certificado de laboratorio", time: "Pendiente", status: "pending" });
  }
  items.push({
    key: "anchor",
    title: "Anclaje en Stellar",
    time: b.isAnchoredOnChain && b.anchoredAt ? fmtDateTime(b.anchoredAt) : "Pendiente de anclaje",
    status: b.isAnchoredOnChain ? "done" : "current",
  });

  return (
    <Card className="grid gap-4">
      <CardHeader title="Trazabilidad del lote" description="De la parcela a la botella." />
      {dag.isPending ? (
        <Skeleton className="h-56" />
      ) : dag.isError ? (
        <ErrorState
          bare
          description={errorMessage(dag.error)}
          onRetry={() => dag.refetch()}
          retrying={dag.isFetching}
        />
      ) : (
        <Timeline items={items} />
      )}
    </Card>
  );
}

export function BottlingDetail({ id, justCreated }: { id: string; justCreated: boolean }) {
  const bottling = useBottling(id);
  const b = bottling.data;
  const crumbs = [{ label: "Envasado y QR", href: "/envasado" }, { label: b?.internationalLotCode ?? "Embotellado" }];

  if (bottling.isError) {
    const notFound = bottling.error instanceof ApiError && bottling.error.isNotFound;
    return (
      <div className="grid gap-6">
        <PageChrome breadcrumbs={crumbs} />
        {notFound ? (
          <EmptyState
            title="Embotellado no encontrado"
            description="No existe o pertenece a otra bodega."
            action={
              <Button asChild variant="secondary">
                <Link href="/envasado">Volver a envasado</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(bottling.error)}
            onRetry={() => bottling.refetch()}
            retrying={bottling.isFetching}
          />
        )}
      </div>
    );
  }

  if (!b) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <PageChrome breadcrumbs={crumbs} />
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const source = b.wineAgingBatchId
    ? { label: "Crianza", href: `/crianza/${b.wineAgingBatchId}` }
    : b.productionBatchId
      ? { label: "Destilación", href: `/destilacion/${b.productionBatchId}` }
      : null;

  return (
    <div className="grid gap-6">
      <PageChrome breadcrumbs={crumbs} />
      {justCreated ? (
        <SealHeader b={b} />
      ) : (
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-medium">{b.internationalLotCode}</h1>
          <AnchorBadge anchored={b.isAnchoredOnChain} />
        </header>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card className="grid gap-4">
            <CardHeader title="Embotellado" />
            <KeyValueList
              items={[
                { term: "Código de lote", value: <span className="font-mono">{b.internationalLotCode}</span> },
                { term: "Producto", value: PRODUCT_TYPE[b.productType] },
                {
                  term: "Origen",
                  value: source ? (
                    <Link href={source.href} className="hover:underline">
                      {source.label}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                { term: "Fecha", value: fmtDate(b.bottlingDate) },
                { term: "Botellas", value: fmtNumber(b.totalBottlesPackaged) },
                { term: "Formato", value: `${fmtNumber(b.packagingFormatCl)} cl` },
                { term: "Grado final", value: abv(b.finalAlcoholAbv) },
                ...(b.waterDilutionLiters != null
                  ? [{ term: "Agua añadida", value: `${fmtNumber(b.waterDilutionLiters)} L` }]
                  : []),
                { term: "Botella", value: b.bottleType ?? "—" },
                {
                  term: "Etiqueta",
                  value: b.labelDesignUrl ? <ExternalLink href={b.labelDesignUrl}>Ver diseño</ExternalLink> : "—",
                },
              ]}
            />
          </Card>

          <Card className="grid gap-4">
            <CardHeader
              title="Identidad en cadena"
              description="La huella de los datos del lote se ancla en Stellar (testnet)."
              action={<AnchorBadge anchored={b.isAnchoredOnChain} />}
            />
            <KeyValueList
              layout="stacked"
              items={[
                {
                  term: "Huella de datos (SHA-256)",
                  value: b.blockchainDataHash ? (
                    <HashText value={b.blockchainDataHash} full label="Copiar huella" />
                  ) : (
                    "—"
                  ),
                },
                {
                  term: "Transacción de anclaje",
                  value: b.blockchainAnchorTxHash ? (
                    <span className="flex flex-wrap items-center gap-x-3">
                      <HashText value={b.blockchainAnchorTxHash} label="Copiar transacción" />
                      <ExternalLink href={explorerTxUrl(b.blockchainAnchorTxHash)}>Ver en stellar.expert</ExternalLink>
                    </span>
                  ) : (
                    <span className="text-fg-muted">Pendiente: el backend la anclará en la próxima tanda.</span>
                  ),
                },
                ...(b.anchoredAt ? [{ term: "Anclado", value: fmtDateTime(b.anchoredAt) }] : []),
              ]}
            />
          </Card>

          <LabCertificateCard bottlingId={b.id} lotCode={b.internationalLotCode} />
        </div>

        <div className="grid gap-6">
          <QrExportCard lotCode={b.internationalLotCode} qrBatchUrl={b.qrBatchUrl} bottles={b.totalBottlesPackaged} />
          <TraceabilityCard b={b} />
        </div>
      </div>
    </div>
  );
}
