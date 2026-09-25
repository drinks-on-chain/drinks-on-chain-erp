"use client";

import Link from "next/link";
import { Lock, Unlock } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Countdown,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  Tag,
} from "@drinks-on-chain/ui";
import { LotStatusBadge } from "@/components/lot-status-badge";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useLotViews } from "@/lib/erp/hooks";
import { LOT_KIND, PHYTO_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { env } from "@/lib/env";
import { fmtDate, fmtDaysLeft, fmtKg, fmtNumber } from "@/lib/format";
import { ExternalLink } from "@/features/cuenta/stellar";
import { marketplaceOrigin, passportUrl } from "@/features/envasado/qr-codes";
import { bottlingSources } from "@/features/envasado/sources";
import { LotTimeline } from "./lot-timeline";
import { lotLock, lotTimeline } from "./lots";

export function LotDetail({ id }: { id: string }) {
  const me = useMe();
  const lots = useLotViews();
  const lot = lots.data?.find((l) => l.harvestBatchId === id);
  const crumbs = [{ label: "Lotes", href: "/lotes" }, { label: lot?.harvestBatchCode ?? "Lote" }];
  const now = today();

  if (lots.isError) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle>Lote</ScreenTitle>
        <ErrorState description={errorMessage(lots.error)} onRetry={() => lots.refetch()} retrying={lots.isFetching} />
      </div>
    );
  }
  if (lots.isPending || !lots.chain) {
    return (
      <div className="grid grid-cols-1 gap-6" aria-busy="true">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle busy>Lote</ScreenTitle>
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (!lot) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle>Lote</ScreenTitle>
        <EmptyState
          title="Lote no encontrado"
          description="No existe o pertenece a otra bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/lotes">Volver a lotes</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const steps = lotTimeline(lot.harvestBatchId, lots.chain, now) ?? [];
  const lock = lotLock(lot, now);
  const bottling = lot.bottlingBatchId ? lots.chain.bottlings.find((b) => b.id === lot.bottlingBatchId) : undefined;
  const origin = bottling ? marketplaceOrigin(env.urlApp, bottling.qrBatchUrl) : null;
  const passport = bottling && origin ? passportUrl(origin, bottling.internationalLotCode) : null;
  // Una fuente del lote liberada y sin embotellar (un tanque puede tener varias destilaciones).
  const ready = bottlingSources(lots.chain, now).find(
    (s) => s.harvest?.id === lot.harvestBatchId && !s.bottled && !s.locked,
  );
  const canBottle = !!ready && can(me.data, "bottling.create");

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={crumbs}
        actions={
          canBottle ? (
            <Button asChild>
              <Link href={`/envasado/nuevo?lote=${lot.harvestBatchId}`}>Embotellar</Link>
            </Button>
          ) : undefined
        }
      />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl">{lot.harvestBatchCode}</h1>
        <LotStatusBadge stage={lot.stage} />
        {lot.kind && <Tag>{LOT_KIND[lot.kind]}</Tag>}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="grid grid-cols-1 gap-4">
          <CardHeader title="Recorrido del lote" description="De la parcela a la botella." />
          <LotTimeline steps={steps} />
        </Card>

        <div className="grid grid-cols-1 gap-6">
          {lock && !lock.released ? (
            <Card className="border-warning grid gap-2" aria-label="Candado del lote">
              <span className="text-warning inline-flex items-center gap-2 text-sm font-medium">
                <Lock aria-hidden size={16} />
                {lock.kind === "crianza" ? "Candado de crianza" : "Reposo obligatorio de 180 días"}
              </span>
              {lock.unlockAt ? (
                <Countdown target={lock.unlockAt} now={now} format="days" variant="display" tone="warning" />
              ) : (
                <p className="font-display text-5xl">{fmtNumber(lock.days)}</p>
              )}
              <p className="text-fg-muted text-sm">
                {fmtDaysLeft(lock.days)}
                {lock.unlockAt ? ` · se libera el ${fmtDate(lock.unlockAt)}` : ""}. El embotellado se habilita cuando
                llegue a cero.
              </p>
            </Card>
          ) : ready ? (
            <Alert tone="success" icon={<Unlock aria-hidden size={18} />} title="Listo para embotellar">
              {ready.kind === "crianza" ? "La crianza" : "La destilación"} {ready.container} tiene el candado liberado.
            </Alert>
          ) : null}

          <Card className="grid grid-cols-1 gap-4">
            <CardHeader title="Datos del lote" />
            <KeyValueList
              items={[
                { term: "Parcela", value: lot.terroir.parcelName || "—" },
                { term: "Cepa", value: lot.terroir.varietyName || "—" },
                { term: "Altitud", value: lot.terroir.altitudeMasl ? `${fmtNumber(lot.terroir.altitudeMasl)} m` : "—" },
                { term: "Uva neta", value: fmtKg(lot.netWeightKg) },
                { term: "Fitosanitario", value: PHYTO_STATUS[lot.phytosanitaryStatus].label },
                { term: "Tipo", value: lot.kind ? LOT_KIND[lot.kind] : "Por decidir" },
                {
                  term: "Código de lote",
                  value:
                    bottling && lot.bottlingBatchId ? (
                      <Link href={`/envasado/${lot.bottlingBatchId}`} className="font-mono hover:underline">
                        {bottling.internationalLotCode}
                      </Link>
                    ) : (
                      "Se asigna al embotellar"
                    ),
                },
              ]}
            />
            {passport && <ExternalLink href={passport}>Pasaporte público del lote</ExternalLink>}
          </Card>
        </div>
      </div>
    </div>
  );
}
