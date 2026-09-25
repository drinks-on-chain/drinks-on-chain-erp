"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cylinder, Plus } from "lucide-react";
import type { DestinationType, TankStatus } from "@drinks-on-chain/mocks";
import { Badge, Button, EmptyState, ErrorState, Pill, PillGroup, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { TankGrid } from "@/features/vinificacion/components/tank-grid";
import { buildTankCards, filterTanks, lotLookup, type TankFilter } from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatches, useTankDetails, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { DESTINATION, TANK_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";

const STATUS_FILTERS: TankStatus[] = ["FERMENTING", "FILLING", "COMPLETED", "TRANSFERRED", "CLEANED"];
const DESTINATION_FILTERS: DestinationType[] = ["WINE_AGING", "SINGANI_DIST", "OTHER"];

export default function VinificacionPage() {
  const me = useMe();
  const tanks = useTanks();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const fermentingIds = useMemo(
    () => (tanks.data?.items ?? []).filter((t) => t.status === "FERMENTING").map((t) => t.id),
    [tanks.data],
  );
  const details = useTankDetails(fermentingIds);
  const [filter, setFilter] = useState<TankFilter>({ status: "ALL", destination: "ALL" });

  const cards = useMemo(() => {
    if (!tanks.data || !harvest.data || !terroirs.data) return undefined;
    return buildTankCards({
      tanks: tanks.data.items,
      lookup: lotLookup(harvest.data.items, terroirs.data.items),
      logsByTank: new Map(details.data.map((d) => [d.id, d.logs ?? []])),
      today: today(),
    });
  }, [tanks.data, harvest.data, terroirs.data, details.data]);

  const visible = cards ? filterTanks(cards, filter) : [];
  const count = (f: Partial<TankFilter>) => (cards ? filterTanks(cards, { ...filter, ...f }).length : 0);
  const hot = cards?.filter((c) => c.hot).length ?? 0;
  const canCreate = can(me.data, "tank.create");
  const failed = tanks.isError || harvest.isError || terroirs.isError || details.isError;
  const retry = () => {
    tanks.refetch();
    harvest.refetch();
    terroirs.refetch();
    details.refetch();
  };

  const newTank = canCreate ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/vinificacion/nuevo">Llenar tanque</Link>
    </Button>
  ) : null;

  return (
    <div className="grid gap-6">
      <PageChrome breadcrumbs={[{ label: "Vinificación" }]} actions={newTank} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Mapa de tanques</h1>
          <p className="m-0 text-fg-muted">Nivel, temperatura y destino de cada tanque de la bodega.</p>
        </div>
        {hot > 0 && (
          <Badge tone="warning" size="lg">
            {hot === 1 ? "1 tanque con temperatura alta" : `${hot} tanques con temperatura alta`}
          </Badge>
        )}
      </div>

      {failed ? (
        <ErrorState
          description={errorMessage(tanks.error ?? harvest.error ?? terroirs.error ?? details.error)}
          onRetry={retry}
          retrying={tanks.isFetching}
        />
      ) : !cards ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} shape="block" className="h-56" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Cylinder aria-hidden size={32} strokeWidth={1.25} />}
          title="Aún no hay tanques"
          description="Llena el primer tanque con un lote de vendimia aprobado para empezar la bitácora."
          action={newTank}
        />
      ) : (
        <>
          <div className="grid gap-3">
            <PillGroup label="Filtrar por estado" className="flex flex-wrap gap-2">
              <Pill pressed={filter.status === "ALL"} onClick={() => setFilter((f) => ({ ...f, status: "ALL" }))}>
                Todos · {count({ status: "ALL" })}
              </Pill>
              {STATUS_FILTERS.map((s) => (
                <Pill key={s} pressed={filter.status === s} onClick={() => setFilter((f) => ({ ...f, status: s }))}>
                  {TANK_STATUS[s].label} · {count({ status: s })}
                </Pill>
              ))}
            </PillGroup>
            <PillGroup label="Filtrar por destino" className="flex flex-wrap gap-2">
              <Pill
                size="sm"
                pressed={filter.destination === "ALL"}
                onClick={() => setFilter((f) => ({ ...f, destination: "ALL" }))}
              >
                Cualquier destino
              </Pill>
              {DESTINATION_FILTERS.map((d) => (
                <Pill
                  key={d}
                  size="sm"
                  pressed={filter.destination === d}
                  onClick={() => setFilter((f) => ({ ...f, destination: d }))}
                >
                  {DESTINATION[d]} · {count({ destination: d })}
                </Pill>
              ))}
            </PillGroup>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title="Ningún tanque con estos filtros"
              action={
                <Button variant="secondary" onClick={() => setFilter({ status: "ALL", destination: "ALL" })}>
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <TankGrid tanks={visible} />
          )}
        </>
      )}
    </div>
  );
}
