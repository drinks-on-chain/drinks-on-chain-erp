"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValueList,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ReasonAction } from "@/components/reason-action";
import { ScreenTitle } from "@/components/screen-title";
import { agingLock } from "@/features/crianza/aging-model";
import { CountdownLock } from "@/features/crianza/components/countdown-lock";
import { lockRuleText } from "@/features/lotes/lot-model";
import { lotLookup, lotName } from "@/features/vinificacion/tank-model";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAging, useDiscardAging, useHarvestBatches, useLot, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { AGING_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtLiters, fmtNumber } from "@/lib/format";

export function AgingDetail({ id }: { id: string }) {
  const me = useMe();
  const aging = useAging(id);
  const tanks = useTanks();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const discard = useDiscardAging();
  const lot = useLot(aging.data?.lotId ?? "", !!aging.data?.lotId);

  const a = aging.data;
  const tank = a ? tanks.data?.items.find((t) => t.id === a.fermentationTankId) : undefined;
  const lookup = lotLookup(harvest.data?.items, terroirs.data?.items);
  const name = tank ? lotName(lookup, tank.harvestBatchId) : null;
  const breadcrumbs = [{ label: "Crianza", href: "/crianza" }, { label: a?.containerCode ?? name ?? "Crianza" }];

  if (aging.isError) {
    const notFound = aging.error instanceof ApiError && (aging.error.isNotFound || aging.error.isForbidden);
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <ScreenTitle>Crianza</ScreenTitle>
        {notFound ? (
          <EmptyState
            title="Crianza no disponible"
            description="No existe, pertenece a otra bodega o tu rol no puede verla."
            action={
              <Button asChild variant="secondary">
                <Link href="/crianza">Volver a crianza</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(aging.error)}
            onRetry={() => aging.refetch()}
            retrying={aging.isFetching}
          />
        )}
      </div>
    );
  }

  if (!a) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <ScreenTitle busy>Crianza</ScreenTitle>
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton shape="block" className="h-72" />
          <Skeleton shape="block" className="h-72" />
        </div>
      </div>
    );
  }

  // Días que faltan y liberación: los del servidor (`lock`), con la instantánea del lote y su reloj.
  const lock = agingLock(a, today());
  const released = a.agingStatus === "AGING" && lock.released;
  const open = a.agingStatus === "AGING" || a.agingStatus === "READY";
  const canDiscard = open && can(me.data, "aging.create");
  const status = released ? AGING_STATUS.READY : AGING_STATUS[a.agingStatus];
  const h = tank ? lookup.harvestById.get(tank.harvestBatchId) : undefined;
  const closed =
    a.agingStatus === "BOTTLED"
      ? "Esta crianza ya se embotelló."
      : a.agingStatus === "DISCARDED"
        ? "Esta crianza se descartó: no puede embotellarse."
        : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={breadcrumbs} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl">{name ?? "Crianza"}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="grid content-start gap-4 p-5">
          <CardHeader title="Barrica y vino" />
          <KeyValueList
            items={[
              { term: "Recipiente", value: a.containerType },
              { term: "Madera o material", value: a.containerMaterial ?? "—" },
              { term: "Código", value: a.containerCode ?? "—" },
              { term: "Ciclo de uso", value: a.barrelUseCycle ? `Uso ${fmtNumber(a.barrelUseCycle)}` : "—" },
              ...(a.containerCount ? [{ term: "Recipientes", value: fmtNumber(a.containerCount) }] : []),
              { term: "Volumen", value: a.volumeLiters != null ? fmtLiters(a.volumeLiters) : "—" },
              ...(a.availableLiters != null && open
                ? [{ term: "Disponible para embotellar", value: fmtLiters(a.availableLiters) }]
                : []),
              { term: "Meses previstos", value: fmtNumber(a.plannedMonths) },
              { term: "Inicio", value: fmtDate(lock.startDate) },
              { term: "Liberación", value: fmtDate(lock.unlockAt) },
              {
                term: "Lote",
                value: a.lotId ? (
                  <Link className="text-accent-text hover:underline" href={`/lotes/${a.lotId}`}>
                    {lot.data ? `${lot.data.name} · ${lot.data.reference}` : "Ver lote"}
                  </Link>
                ) : (
                  "—"
                ),
              },
              {
                term: "Tanque de origen",
                value: tank ? (
                  <Link className="text-accent-text hover:underline" href={`/vinificacion/${tank.id}`}>
                    {tank.tankCode}
                  </Link>
                ) : (
                  "—"
                ),
              },
              {
                term: "Lote de vendimia",
                value: h ? (
                  <Link className="text-accent-text hover:underline" href={`/vendimia/${h.id}`}>
                    {h.harvestBatchCode}
                  </Link>
                ) : (
                  "—"
                ),
              },
              ...(a.notes ? [{ term: "Notas", value: a.notes }] : []),
            ]}
          />
        </Card>

        <div className="grid content-start gap-4">
          <CountdownLock
            daysRemaining={lock.daysRemaining}
            progress={lock.progress}
            title="Vino en crianza"
            reason={
              a.lock
                ? `${lockRuleText(a.lock)}.`
                : `Crianza de ${fmtNumber(a.plannedMonths)} ${a.plannedMonths === 1 ? "mes" : "meses"} en ${a.containerType.toLowerCase()}.`
            }
            releaseDate={lock.unlockAt}
            startDate={lock.startDate}
            startLabel="inicio de la crianza"
            action={{
              label: "Pasar a embotellado",
              href: a.lotId ? `/lotes/${a.lotId}/embotellar` : `/envasado/nuevo?crianza=${a.id}`,
            }}
            hideAction={!can(me.data, "bottling.create")}
            closedNote={closed}
          />
          {canDiscard && (
            <ReasonAction
              label="Descartar crianza"
              title={`¿Descartar la crianza ${a.containerCode ?? a.containerType}?`}
              description="El vino de esta crianza deja de contar para el embotellado del lote. No se puede deshacer; el motivo queda en la línea de tiempo."
              confirmLabel="Sí, descartar"
              destructive
              variant="tertiary"
              onConfirm={async (reason) => {
                await discard.mutateAsync({ id: a.id, body: { reason } });
                toast({ title: "Crianza descartada", tone: "success" });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
