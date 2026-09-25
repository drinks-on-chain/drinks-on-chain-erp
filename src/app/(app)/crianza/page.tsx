"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Wine } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, Pill, PillGroup } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { buildBarrelRows, type BarrelRowModel } from "@/features/crianza/aging-model";
import { BarrelTable } from "@/features/crianza/components/barrel-table";
import { lotLookup } from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAgings, useHarvestBatches, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";

type Filter = "all" | "locked" | "released" | "closed";
const FILTERS: { id: Filter; label: string; test: (r: BarrelRowModel) => boolean }[] = [
  { id: "all", label: "Todas", test: () => true },
  { id: "locked", label: "En crianza", test: (r) => r.status === "AGING" && !r.lock.released },
  {
    id: "released",
    label: "Liberadas",
    test: (r) => (r.status === "AGING" || r.status === "READY") && r.lock.released,
  },
  {
    id: "closed",
    label: "Embotelladas o descartadas",
    test: (r) => r.status === "BOTTLED" || r.status === "DISCARDED",
  },
];

export default function CrianzaPage() {
  const me = useMe();
  const agings = useAgings();
  const tanks = useTanks();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (!agings.data || !tanks.data || !harvest.data || !terroirs.data) return undefined;
    return buildBarrelRows({
      agings: agings.data.items,
      tanks: tanks.data.items,
      lookup: lotLookup(harvest.data.items, terroirs.data.items),
      today: today(),
    });
  }, [agings.data, tanks.data, harvest.data, terroirs.data]);

  const queries = [agings, tanks, harvest, terroirs];
  const failed = queries.find((q) => q.isError);
  const active = FILTERS.find((f) => f.id === filter)!;
  const visible = rows?.filter(active.test) ?? [];

  const start = can(me.data, "aging.create") ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/crianza/nueva">Iniciar crianza</Link>
    </Button>
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Crianza" }]} actions={start} />
      <div>
        <h1 className="font-display text-3xl">Barricas y crianza</h1>
        <p className="m-0 text-fg-muted">
          Cada crianza queda bloqueada hasta su fecha de liberación; entonces puede pasar a embotellado.
        </p>
      </div>

      {failed ? (
        <ErrorState
          description={errorMessage(failed.error)}
          onRetry={() => queries.forEach((q) => q.refetch())}
          retrying={queries.some((q) => q.isFetching)}
        />
      ) : rows && rows.length === 0 ? (
        <EmptyState
          icon={<Wine aria-hidden size={32} strokeWidth={1.25} />}
          title="Ninguna crianza todavía"
          description="Cuando un tanque con destino crianza termine de fermentar, inicia aquí su crianza."
          action={start}
        />
      ) : (
        <>
          {rows && (
            <PillGroup label="Filtrar crianzas" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Pill key={f.id} pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label} · {rows.filter(f.test).length}
                </Pill>
              ))}
            </PillGroup>
          )}
          <Card>
            <BarrelTable
              rows={visible}
              loading={!rows}
              empty={
                <EmptyState
                  bare
                  title="Ninguna crianza con este filtro"
                  action={
                    <Button variant="secondary" onClick={() => setFilter("all")}>
                      Ver todas
                    </Button>
                  }
                />
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}
