"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { LOT_STAGES, type LotStage, type LotView } from "@drinks-on-chain/mocks";
import { Badge, Button, DataTable, EmptyState, ErrorState, Input, Pill, PillGroup } from "@drinks-on-chain/ui";
import { LotStatusBadge } from "@/components/lot-status-badge";
import { PageChrome } from "@/components/page-chrome";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useLotViews } from "@/lib/erp/hooks";
import { LOT_KIND, LOT_STAGE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { filterLots, lockLabel, lotLock, type LotFilters } from "./lots";

const KINDS = [
  { value: "todos", label: "Todos" },
  { value: "vino", label: "Vino" },
  { value: "singani", label: "Singani" },
] as const;

export function LotList() {
  const me = useMe();
  const lots = useLotViews();
  const [filters, setFilters] = useState<LotFilters>({ stage: "todas", kind: "todos", q: "" });
  const now = today();
  const all = useMemo(() => lots.data ?? [], [lots.data]);
  const rows = useMemo(() => filterLots(all, filters), [all, filters]);
  const counts = useMemo(() => {
    const c = new Map<LotStage, number>();
    for (const l of all) c.set(l.stage, (c.get(l.stage) ?? 0) + 1);
    return c;
  }, [all]);
  const filtered = filters.stage !== "todas" || filters.kind !== "todos" || filters.q !== "";

  const register = can(me.data, "harvest.create") ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/vendimia/pesaje">Registrar ingreso</Link>
    </Button>
  ) : undefined;

  return (
    <div className="grid gap-6">
      <PageChrome breadcrumbs={[{ label: "Lotes" }]} actions={register} />
      <header className="grid gap-1">
        <h1 className="font-display text-3xl">Lotes</h1>
        <p className="text-fg-muted">
          Cada ingreso de uva, de la parcela a la botella: etapa actual, candados y código del lote embotellado.
        </p>
      </header>

      {lots.isError ? (
        <ErrorState description={errorMessage(lots.error)} onRetry={() => lots.refetch()} retrying={lots.isFetching} />
      ) : (
        <>
          <div className="grid gap-3">
            <PillGroup label="Filtrar por etapa" className="flex flex-wrap gap-2">
              <Pill
                pressed={filters.stage === "todas"}
                onPressedChange={() => setFilters((f) => ({ ...f, stage: "todas" }))}
              >
                Todas · {all.length}
              </Pill>
              {LOT_STAGES.filter((s) => counts.has(s)).map((s) => (
                <Pill
                  key={s}
                  pressed={filters.stage === s}
                  onPressedChange={(p) => setFilters((f) => ({ ...f, stage: p ? s : "todas" }))}
                >
                  {LOT_STAGE[s].label} · {counts.get(s)}
                </Pill>
              ))}
            </PillGroup>
            <div className="flex flex-wrap items-center gap-3">
              <PillGroup label="Filtrar por tipo" className="flex gap-2">
                {KINDS.map((k) => (
                  <Pill
                    key={k.value}
                    size="sm"
                    pressed={filters.kind === k.value}
                    onPressedChange={() => setFilters((f) => ({ ...f, kind: k.value }))}
                  >
                    {k.label}
                  </Pill>
                ))}
              </PillGroup>
              <Input
                type="search"
                aria-label="Buscar lote"
                placeholder="Código, parcela o cepa"
                prefix={<Search aria-hidden size={16} />}
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                wrapperClassName="w-full sm:ml-auto sm:w-80"
              />
            </div>
          </div>

          <DataTable<LotView>
            caption="Lotes de la bodega"
            captionHidden
            data={rows}
            loading={lots.isPending}
            getRowId={(l) => l.harvestBatchId}
            columns={[
              {
                id: "code",
                header: "Lote de vendimia",
                accessor: "harvestBatchCode",
                sortable: true,
                cell: (l) => (
                  <Link href={`/lotes/${l.harvestBatchId}`} className="font-medium whitespace-nowrap hover:underline">
                    {l.harvestBatchCode}
                  </Link>
                ),
              },
              {
                id: "terroir",
                header: "Parcela · cepa",
                hideBelow: "md",
                accessor: (l) => l.terroir.parcelName,
                sortable: true,
                cell: (l) => (
                  <span>
                    {l.terroir.parcelName}
                    <span className="text-fg-muted"> · {l.terroir.varietyName}</span>
                  </span>
                ),
              },
              {
                id: "kind",
                header: "Tipo",
                hideBelow: "lg",
                cell: (l) => (l.kind ? LOT_KIND[l.kind] : <span className="text-fg-subtle">Por decidir</span>),
              },
              {
                id: "stage",
                header: "Etapa",
                accessor: (l) => LOT_STAGES.indexOf(l.stage),
                sortable: true,
                cell: (l) => <LotStatusBadge stage={l.stage} />,
              },
              {
                id: "lock",
                header: "Candado",
                accessor: (l) => lotLock(l, now)?.days ?? -1,
                sortable: true,
                cell: (l) => {
                  const lock = lotLock(l, now);
                  if (!lock) return <span className="text-fg-subtle">—</span>;
                  return lock.released ? (
                    <Badge tone="success">Liberado</Badge>
                  ) : (
                    <Badge tone="warning">{lockLabel(lock)}</Badge>
                  );
                },
              },
              {
                id: "lot",
                header: "Código de lote",
                hideBelow: "md",
                cell: (l) =>
                  l.internationalLotCode && l.bottlingBatchId ? (
                    <Link
                      href={`/envasado/${l.bottlingBatchId}`}
                      className="font-mono text-sm whitespace-nowrap hover:underline"
                    >
                      {l.internationalLotCode}
                    </Link>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  ),
              },
            ]}
            rowActions={(l) => (
              <Button asChild size="sm" variant="tertiary">
                <Link href={`/lotes/${l.harvestBatchId}`} aria-label={`Ver ${l.harvestBatchCode}`}>
                  Ver
                </Link>
              </Button>
            )}
            empty={
              filtered ? (
                <EmptyState
                  bare
                  title="Ningún lote coincide"
                  description="Prueba con otra etapa, otro tipo o borra la búsqueda."
                  action={
                    <Button variant="secondary" onClick={() => setFilters({ stage: "todas", kind: "todos", q: "" })}>
                      Quitar filtros
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  bare
                  title="Aún no hay lotes"
                  description="Cada ingreso de uva en la báscula abre un lote nuevo."
                  action={register}
                />
              )
            }
          />
        </>
      )}
    </div>
  );
}
