"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import type { ProductionReport } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { ScreenTitle } from "@/components/screen-title";
import { FILTER_STAGES } from "@/features/lotes/lot-model";
import {
  EMPTY_REPORT_FILTERS,
  count,
  hasReportFilters,
  kg,
  liters,
  lossText,
  rangeError,
  ratio,
  reportQuery,
  totalsRows,
  type ReportFilters,
  type TotalsRow,
} from "@/features/reportes/report-model";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import { useMe } from "@/lib/auth/hooks";
import { useProductionReport, useProductionReportCsv } from "@/lib/erp/hooks";
import { LOT_LAB_STATUS, LOT_PRODUCT, LOT_STAGE_CODE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { saveBlob } from "@/lib/download";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";

type Row = ProductionReport["rows"][number];

const CRUMBS = [{ label: "Reportes de producción" }];

const PRODUCT_OPTIONS = [
  { value: "ALL", label: "Todos los tipos" },
  { value: "WINE", label: "Vino" },
  { value: "SINGANI", label: "Singani" },
];
const STAGE_OPTIONS = [
  { value: "ALL", label: "Todas las etapas" },
  ...FILTER_STAGES.map((s) => ({ value: s, label: LOT_STAGE_CODE[s].label })),
];

/** Reportes de producción (`GET /v1/traceability/reports/production`): tabla, totales por tipo y CSV. */
export default function ReportsPage() {
  const me = useMe();
  const allowed = can(me.data, "reports.read");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const debounced = useDebounced(filters);
  const invalid = rangeError(debounced);
  const report = useProductionReport(reportQuery(debounced), allowed && !invalid);
  const csv = useProductionReportCsv();
  const [csvError, setCsvError] = useState<unknown>(null);
  const change = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const totals = report.data ? totalsRows(report.data.totals) : [];

  async function download() {
    setCsvError(null);
    if (rangeError(filters)) return;
    try {
      const file = await csv.mutateAsync(reportQuery(filters));
      saveBlob(file.blob, file.filename ?? "reporte-de-produccion.csv");
      toast({
        title: "CSV descargado",
        description: file.rows != null ? `${fmtNumber(file.rows)} lotes` : undefined,
        tone: "success",
      });
    } catch (err) {
      if (isRuleError(err)) setCsvError(err);
      else toast({ title: "No se pudo descargar el CSV", description: errorMessage(err), tone: "danger" });
    }
  }

  if (me.data && !allowed) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={CRUMBS} />
        <ScreenTitle>Reportes de producción</ScreenTitle>
        <EmptyState
          title="Tu rol no ve los reportes de producción"
          description="Los consultan la dirección, enología y contabilidad de la bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/">Volver al panel</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={CRUMBS}
        actions={
          <Button iconStart={<Download aria-hidden size={18} />} loading={csv.isPending} onClick={download}>
            Descargar CSV
          </Button>
        }
      />
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-3xl">Reportes de producción</h1>
        <p className="text-fg-muted">
          Una fila por lote: kilos, litros, botellas, mermas por etapa y rendimientos. Lo calcula el servidor con los
          registros de cada lote.
        </p>
      </header>

      <Card className="grid gap-4 p-5">
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Embotellado desde" help="Opcional.">
            <Input type="date" value={filters.from} onChange={(e) => change({ from: e.target.value })} />
          </Field>
          <Field label="Embotellado hasta" error={rangeError(filters) ?? undefined} help="Opcional.">
            <Input type="date" value={filters.to} onChange={(e) => change({ to: e.target.value })} />
          </Field>
          <Field label="Tipo de producto">
            <Select
              value={filters.productType}
              onValueChange={(v) => change({ productType: v as ReportFilters["productType"] })}
              options={PRODUCT_OPTIONS}
            />
          </Field>
          <Field label="Etapa del lote">
            <Select
              value={filters.stage}
              onValueChange={(v) => change({ stage: v as ReportFilters["stage"] })}
              options={STAGE_OPTIONS}
            />
          </Field>
        </div>
        {hasReportFilters(filters) && (
          <Button
            variant="tertiary"
            size="sm"
            className="justify-self-start"
            onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
          >
            Quitar filtros
          </Button>
        )}
        <RuleViolationNotice error={csvError} />
      </Card>

      {report.isError ? (
        isRuleError(report.error) ? (
          <RuleViolationNotice error={report.error} />
        ) : (
          <ErrorState
            description={errorMessage(report.error)}
            onRetry={() => report.refetch()}
            retrying={report.isFetching}
          />
        )
      ) : (
        <>
          <section aria-label="Totales por tipo" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {!report.data ? <Skeleton className="h-36" /> : totals.map((t) => <TotalsCard key={t.key} totals={t} />)}
          </section>

          <Card padding="none">
            <CardHeader title="Lotes" divided className="px-5 pt-5" />
            <DataTable<Row>
              caption="Reporte de producción por lote"
              captionHidden
              bleed
              data={report.data?.rows ?? []}
              loading={report.isPending && !invalid}
              getRowId={(r) => r.lotId}
              columns={[
                {
                  id: "lot",
                  header: "Lote",
                  cell: (r) => (
                    <span className="grid gap-0.5">
                      <Link href={`/lotes/${r.lotId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="font-mono text-xs text-fg-muted">{r.lotCode ?? r.reference}</span>
                    </span>
                  ),
                },
                {
                  id: "type",
                  header: "Tipo y etapa",
                  cell: (r) => (
                    <span className="grid justify-items-start gap-1">
                      <span>{r.productType ? LOT_PRODUCT[r.productType] : "Por decidir"}</span>
                      <Badge tone={LOT_STAGE_CODE[r.stage].tone}>{LOT_STAGE_CODE[r.stage].label}</Badge>
                    </span>
                  ),
                },
                { id: "kg", header: "Uva", numeric: true, cell: (r) => kg(r.netKg) },
                { id: "must", header: "Mosto", numeric: true, hideBelow: "lg", cell: (r) => liters(r.mustLiters) },
                {
                  id: "base",
                  header: "Vino base",
                  numeric: true,
                  hideBelow: "lg",
                  cell: (r) => liters(r.baseWineLiters),
                },
                { id: "heart", header: "Corazón", numeric: true, hideBelow: "xl", cell: (r) => liters(r.heartLiters) },
                {
                  id: "bottled",
                  header: "Embotellado",
                  numeric: true,
                  cell: (r) => (
                    <span className="grid gap-0.5">
                      <span>{liters(r.bottledLiters)}</span>
                      {r.bottles !== null && (
                        <span className="text-xs text-fg-muted">
                          {count(r.bottles)} bot.{r.formatCl !== null ? ` de ${fmtNumber(r.formatCl)} cL` : ""}
                        </span>
                      )}
                      {r.bottlingDate && <span className="text-xs text-fg-muted">{fmtDate(r.bottlingDate)}</span>}
                    </span>
                  ),
                },
                {
                  id: "loss",
                  header: "Mermas",
                  hideBelow: "xl",
                  cell: (r) => lossText(r.lossPercentByStage) ?? <span className="text-fg-muted">Sin registrar</span>,
                },
                {
                  id: "yield",
                  header: "Rendimiento",
                  hideBelow: "md",
                  cell: (r) => (
                    <span className="grid gap-0.5 text-sm tabular-nums">
                      <span>{ratio(r.litersPerKg)} L/kg</span>
                      <span className="text-xs text-fg-muted">{ratio(r.bottlesPerTonne, 1)} bot./t</span>
                    </span>
                  ),
                },
                {
                  id: "lab",
                  header: "Laboratorio",
                  hideBelow: "md",
                  cell: (r) => (
                    <Badge tone={LOT_LAB_STATUS[r.labStatus].tone}>{LOT_LAB_STATUS[r.labStatus].label}</Badge>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  bare
                  title={hasReportFilters(filters) ? "Ningún lote coincide" : "Aún no hay lotes"}
                  description={
                    hasReportFilters(filters)
                      ? "Cambia las fechas, el tipo o la etapa."
                      : "El reporte se llena con los lotes de la bodega."
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

function TotalsCard({ totals: t }: { totals: TotalsRow }) {
  return (
    <Card className="grid gap-3 p-5" aria-label={`Totales de ${t.label}`}>
      <div className="flex items-baseline justify-between gap-3">
        <strong className="font-ui text-base">{t.label}</strong>
        <span className="text-sm text-fg-muted">
          {fmtNumber(t.lots)} {t.lots === 1 ? "lote" : "lotes"}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {[
          ["Uva", kg(t.netKg)],
          ["Mosto", liters(t.mustLiters)],
          ["Vino base", liters(t.baseWineLiters)],
          ["Corazón", liters(t.heartLiters)],
          ["Embotellado", liters(t.bottledLiters)],
          ["Botellas", count(t.bottles)],
          ["Litros por kilo", ratio(t.litersPerKg)],
          ["Botellas por tonelada", ratio(t.bottlesPerTonne, 1)],
        ].map(([term, value]) => (
          <div key={term} className="grid gap-0.5">
            <dt className="text-fg-muted">{term}</dt>
            <dd className="m-0 font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
