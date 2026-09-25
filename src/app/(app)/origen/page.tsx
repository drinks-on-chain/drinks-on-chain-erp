"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button, EmptyState, ErrorState, Input, Pill, PillGroup, Skeleton } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { TerroirCard } from "@/features/origen/components/terroir-card";
import { doEligibility } from "@/features/origen/do-eligibility";
import { filterTerroirs, shortVariety, varietiesOf } from "@/features/origen/filter-terroirs";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useTerroirs } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtNumber } from "@/lib/format";

// 2.1 Directorio de terroirs (01-erp §04): búsqueda, pills por cepa, "Apto D.O." y tarjetas.
export default function TerroirDirectoryPage() {
  const me = useMe();
  const terroirs = useTerroirs();
  const [search, setSearch] = useState("");
  const [variety, setVariety] = useState<string | null>(null);
  const [doOnly, setDoOnly] = useState(false);

  const items = useMemo(() => terroirs.data?.items ?? [], [terroirs.data]);
  const varieties = useMemo(() => varietiesOf(items), [items]);
  const visible = useMemo(() => filterTerroirs(items, { search, variety, doOnly }), [items, search, variety, doOnly]);
  const doCount = useMemo(() => items.filter((t) => doEligibility(t).eligible).length, [items]);
  const canWrite = can(me.data, "terroir.write");
  const filtered = search.trim() !== "" || variety !== null || doOnly;

  const newAction = canWrite ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/origen/nuevo">Nuevo terroir</Link>
    </Button>
  ) : undefined;

  const clearFilters = () => {
    setSearch("");
    setVariety(null);
    setDoOnly(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Origen y terroirs" }]} actions={newAction} />

      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Origen y terroirs</h1>
        {terroirs.data && (
          <p className="text-sm text-fg-muted">
            {fmtNumber(items.length)} {items.length === 1 ? "parcela" : "parcelas"} · {fmtNumber(doCount)}{" "}
            {doCount === 1 ? "apta" : "aptas"} para Singani D.O.
          </p>
        )}
      </header>

      {terroirs.isError ? (
        <ErrorState
          description={errorMessage(terroirs.error)}
          onRetry={() => terroirs.refetch()}
          retrying={terroirs.isFetching}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="search"
              aria-label="Buscar terroir"
              placeholder="Buscar terroir…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<Search aria-hidden size={16} />}
              wrapperClassName="w-full sm:w-72"
            />
            <PillGroup label="Filtrar por cepa" className="flex flex-wrap gap-2">
              <Pill pressed={variety === null} onPressedChange={() => setVariety(null)}>
                Todas
              </Pill>
              {varieties.map((v) => (
                <Pill
                  key={v.name}
                  pressed={variety === v.name}
                  onPressedChange={(p) => setVariety(p ? v.name : null)}
                  title={`${v.name} · ${v.count} ${v.count === 1 ? "parcela" : "parcelas"}`}
                >
                  {shortVariety(v.name)}
                </Pill>
              ))}
            </PillGroup>
            <PillGroup label="Aptitud D.O." className="flex gap-2">
              <Pill pressed={doOnly} onPressedChange={setDoOnly}>
                Apto D.O.
              </Pill>
            </PillGroup>
          </div>

          {!terroirs.data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} shape="block" className="h-72" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Aún no hay terroirs"
              description="Registra la primera parcela de la bodega para empezar la trazabilidad desde el origen."
              action={newAction}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Ningún terroir coincide"
              description="Prueba con otra búsqueda o quita los filtros."
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Quitar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Terroirs">
              {visible.map((t) => (
                <li key={t.id} className="grid">
                  <TerroirCard terroir={t} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
