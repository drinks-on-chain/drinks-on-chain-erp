"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { PhytosanitaryStatus } from "@drinks-on-chain/mocks";
import { Button, Card, EmptyState, ErrorState, Pill, PillGroup, Select } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { HarvestBatchTable } from "@/features/vendimia/components/harvest-batch-table";
import { canDecidePhyto, countByStatus, filterHarvests, harvestYears } from "@/features/vendimia/phyto";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useHarvestBatches, useTerroirs } from "@/lib/erp/hooks";
import { PHYTO_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtNumber } from "@/lib/format";

const ALL_YEARS = "all";
// Orden de las pills: lo que requiere acción primero.
const STATUS_ORDER: PhytosanitaryStatus[] = ["PENDING_INSPECTION", "QUARANTINE", "APPROVED", "REJECTED"];

// Vendimia y laboratorio: lotes de vendimia (pesajes) con su análisis y dictamen.
export default function HarvestListPage() {
  const me = useMe();
  const harvests = useHarvestBatches();
  const terroirs = useTerroirs();
  const [status, setStatus] = useState<PhytosanitaryStatus | null>(null);
  const [year, setYear] = useState<string>(ALL_YEARS);

  const items = useMemo(() => harvests.data?.items ?? [], [harvests.data]);
  const parcelNames = useMemo(
    () => new Map((terroirs.data?.items ?? []).map((t) => [t.id, t.parcelName])),
    [terroirs.data],
  );
  const counts = useMemo(() => countByStatus(items), [items]);
  const years = useMemo(() => harvestYears(items), [items]);
  const visible = useMemo(
    () => filterHarvests(items, { status, year: year === ALL_YEARS ? null : Number(year) }),
    [items, status, year],
  );
  const canPhyto = can(me.data, "harvest.phyto");

  const newAction = can(me.data, "harvest.create") ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/vendimia/pesaje">Registrar ingreso</Link>
    </Button>
  ) : undefined;
  const filtered = status !== null || year !== ALL_YEARS;
  const totalNet = visible.reduce((sum, h) => sum + h.netWeightKg, 0);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Vendimia y laboratorio" }]} actions={newAction} />

      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Vendimia y laboratorio</h1>
        {harvests.data && (
          <p className="text-sm text-fg-muted">
            {fmtNumber(visible.length)} {visible.length === 1 ? "lote" : "lotes"} · {fmtNumber(totalNet)} kg netos
            {counts.PENDING_INSPECTION > 0 && ` · ${counts.PENDING_INSPECTION} por dictaminar`}
          </p>
        )}
      </header>

      {harvests.isError ? (
        <ErrorState
          description={errorMessage(harvests.error)}
          onRetry={() => harvests.refetch()}
          retrying={harvests.isFetching}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PillGroup label="Filtrar por estado fitosanitario" className="flex flex-wrap gap-2">
              <Pill pressed={status === null} onPressedChange={() => setStatus(null)}>
                Todos
              </Pill>
              {STATUS_ORDER.map((s) => (
                <Pill key={s} pressed={status === s} onPressedChange={(p) => setStatus(p ? s : null)}>
                  {PHYTO_STATUS[s].label}
                  {harvests.data ? ` · ${counts[s]}` : ""}
                </Pill>
              ))}
            </PillGroup>
            <Select
              aria-label="Año de cosecha"
              value={year}
              onValueChange={setYear}
              className="w-48"
              options={[
                { value: ALL_YEARS, label: "Todos los años" },
                ...years.map((y) => ({ value: String(y), label: `Cosecha ${y}` })),
              ]}
            />
          </div>

          <Card padding="none">
            <HarvestBatchTable
              caption="Lotes de vendimia"
              data={visible}
              loading={!harvests.data}
              parcelNames={parcelNames}
              rowActions={(h) =>
                canPhyto && canDecidePhyto(h.phytosanitaryStatus) ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/vendimia/${h.id}`}>Dictaminar</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="tertiary">
                    <Link href={`/vendimia/${h.id}`}>Ver</Link>
                  </Button>
                )
              }
              empty={
                items.length === 0 ? (
                  <EmptyState
                    bare
                    title="Aún no hay ingresos de uva"
                    description="Registra el primer pesaje de la vendimia."
                    action={newAction}
                  />
                ) : (
                  <EmptyState
                    bare
                    title="Ningún lote coincide"
                    description="Cambia el estado o el año de cosecha."
                    action={
                      filtered ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setStatus(null);
                            setYear(ALL_YEARS);
                          }}
                        >
                          Quitar filtros
                        </Button>
                      ) : undefined
                    }
                  />
                )
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}
