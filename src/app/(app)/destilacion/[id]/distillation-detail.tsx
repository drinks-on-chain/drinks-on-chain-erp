"use client";

import Link from "next/link";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KeyValueList, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { CountdownLock } from "@/features/crianza/components/countdown-lock";
import { CutsSummary } from "@/features/destilacion/components/cuts-summary";
import {
  SINGANI_REST_DAYS,
  cutsOf,
  restAllowsBottling,
  restProgress,
  restStartOf,
} from "@/features/destilacion/distillation-model";
import { lotLookup, lotName } from "@/features/vinificacion/tank-model";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatches, useProduction, useRestStatus, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { REST_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtLiters, fmtNumber } from "@/lib/format";

const liters = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtLiters(n));

export function DistillationDetail({ id }: { id: string }) {
  const me = useMe();
  const production = useProduction(id);
  const rest = useRestStatus(id);
  const tanks = useTanks();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();

  const p = production.data;
  const tank = p ? tanks.data?.items.find((t) => t.id === p.fermentationTankId) : undefined;
  const lookup = lotLookup(harvest.data?.items, terroirs.data?.items);
  const name = tank ? lotName(lookup, tank.harvestBatchId) : null;
  const breadcrumbs = [
    { label: "Destilación y reposo", href: "/destilacion" },
    { label: name ?? p?.equipmentIdentifier ?? "Destilación" },
  ];

  if (production.isError) {
    const notFound =
      production.error instanceof ApiError && (production.error.isNotFound || production.error.isForbidden);
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        {notFound ? (
          <EmptyState
            title="Destilación no disponible"
            description="No existe, pertenece a otra bodega o tu rol no puede verla."
            action={
              <Button asChild variant="secondary">
                <Link href="/destilacion">Volver a destilación</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(production.error)}
            onRetry={() => production.refetch()}
            retrying={production.isFetching}
          />
        )}
      </div>
    );
  }

  if (!p) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton shape="block" className="h-80" />
          <Skeleton shape="block" className="h-80" />
        </div>
      </div>
    );
  }

  const r = rest.data;
  const statusKey = r?.restStatus === "RESTING" && r.isRestCompleted ? "READY" : (r?.restStatus ?? p.restStatus);
  const status = REST_STATUS[statusKey];
  const h = tank ? lookup.harvestById.get(tank.harvestBatchId) : undefined;
  const closed =
    p.restStatus === "BOTTLED"
      ? "Este singani ya se embotelló."
      : p.restStatus === "DISCARDED"
        ? "Esta destilación se descartó: no puede embotellarse."
        : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={breadcrumbs} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl">{name ?? "Destilación"}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
        {p.isDoEligible && (
          <Badge tone="accent" variant="strong">
            D.O. Singani
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card className="grid gap-4 p-5">
            <CardHeader title="Cortes del alambique" />
            <CutsSummary cuts={cutsOf(p)} inputLiters={p.inputVolumeLiters ?? null} />
          </Card>
          <Card className="grid gap-4 p-5">
            <CardHeader title="Proceso" />
            <KeyValueList
              items={[
                { term: "Alambique", value: p.equipmentIdentifier },
                { term: "Inicio", value: fmtDate(p.processStartDate) },
                { term: "Fin", value: p.processEndDate ? fmtDate(p.processEndDate) : "—" },
                { term: "Entrada", value: liters(p.inputVolumeLiters) },
                { term: "Salida", value: liters(p.outputVolumeLiters) },
                { term: "Merma", value: liters(p.wasteVolumeLiters) },
                {
                  term: "Grado inicial",
                  value: p.initialAlcoholPercentage != null ? `${fmtNumber(p.initialAlcoholPercentage, 1)} % vol` : "—",
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
                ...(p.notes ? [{ term: "Notas", value: p.notes }] : []),
              ]}
            />
          </Card>
        </div>

        {rest.isError ? (
          <ErrorState
            title="No se pudo leer el reposo"
            description={errorMessage(rest.error)}
            onRetry={() => rest.refetch()}
            retrying={rest.isFetching}
          />
        ) : !r ? (
          <Skeleton shape="block" className="h-80" />
        ) : (
          <CountdownLock
            daysRemaining={restAllowsBottling(r) ? 0 : Math.max(1, r.daysRemaining)}
            progress={restProgress(r)}
            title="Lote inmovilizado por normativa"
            reason={`Mínimo ${SINGANI_REST_DAYS} días de reposo para Singani${p.isDoEligible ? " D.O." : ""} (${fmtNumber(Math.max(0, r.daysElapsed))} transcurridos).`}
            releaseDate={r.mandatoryRestUntil ?? p.mandatoryRestUntil ?? null}
            startDate={restStartOf(p)}
            startLabel="inicio del reposo"
            action={{ label: "Pasar a embotellado", href: `/envasado/nuevo?destilacion=${p.id}` }}
            hideAction={!can(me.data, "bottling.create")}
            closedNote={closed}
          />
        )}
      </div>
    </div>
  );
}
