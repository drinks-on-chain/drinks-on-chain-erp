"use client";

import Link from "next/link";
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
import { useDashboard } from "@/features/dashboard/use-dashboard";
import type { DashboardTask } from "@/features/dashboard/build-dashboard";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { can } from "@/lib/erp/permissions";
import { fmtDate, fmtDaysLeft, fmtNumber } from "@/lib/format";

const TASK_ACTION: Record<DashboardTask["kind"], string> = {
  phyto: "Analizar",
  quarantine: "Revisar",
  temperature: "Registrar",
  "daily-log": "Registrar",
  bifurcate: "Continuar",
  bottle: "Embotellar",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

export default function DashboardPage() {
  const me = useMe();
  const dashboard = useDashboard();
  const d = dashboard.data;
  const firstName = me.data?.fullName.replace(/^(Lic\.|Ing\.|Dr\.|Dra\.)\s+/, "").split(" ")[0];

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

      {dashboard.isError ? (
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
                  label="Lotes activos"
                  value={fmtNumber(d.activeLots)}
                  delta={d.lotsThisWeek > 0 ? `+${d.lotsThisWeek} esta semana` : "Sin ingresos esta semana"}
                  trend={d.lotsThisWeek > 0 ? "up" : "neutral"}
                />
                <StatCard
                  label="Kilos procesados hoy"
                  value={fmtNumber(d.kgToday)}
                  delta={`${d.intakesToday} ${d.intakesToday === 1 ? "ingreso" : "ingresos"}`}
                />
                <StatCard
                  label="Tanques en fermentación"
                  value={d.fermenting}
                  unit={`/ ${d.tanksInUse}`}
                  delta={
                    d.readyToBifurcate > 0 ? `${d.readyToBifurcate} listo para continuar` : "Ninguno por continuar"
                  }
                />
                <StatCard
                  label="Alertas"
                  value={d.alerts.count}
                  tone={d.alerts.count > 0 ? "warning" : "neutral"}
                  delta={d.alerts.detail ?? "Sin alertas"}
                />
              </>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Tareas pendientes" divided className="px-5 pt-5" />
              <DataTable
                data={d?.tasks ?? []}
                loading={!d}
                getRowId={(t) => t.id}
                columns={[
                  { id: "task", header: "Tarea", cell: (t) => t.title },
                  { id: "subject", header: "Lote", cell: (t) => t.subject, hideBelow: "md" },
                  {
                    id: "due",
                    header: "Vence",
                    cell: (t) =>
                      t.urgent ? <Badge tone="danger">{t.due}</Badge> : <Badge tone="warning">{t.due}</Badge>,
                  },
                ]}
                rowActions={(t) => (
                  <Button asChild size="sm" variant={t.urgent ? "primary" : "secondary"}>
                    <Link href={t.href}>{TASK_ACTION[t.kind]}</Link>
                  </Button>
                )}
                empty={<EmptyState bare title="Todo al día" description="No hay tareas pendientes en la bodega." />}
              />
            </Card>

            <Card className="p-5">
              <CardHeader title="Candados activos" className="mb-4" />
              {!d ? (
                <Skeleton className="h-40" />
              ) : d.locks.length === 0 ? (
                <EmptyState bare title="Sin candados" description="Ningún lote está en crianza ni en reposo." />
              ) : (
                <Timeline
                  items={d.locks.map((l) => ({
                    key: l.harvestBatchId,
                    title: (
                      <Link
                        href={`/lotes/${l.harvestBatchId}`}
                        className="hover:underline"
                      >{`${l.title} · ${l.kind}`}</Link>
                    ),
                    time: l.released
                      ? "Liberado · listo para embotellar"
                      : `${fmtDaysLeft(l.daysRemaining)}${l.unlockAt ? ` · ${fmtDate(l.unlockAt)}` : ""}`,
                    status: l.released ? "done" : "current",
                  }))}
                />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
