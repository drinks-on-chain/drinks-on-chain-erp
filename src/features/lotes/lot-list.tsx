"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { LotSummary } from "@drinks-on-chain/mocks";
import { Badge, Button, DataTable, EmptyState, Input, Pill, PillGroup, Select } from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useLots } from "@/lib/erp/hooks";
import { LOT_LAB_STATUS, LOT_PRODUCT, LOT_STAGE_CODE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtNumber } from "@/lib/format";
import { LotStageBadge } from "./components/lot-stage-badge";
import {
  EMPTY_LOT_FILTERS,
  FILTER_STAGES,
  hasLotFilters,
  lockBadgeText,
  lotListQuery,
  stageView,
  type LotFilters,
} from "./lot-model";

const PAGE_SIZE = 20;

const PRODUCTS = [
  { value: "ALL", label: "Todos" },
  { value: "WINE", label: "Vino" },
  { value: "SINGANI", label: "Singani" },
] as const;

const STAGE_OPTIONS = [
  { value: "ALL", label: "Todas las etapas" },
  ...FILTER_STAGES.map((s) => ({ value: s, label: LOT_STAGE_CODE[s].label })),
];

/** Texto de búsqueda que se envía al servidor medio segundo después de dejar de escribir. */
function useDebounced(value: string, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Lista de lotes (`GET /v1/lots`): filtra y pagina el servidor; etapa, candado e incidencias los calcula él. */
export function LotList() {
  const me = useMe();
  const [filters, setFilters] = useState<LotFilters>(EMPTY_LOT_FILTERS);
  const [offset, setOffset] = useState(0);
  const q = useDebounced(filters.q);
  const lots = useLots(lotListQuery({ ...filters, q }, { limit: PAGE_SIZE, offset }), !!me.data);
  const filtered = hasLotFilters(filters);

  const change = (patch: Partial<LotFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };

  const create = can(me.data, "lot.write") ? (
    <Button asChild iconStart={<Plus aria-hidden size={18} />}>
      <Link href="/lotes/nuevo">Nuevo lote</Link>
    </Button>
  ) : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={[{ label: "Lotes" }]} actions={create} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Lotes</h1>
        <p className="m-0 text-fg-muted">
          Cada lote agrupa su cadena, de la parcela a la botella: etapa, candados, laboratorio e incidencias.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Filtrar por etapa"
            className="w-56"
            value={filters.stage}
            onValueChange={(v) => change({ stage: v as LotFilters["stage"] })}
            options={STAGE_OPTIONS}
          />
          <PillGroup label="Filtrar por tipo" className="flex gap-2">
            {PRODUCTS.map((p) => (
              <Pill
                key={p.value}
                size="sm"
                pressed={filters.productType === p.value}
                onPressedChange={() => change({ productType: p.value })}
              >
                {p.label}
              </Pill>
            ))}
          </PillGroup>
          <Pill size="sm" pressed={filters.issuesOnly} onPressedChange={(p) => change({ issuesOnly: p })}>
            Con incidencias
          </Pill>
          <Input
            type="search"
            aria-label="Buscar lote"
            placeholder="Nombre, referencia o código de lote"
            prefix={<Search aria-hidden size={16} />}
            value={filters.q}
            onChange={(e) => change({ q: e.target.value })}
            wrapperClassName="w-full sm:ml-auto sm:w-80"
          />
        </div>
      </div>

      <DataTable<LotSummary>
        caption="Lotes de la bodega"
        captionHidden
        data={lots.data?.items ?? []}
        loading={lots.isPending}
        error={lots.isError ? { description: errorMessage(lots.error), onRetry: () => void lots.refetch() } : undefined}
        getRowId={(l) => l.id}
        manualSorting
        pagination={{
          total: lots.data?.total ?? 0,
          limit: PAGE_SIZE,
          offset,
          onOffsetChange: setOffset,
        }}
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
            id: "type",
            header: "Tipo",
            hideBelow: "lg",
            cell: (l) =>
              l.productType ? LOT_PRODUCT[l.productType] : <span className="text-fg-muted">Por decidir</span>,
          },
          {
            id: "stage",
            header: "Etapa",
            cell: (l) => {
              const detail = stageView(l).detail;
              return (
                <span className="grid justify-items-start gap-1">
                  <LotStageBadge lot={l} />
                  {detail && <span className="text-xs text-fg-muted">{detail}</span>}
                </span>
              );
            },
          },
          {
            id: "lock",
            header: "Candado",
            cell: (l) =>
              !l.nextLock ? (
                <span className="text-fg-muted">—</span>
              ) : (
                <Badge tone={l.nextLock.released ? "success" : "warning"}>{lockBadgeText(l.nextLock)}</Badge>
              ),
          },
          {
            id: "bottles",
            header: "Botellas",
            numeric: true,
            hideBelow: "lg",
            cell: (l) =>
              l.bottles != null ? (
                fmtNumber(l.bottles)
              ) : l.projectedBottles != null ? (
                <span className="text-fg-muted" title="Proyección calculada por el servidor">
                  ≈ {fmtNumber(l.projectedBottles)}
                </span>
              ) : l.estimatedBottles != null ? (
                <span className="text-fg-muted" title="Estimación declarada por la bodega">
                  est. {fmtNumber(l.estimatedBottles)}
                </span>
              ) : (
                <span className="text-fg-muted">—</span>
              ),
          },
          {
            id: "lab",
            header: "Laboratorio",
            hideBelow: "xl",
            cell: (l) =>
              l.labStatus === "NOT_RECORDED" ? (
                <span className="text-fg-muted">—</span>
              ) : (
                <Badge tone={LOT_LAB_STATUS[l.labStatus].tone}>{LOT_LAB_STATUS[l.labStatus].label}</Badge>
              ),
          },
          {
            id: "code",
            header: "Código de lote",
            hideBelow: "md",
            cell: (l) =>
              l.lotCode ? (
                <span className="font-mono text-sm whitespace-nowrap">{l.lotCode}</span>
              ) : (
                <span className="text-fg-muted">—</span>
              ),
          },
          {
            id: "issues",
            header: "Incidencias",
            hideBelow: "md",
            cell: (l) =>
              l.complianceIssuesOpen > 0 ? (
                <Badge tone="danger">
                  {l.complianceIssuesOpen} {l.complianceIssuesOpen === 1 ? "abierta" : "abiertas"}
                </Badge>
              ) : (
                <span className="text-fg-muted">—</span>
              ),
          },
        ]}
        rowActions={(l) => (
          <Button asChild size="sm" variant="tertiary">
            <Link href={`/lotes/${l.id}`} aria-label={`Ver ${l.name} (${l.reference})`}>
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
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilters(EMPTY_LOT_FILTERS);
                    setOffset(0);
                  }}
                >
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              bare
              title="Aún no hay lotes"
              description="Crea el lote en origen, o déjalo nacer al registrar un pesaje o al llenar un tanque."
              action={create}
            />
          )
        }
      />
    </div>
  );
}
