"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LotSummary } from "@drinks-on-chain/mocks";
import { Badge, Button, DataTable, EmptyState, ErrorState, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { LotStageBadge } from "@/features/lotes/components/lot-stage-badge";
import { lockBadgeText, lockStatusText } from "@/features/lotes/lot-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAging, useLegacyLotId, useLots, useProduction } from "@/lib/erp/hooks";
import { LOT_PRODUCT } from "@/lib/erp/labels";

const CRUMBS = [{ label: "Envasado y QR", href: "/envasado" }, { label: "Nuevo embotellado" }];

export type BottlingPreselect = { lote?: string; crianza?: string; destilacion?: string };

/**
 * Punto de entrada del embotellado. Desde la Ola 2 se embotella el lote entero
 * (`/lotes/{id}/embotellar`): aquí se elige el lote, o se redirige a él cuando el enlace trae el
 * lote, la crianza o la destilación (enlaces antiguos).
 */
export function BottlingStart({ preselect }: { preselect: BottlingPreselect }) {
  if (preselect.crianza) return <FromAging id={preselect.crianza} />;
  if (preselect.destilacion) return <FromProduction id={preselect.destilacion} />;
  if (preselect.lote) return <FromLot id={preselect.lote} />;
  return <LotPicker />;
}

function Redirect({
  lotId,
  pending,
  error,
  onRetry,
}: {
  lotId: string | null | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    if (lotId) router.replace(`/lotes/${lotId}/embotellar`);
  }, [lotId, router]);

  if (error) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={CRUMBS} />
        <ScreenTitle>Nuevo embotellado</ScreenTitle>
        <ErrorState description={errorMessage(error)} onRetry={onRetry} />
      </div>
    );
  }
  if (!pending && !lotId)
    return <LotPicker notice="El registro del enlace no pertenece a ningún lote. Elige el lote." />;
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy="true">
      <PageChrome breadcrumbs={CRUMBS} />
      <ScreenTitle busy>Nuevo embotellado</ScreenTitle>
      <Skeleton shape="block" className="h-64" />
    </div>
  );
}

function FromAging({ id }: { id: string }) {
  const aging = useAging(id);
  return (
    <Redirect
      lotId={aging.data?.lotId}
      pending={aging.isPending}
      error={aging.error}
      onRetry={() => void aging.refetch()}
    />
  );
}

function FromProduction({ id }: { id: string }) {
  const production = useProduction(id);
  return (
    <Redirect
      lotId={production.data?.lotId}
      pending={production.isPending}
      error={production.error}
      onRetry={() => void production.refetch()}
    />
  );
}

/** `?lote=` trae el id del lote; los enlaces antiguos traían el del pesaje (contrato §16.3). */
function FromLot({ id }: { id: string }) {
  const legacy = useLegacyLotId(id, true);
  const router = useRouter();
  const target = legacy.isSuccess ? (legacy.data ?? id) : legacy.isError ? id : null;
  useEffect(() => {
    if (target) router.replace(`/lotes/${target}/embotellar`);
  }, [target, router]);
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy="true">
      <PageChrome breadcrumbs={CRUMBS} />
      <ScreenTitle busy>Nuevo embotellado</ScreenTitle>
      <Skeleton shape="block" className="h-64" />
    </div>
  );
}

/** Lotes en crianza o en reposo: los que el servidor puede dejar embotellar cuando liberan su candado. */
function LotPicker({ notice }: { notice?: string }) {
  const me = useMe();
  const lots = useLots({ stage: ["AGING", "RESTING"], limit: 100, offset: 0 }, !!me.data);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={CRUMBS} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Nuevo embotellado</h1>
        <p className="text-fg-muted">
          Se embotella el lote entero, con todas sus crianzas o corazones. Elige el lote: el servidor comprueba sus
          candados y su balance antes de registrar nada.
        </p>
        {notice && <p className="text-sm text-fg-muted">{notice}</p>}
      </header>

      {lots.isError ? (
        <ErrorState description={errorMessage(lots.error)} onRetry={() => lots.refetch()} retrying={lots.isFetching} />
      ) : (
        <DataTable<LotSummary>
          caption="Lotes en crianza o en reposo"
          captionHidden
          data={lots.data?.items ?? []}
          loading={lots.isPending}
          getRowId={(l) => l.id}
          manualSorting
          columns={[
            {
              id: "lot",
              header: "Lote",
              cell: (l) => (
                <span className="grid gap-0.5">
                  <Link href={`/lotes/${l.id}`} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                  <span className="font-mono text-xs text-fg-muted">{l.reference}</span>
                </span>
              ),
            },
            {
              id: "product",
              header: "Tipo",
              hideBelow: "md",
              cell: (l) => (l.productType ? LOT_PRODUCT[l.productType] : "—"),
            },
            { id: "stage", header: "Etapa", cell: (l) => <LotStageBadge lot={l} /> },
            {
              id: "lock",
              header: "Candado",
              cell: (l) =>
                l.nextLock ? (
                  <span className="grid justify-items-start gap-0.5">
                    <Badge tone={l.nextLock.released ? "success" : "warning"}>{lockBadgeText(l.nextLock)}</Badge>
                    <span className="text-xs text-fg-muted">{lockStatusText(l.nextLock)}</span>
                  </span>
                ) : (
                  <span className="text-fg-muted">Sin candado pendiente</span>
                ),
            },
          ]}
          rowActions={(l) => (
            <Button asChild size="sm" variant={l.nextLock && !l.nextLock.released ? "tertiary" : "secondary"}>
              <Link href={`/lotes/${l.id}/embotellar`}>
                Embotellar<span className="sr-only"> {l.name}</span>
              </Link>
            </Button>
          )}
          empty={
            <EmptyState
              bare
              title="Ningún lote está en crianza ni en reposo"
              description="Un lote se embotella cuando termina su crianza o el reposo de su corazón."
              action={
                <Button asChild variant="secondary">
                  <Link href="/lotes">Ver los lotes</Link>
                </Button>
              }
            />
          }
        />
      )}
    </div>
  );
}
