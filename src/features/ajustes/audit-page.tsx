"use client";

import { useState } from "react";
import { Building2, Eye, ScrollText } from "lucide-react";
import type { AuditEvent } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  DataTable,
  DateRangePicker,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  KeyValueList,
  Modal,
  Select,
  type ActiveFilter,
  type DateRange,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAudit } from "@/lib/erp/hooks";
import { can, isPlatform, roleLabel } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtDateTime, fmtNumber, shortHash } from "@/lib/format";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_PAGE_SIZE,
  auditActionLabel,
  auditActor,
  auditChanges,
  auditQuery,
  auditSourceLabel,
  emptyAuditFilters,
  type AuditFilters,
} from "./audit-model";

// Bitácora propia de la bodega (contrato de la Ola 1 §7, AUD-04): solo la dirección. Filtros por
// fecha y acción; paginada en el servidor (`limit`/`offset`). Sigue abierta con la bodega suspendida.

const ALL = "ALL";
const ACTION_OPTIONS = [
  { value: ALL, label: "Todas las acciones" },
  ...AUDIT_ACTION_GROUPS.flatMap((g) =>
    Object.entries(g.actions).map(([value, label]) => ({ value, label: `${g.label} · ${label}` })),
  ),
];

function EventDetail({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const actor = auditActor(event);
  const changes = auditChanges(event);
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={auditActionLabel(event.action)}
      description={fmtDateTime(event.occurredAt)}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <KeyValueList
        layout="stacked"
        items={[
          { term: "Acción", value: <code className="text-sm">{event.action}</code> },
          {
            term: "Quién",
            value: `${actor.name}${event.actor.role ? ` · ${roleLabel(event.actor.role)}` : ""}${
              actor.viaPlatform ? " · desde Drinks on Chain" : ""
            }`,
          },
          {
            term: "Desde",
            value: `${auditSourceLabel(event.source.app)}${event.source.ip ? ` · IP ${event.source.ip}` : ""}`,
          },
          { term: "Recurso", value: `${event.resource.type}${event.resource.id ? ` · ${event.resource.id}` : ""}` },
          { term: "Motivo", value: event.reason ?? "—" },
          {
            term: "Cambios",
            value: changes.length ? (
              <ul className="m-0 grid list-none gap-1 p-0 font-mono text-xs break-all">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              "—"
            ),
          },
          {
            term: "Encadenamiento",
            value: (
              <span className="font-mono text-xs" title={event.hash}>
                n.º {fmtNumber(event.seq)} · {shortHash(event.hash, 8, 8)}
              </span>
            ),
          },
        ]}
      />
    </Modal>
  );
}

export function AuditPage() {
  const me = useMe();
  const platform = isPlatform(me.data);
  const owner = can(me.data, "winery.manage");
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AuditEvent | null>(null);
  const audit = useAudit(auditQuery(filters, offset), owner && !platform);
  const crumbs = [{ label: "Ajustes", href: "/ajustes" }, { label: "Bitácora" }];
  const maxDay = today().toISOString().slice(0, 10);

  if (platform || !owner) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={crumbs} />
        <ScreenTitle>Bitácora de la bodega</ScreenTitle>
        <EmptyState
          icon={<Building2 aria-hidden size={32} strokeWidth={1.5} />}
          title={platform ? "Sin bodega activa" : "La bitácora es de la dirección"}
          description={
            platform
              ? "La bitácora de cada bodega se consulta en el Backoffice."
              : "Solo la dirección de la bodega consulta lo que queda registrado en ella."
          }
        />
      </div>
    );
  }

  const apply = (next: AuditFilters) => {
    setFilters(next);
    setOffset(0);
  };

  const active: ActiveFilter[] = [
    ...(filters.from ? [{ id: "from", label: "Desde", value: fmtDate(`${filters.from}T00:00:00Z`) }] : []),
    ...(filters.to ? [{ id: "to", label: "Hasta", value: fmtDate(`${filters.to}T00:00:00Z`) }] : []),
    ...(filters.action ? [{ id: "action", label: "Acción", value: auditActionLabel(filters.action) }] : []),
  ];

  const remove = (id: string) => {
    if (id === "from" || id === "to") {
      const nextRange = { ...range, [id]: null };
      setRange(nextRange);
      apply({ ...filters, [id]: null });
    } else apply({ ...filters, action: "" });
  };

  const data = audit.data;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={crumbs} />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Bitácora de la bodega</h1>
        <p className="text-fg-muted">
          Todo lo que cambió en la bodega y quién lo hizo, también desde Drinks on Chain. Las entradas no se pueden
          editar ni borrar.
        </p>
      </header>

      <FilterBar
        filters={active}
        onRemove={remove}
        onClearAll={() => {
          setRange({ from: null, to: null });
          apply(emptyAuditFilters());
        }}
        resultCount={data ? `${fmtNumber(data.total)} ${data.total === 1 ? "entrada" : "entradas"}` : undefined}
      >
        <DateRangePicker
          label="Fechas"
          value={range}
          max={maxDay}
          onValueChange={(next, error) => {
            setRange(next);
            if (!error) apply({ ...filters, from: next.from, to: next.to });
          }}
        />
        <Field label="Acción" className="w-72 max-w-full">
          <Select
            size="sm"
            options={ACTION_OPTIONS}
            value={filters.action || ALL}
            onValueChange={(v) => apply({ ...filters, action: v === ALL ? "" : v })}
          />
        </Field>
      </FilterBar>

      <DataTable<AuditEvent>
        caption="Entradas de la bitácora"
        captionHidden
        manualSorting
        data={data?.items ?? []}
        loading={audit.isPending}
        error={
          audit.isError
            ? {
                title: "No se pudo cargar la bitácora",
                description: errorMessage(audit.error),
                onRetry: () => void audit.refetch(),
              }
            : undefined
        }
        getRowId={(e) => e.id}
        pagination={
          data && data.total > AUDIT_PAGE_SIZE
            ? { total: data.total, limit: AUDIT_PAGE_SIZE, offset, onOffsetChange: setOffset }
            : undefined
        }
        columns={[
          {
            id: "when",
            header: "Fecha",
            cell: (e) => <span className="whitespace-nowrap tabular-nums">{fmtDateTime(e.occurredAt)}</span>,
          },
          {
            id: "action",
            header: "Acción",
            cell: (e) => (
              <span className="grid">
                <span>{auditActionLabel(e.action)}</span>
                <span className="font-mono text-xs text-fg-subtle">{e.action}</span>
              </span>
            ),
          },
          {
            id: "actor",
            header: "Quién",
            cell: (e) => {
              const actor = auditActor(e);
              return (
                <span className="grid justify-items-start gap-1">
                  <span>{actor.name}</span>
                  {actor.viaPlatform && <Badge tone="info">Drinks on Chain</Badge>}
                </span>
              );
            },
          },
          { id: "source", header: "Desde", hideBelow: "lg", cell: (e) => auditSourceLabel(e.source.app) },
          {
            id: "reason",
            header: "Motivo",
            hideBelow: "md",
            cell: (e) => e.reason ?? <span className="text-fg-subtle">—</span>,
          },
        ]}
        rowActions={(e) => (
          <IconButton
            label={`Ver detalle: ${auditActionLabel(e.action)}, ${fmtDateTime(e.occurredAt)}`}
            variant="ghost"
            size="md"
            onClick={() => setDetail(e)}
          >
            <Eye aria-hidden size={18} />
          </IconButton>
        )}
        empty={
          <EmptyState
            bare
            icon={<ScrollText aria-hidden size={32} strokeWidth={1.5} />}
            title={active.length ? "Sin entradas con estos filtros" : "La bitácora está vacía"}
            description={
              active.length ? "Prueba con otras fechas u otra acción." : "Cada cambio en la bodega quedará aquí."
            }
            action={
              active.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRange({ from: null, to: null });
                    apply(emptyAuditFilters());
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        }
      />

      {detail && <EventDetail event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
