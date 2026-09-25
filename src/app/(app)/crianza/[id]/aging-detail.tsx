"use client";

import Link from "next/link";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KeyValueList, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { agingLock } from "@/features/crianza/aging-model";
import { CountdownLock } from "@/features/crianza/components/countdown-lock";
import { lotLookup, lotName } from "@/features/vinificacion/tank-model";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAging, useHarvestBatches, useTanks, useTerroirs } from "@/lib/erp/hooks";
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

  const a = aging.data;
  const tank = a ? tanks.data?.items.find((t) => t.id === a.fermentationTankId) : undefined;
  const lookup = lotLookup(harvest.data?.items, terroirs.data?.items);
  const name = tank ? lotName(lookup, tank.harvestBatchId) : null;
  const breadcrumbs = [{ label: "Crianza", href: "/crianza" }, { label: a?.containerCode ?? name ?? "Crianza" }];

  if (aging.isError) {
    const notFound = aging.error instanceof ApiError && (aging.error.isNotFound || aging.error.isForbidden);
    return (
      <div className="grid gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
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
      <div className="grid gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton shape="block" className="h-72" />
          <Skeleton shape="block" className="h-72" />
        </div>
      </div>
    );
  }

  const lock = agingLock(a, today());
  const released = a.agingStatus === "AGING" && lock.released;
  const status = released ? AGING_STATUS.READY : AGING_STATUS[a.agingStatus];
  const h = tank ? lookup.harvestById.get(tank.harvestBatchId) : undefined;
  const closed =
    a.agingStatus === "BOTTLED"
      ? "Esta crianza ya se embotelló."
      : a.agingStatus === "DISCARDED"
        ? "Esta crianza se descartó: no puede embotellarse."
        : undefined;

  return (
    <div className="grid gap-6">
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
              { term: "Volumen", value: a.volumeLiters != null ? fmtLiters(a.volumeLiters) : "—" },
              { term: "Meses previstos", value: fmtNumber(a.plannedMonths) },
              { term: "Inicio", value: fmtDate(lock.startDate) },
              { term: "Liberación", value: fmtDate(a.lockUntilDate) },
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

        <CountdownLock
          daysRemaining={lock.daysRemaining}
          progress={lock.progress}
          title="Vino en crianza"
          reason={`Crianza de ${fmtNumber(a.plannedMonths)} ${a.plannedMonths === 1 ? "mes" : "meses"} en ${a.containerType.toLowerCase()}${a.containerMaterial ? ` de ${a.containerMaterial.toLowerCase()}` : ""}.`}
          releaseDate={a.lockUntilDate}
          startDate={lock.startDate}
          startLabel="inicio de la crianza"
          action={{ label: "Pasar a embotellado", href: `/envasado/nuevo?crianza=${a.id}` }}
          hideAction={!can(me.data, "bottling.create")}
          closedNote={closed}
        />
      </div>
    </div>
  );
}
