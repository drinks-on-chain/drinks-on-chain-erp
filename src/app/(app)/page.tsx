"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
  Timeline,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { TASK_ACTION, dashboardView, type DashboardTask } from "@/features/dashboard/trace-dashboard";
import { lockRuleText, lockStatusText } from "@/features/lotes/lot-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useTraceDashboard } from "@/lib/erp/hooks";
import { LOT_STAGE_CODE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { fmtNumber } from "@/lib/format";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

/**
 * Panel de la bodega (`GET /v1/traceability/dashboard`, contrato de la Ola 2 §11.2): cifras,
 * alertas, tareas y candados los calcula el servidor. El operario, que no lee el panel, ve sus
 * accesos directos.
 */
export default function DashboardPage() {
  const me = useMe();
  const canRead = can(me.data, "dashboard.read");
  const dashboard = useTraceDashboard(canRead);
  const d = useMemo(() => (dashboard.data ? dashboardView(dashboard.data) : undefined), [dashboard.data]);
  const firstName = me.data?.user.fullName.replace(/^(Lic\.|Ing\.|Dr\.|Dra\.)\s+/, "").split(" ")[0];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={[{ label: "Panel" }]}
        actions={
          <>
            {d && d.tasks.length > 0 && (
              <Badge tone="info" className="hidden md:inline-flex">
                {d.tasks.length} {d.tasks.length === 1 ? "tarea" : "tareas"} hoy
              </Badge>
            )}
            {can(me.data, "harvest.create") && (
              <Button asChild iconStart={<Plus aria-hidden size={18} />}>
                <Link href="/vendimia/pesaje">Registrar ingreso</Link>
              </Button>
            )}
          </>
        }
      />

      <h1 className="font-display text-3xl">
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      {me.data && !canRead ? (
        <ShortcutsPanel />
      ) : dashboard.isError ? (
        <ErrorState
          description={errorMessage(dashboard.error)}
          onRetry={() => dashboard.refetch()}
          retrying={dashboard.isFetching}
        />
      ) : (
        <>
          <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {!d ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)
            ) : (
              <>
                <StatCard
                  label="Lotes en proceso"
                  value={fmtNumber(d.activeLots)}
                  delta={
                    d.bottledLots > 0
                      ? `${fmtNumber(d.bottledLots)} ${d.bottledLots === 1 ? "embotellado" : "embotellados"}`
                      : "Ninguno embotellado todavía"
                  }
                />
                <StatCard
                  label="Lotes fermentando"
                  value={fmtNumber(d.fermentingLots)}
                  delta={d.fermentingLots > 0 ? "Con lecturas diarias" : "Ningún tanque en fermentación"}
                />
                <StatCard
                  label="Candados por vencer"
                  value={fmtNumber(d.locksDueSoon)}
                  delta={d.locksDueSoon > 0 ? "En los próximos 14 días" : "Ninguno en 14 días"}
                />
                <StatCard
                  label="Alertas"
                  value={fmtNumber(d.alerts.count)}
                  tone={d.alerts.count > 0 ? "warning" : "neutral"}
                  delta={d.alerts.detail ?? "Sin alertas"}
                />
              </>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Tareas pendientes"
                description="Alertas de fermentación, dictámenes, laboratorio y expedientes, según el servidor."
                divided
                className="px-5 pt-5"
              />
              <DataTable<DashboardTask>
                caption="Tareas por hacer en la bodega"
                data={d?.tasks ?? []}
                loading={!d}
                getRowId={(t) => t.id}
                columns={[
                  { id: "task", header: "Tarea", cell: (t) => t.title },
                  { id: "subject", header: "Registro", cell: (t) => t.subject, hideBelow: "md" },
                  {
                    id: "due",
                    header: "Estado",
                    cell: (t) =>
                      t.urgent ? <Badge tone="danger">{t.due}</Badge> : <Badge tone="warning">{t.due}</Badge>,
                  },
                ]}
                rowActions={(t) => (
                  <Button asChild size="sm" variant={t.urgent ? "primary" : "secondary"}>
                    <Link href={t.href}>
                      {TASK_ACTION[t.kind]}
                      <span className="sr-only">: {t.subject}</span>
                    </Link>
                  </Button>
                )}
                empty={<EmptyState bare title="Todo al día" description="No hay tareas pendientes en la bodega." />}
              />
            </Card>

            <div className="grid content-start gap-6">
              <Card className="p-5">
                <CardHeader
                  title="Candados por vencer"
                  description="Crianzas y reposos que se liberan en 14 días o menos."
                  className="mb-4"
                />
                {!d ? (
                  <Skeleton className="h-40" />
                ) : d.locks.length === 0 ? (
                  <EmptyState
                    bare
                    title="Sin candados"
                    description="Ningún candado se libera en los próximos 14 días."
                  />
                ) : (
                  <Timeline
                    items={d.locks.map((l) => ({
                      key: `${l.lotId}-${l.lock.sourceId}`,
                      title: (
                        <Link href={`/lotes/${l.lotId}`} className="hover:underline">
                          {l.name} · {l.reference}
                        </Link>
                      ),
                      time: lockStatusText(l.lock),
                      description: lockRuleText(l.lock),
                      status: l.lock.released ? ("done" as const) : ("current" as const),
                    }))}
                  />
                )}
              </Card>

              <Card className="p-5">
                <CardHeader title="Lotes por etapa" className="mb-4" />
                {!d ? (
                  <Skeleton className="h-32" />
                ) : d.stages.length === 0 ? (
                  <p className="m-0 text-sm text-fg-muted">La bodega aún no tiene lotes.</p>
                ) : (
                  <ul aria-label="Lotes por etapa" className="m-0 grid list-none gap-0 p-0">
                    {d.stages.map((s) => (
                      <li
                        key={s.stage}
                        className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0"
                      >
                        <Badge tone={LOT_STAGE_CODE[s.stage].tone}>{LOT_STAGE_CODE[s.stage].label}</Badge>
                        <span className="font-medium tabular-nums">{fmtNumber(s.count)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Roles sin lectura del panel (operario): lo que sí registran, a un clic. */
function ShortcutsPanel() {
  const me = useMe();
  const shortcuts = [
    can(me.data, "harvest.create") && {
      href: "/vendimia/pesaje",
      title: "Registrar un pesaje",
      detail: "Peso bruto, tara y parcela de la uva que llega.",
    },
    can(me.data, "tank.log") && {
      href: "/vinificacion",
      title: "Registrar la lectura diaria de un tanque",
      detail: "Temperatura, densidad y pH de cada tanque en fermentación.",
    },
    can(me.data, "lot.read") && {
      href: "/lotes",
      title: "Consultar los lotes",
      detail: "Etapa, candados y línea de tiempo de cada lote.",
    },
  ].filter((s): s is { href: string; title: string; detail: string } => Boolean(s));

  return (
    <Card className="grid gap-4 p-5">
      <CardHeader
        title="Tareas pendientes"
        description="El resumen de la bodega lo ven la dirección, enología, agronomía y contabilidad. Estos son tus registros del día."
      />
      <ul aria-label="Accesos directos" className="m-0 grid list-none gap-0 p-0">
        {shortcuts.map((s) => (
          <li key={s.href} className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-b-0">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-medium">{s.title}</span>
              <span className="text-sm text-fg-muted">{s.detail}</span>
            </span>
            <Button asChild size="sm" variant="secondary">
              <Link href={s.href}>
                Ir<span className="sr-only">: {s.title}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
