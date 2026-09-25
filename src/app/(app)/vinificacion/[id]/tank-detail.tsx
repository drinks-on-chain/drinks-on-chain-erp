"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, NotebookPen } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  KeyValueList,
  Progress,
  Skeleton,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ScreenTitle } from "@/components/screen-title";
import { LogForm } from "@/features/vinificacion/components/log-form";
import { TreatmentForm } from "@/features/vinificacion/components/treatment-form";
import { TrendSparkline } from "@/features/vinificacion/components/trend-sparkline";
import {
  TEMP_ALERT_C,
  fermentationDay,
  fillPercent,
  isHot,
  lotLookup,
  nextStep,
  sortLogsDesc,
  terroirOfHarvest,
} from "@/features/vinificacion/tank-model";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAgings, useHarvestBatches, useProductions, useTank, useTerroirs } from "@/lib/erp/hooks";
import { DESTINATION, TANK_STATUS, TREATMENT_TYPE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtDateTime, fmtLiters, fmtNumber } from "@/lib/format";

const orDash = (n: number | null | undefined, digits = 0, suffix = "") =>
  n === null || n === undefined ? "—" : `${fmtNumber(n, digits)}${suffix}`;

export function TankDetail({ id }: { id: string }) {
  const me = useMe();
  const tank = useTank(id);
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const agings = useAgings();
  const productions = useProductions();
  const [logOpen, setLogOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);

  const t = tank.data;
  const breadcrumbs = [{ label: "Vinificación", href: "/vinificacion" }, { label: t?.tankCode ?? "Tanque" }];

  if (tank.isError) {
    const notFound = tank.error instanceof ApiError && tank.error.isNotFound;
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <ScreenTitle>Tanque</ScreenTitle>
        {notFound ? (
          <EmptyState
            title="Tanque no encontrado"
            description="No existe o pertenece a otra bodega."
            action={
              <Button asChild variant="secondary">
                <Link href="/vinificacion">Volver al mapa de tanques</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(tank.error)}
            onRetry={() => tank.refetch()}
            retrying={tank.isFetching}
          />
        )}
      </div>
    );
  }

  if (!t) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <ScreenTitle busy>Tanque</ScreenTitle>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton shape="block" className="h-64" />
          <Skeleton shape="block" className="h-64" />
        </div>
        <Skeleton shape="block" className="h-72" />
      </div>
    );
  }

  const lookup = lotLookup(harvest.data?.items, terroirs.data?.items);
  const h = lookup.harvestById.get(t.harvestBatchId);
  const terroir = terroirOfHarvest(lookup, t.harvestBatchId);
  const logs = sortLogsDesc(t.logs);
  const treatments = [...(t.treatments ?? [])].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  const last = logs[0];
  const hot = t.status === "FERMENTING" && isHot(last);
  const day = fermentationDay(t, today());
  const status = TANK_STATUS[t.status];
  const step = nextStep(t, agings.data?.items ?? [], productions.data?.items ?? []);
  const stepAction =
    step?.available && can(me.data, step.kind === "crianza" ? "aging.create" : "distillation.create") ? step : null;
  const canLog = can(me.data, "tank.log") && (t.status === "FILLING" || t.status === "FERMENTING");
  const canTreat = can(me.data, "tank.treatment") && t.status !== "CLEANED" && t.status !== "TRANSFERRED";

  // Una sola acción principal: la bitácora mientras fermenta; si no, el siguiente paso.
  const primary = canLog ? (
    <Button iconStart={<NotebookPen aria-hidden size={18} />} onClick={() => setLogOpen(true)}>
      Añadir registro diario
    </Button>
  ) : stepAction ? (
    <Button asChild iconEnd={<ArrowRight aria-hidden size={18} />}>
      <Link href={stepAction.href}>{stepAction.label}</Link>
    </Button>
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={breadcrumbs} actions={primary} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl">{t.tankCode}</h1>
        <Badge tone={hot ? "warning" : status.tone}>{hot ? "Temperatura alta" : status.label}</Badge>
        {t.destinationType && (
          <Badge tone="accent" variant="strong">
            Destino: {DESTINATION[t.destinationType]}
          </Badge>
        )}
      </div>

      {hot && last && (
        <Alert tone="warning" title="Temperatura alta">
          Última lectura: {fmtNumber(last.temperatureCelsius, 1)} °C el {fmtDateTime(last.recordedAt)} (umbral{" "}
          {TEMP_ALERT_C} °C). Revisa el control de frío y registra una nueva lectura.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="grid gap-4 p-5">
          <CardHeader title="Tanque y lote" />
          <div className="grid grid-cols-1 gap-1">
            <div className="flex justify-between text-sm text-fg-muted">
              <span>Llenado</span>
              <span className="tabular-nums">
                {orDash(t.volumeFilledLiters)} / {t.capacityLiters ? fmtLiters(t.capacityLiters) : "—"} ·{" "}
                {fmtNumber(fillPercent(t))} %
              </span>
            </div>
            <Progress value={fillPercent(t)} label="Llenado del tanque" valueText={`${fillPercent(t)} %`} />
          </div>
          <KeyValueList
            items={[
              {
                term: "Lote",
                value: h ? (
                  <Link className="text-accent-text hover:underline" href={`/vendimia/${h.id}`}>
                    {h.harvestBatchCode}
                  </Link>
                ) : (
                  "—"
                ),
              },
              { term: "Parcela", value: terroir ? `${terroir.parcelName} · ${terroir.varietyName}` : "—" },
              { term: "Material", value: t.material ?? "—" },
              { term: "Inicio", value: fmtDate(t.startDate) },
              ...(t.endDate ? [{ term: "Fin", value: fmtDate(t.endDate) }] : []),
              ...(day !== null ? [{ term: "Fermentación", value: `Día ${fmtNumber(day)}` }] : []),
              { term: "Destino", value: t.destinationType ? DESTINATION[t.destinationType] : "Sin destino" },
            ]}
          />
        </Card>

        <Card className="grid content-start gap-3 p-5">
          <CardHeader title="Siguiente paso" />
          {!step ? (
            <p className="m-0 text-sm text-fg-muted">
              Este tanque no va a crianza ni a destilación: no tiene etapa siguiente en el ERP.
            </p>
          ) : (
            <>
              <p className="m-0 text-sm text-fg-muted">
                {step.kind === "crianza"
                  ? "El destino fijado al llenar es crianza (vino): la ruta de destilación está bloqueada."
                  : "El destino fijado al llenar es destilación (singani): la ruta de crianza está bloqueada."}
              </p>
              {step.existing.length > 0 && (
                <ul className="m-0 grid gap-1 p-0">
                  {step.existing.map((x) => (
                    <li key={x.id} className="list-none">
                      <Link className="text-sm text-accent-text hover:underline" href={x.href}>
                        {step.kind === "crianza" ? "Ver crianza" : "Ver destilación"} · {x.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {t.status === "FILLING" && (
                <p className="m-0 text-sm text-fg-muted">Podrás continuar cuando el tanque esté fermentando.</p>
              )}
              {t.status === "FERMENTING" && step.available && (
                <p className="m-0 text-sm text-fg-muted">
                  Continúa cuando la fermentación haya concluido (densidad estable).
                </p>
              )}
              {stepAction && canLog && (
                <Button asChild variant="secondary" iconEnd={<ArrowRight aria-hidden size={16} />}>
                  <Link href={stepAction.href}>{stepAction.label}</Link>
                </Button>
              )}
              <p className="m-0 text-xs text-fg-subtle">
                El ERP aún no puede marcar la fermentación como terminada: el backend no expone ese cambio de estado.
              </p>
            </>
          )}
        </Card>
      </div>

      {logs.length > 0 && (
        <Card className="grid gap-6 p-5 md:grid-cols-2">
          <TrendSparkline
            label="Temperatura"
            unit="°C"
            threshold={TEMP_ALERT_C}
            alert={hot}
            points={logs.map((l) => ({ at: l.recordedAt, value: l.temperatureCelsius }))}
          />
          <TrendSparkline
            label="Densidad"
            unit=""
            digits={3}
            points={logs.flatMap((l) =>
              l.specificGravity != null ? [{ at: l.recordedAt, value: l.specificGravity }] : [],
            )}
          />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Bitácora"
          description={`${fmtNumber(logs.length)} ${logs.length === 1 ? "lectura" : "lecturas"}, la más reciente primero`}
          divided
          className="px-5 pt-5"
        />
        <DataTable
          data={logs}
          getRowId={(l) => l.id}
          caption={`Bitácora de ${t.tankCode}`}
          captionHidden
          columns={[
            { id: "at", header: "Fecha", cell: (l) => fmtDateTime(l.recordedAt) },
            {
              id: "temp",
              header: "Temp. °C",
              numeric: true,
              cell: (l) => (
                <span className={isHot(l) ? "font-medium text-warning" : undefined}>
                  {fmtNumber(l.temperatureCelsius, 1)}
                </span>
              ),
            },
            { id: "sg", header: "Densidad", numeric: true, cell: (l) => orDash(l.specificGravity, 3) },
            { id: "ph", header: "pH", numeric: true, hideBelow: "md", cell: (l) => orDash(l.phValue, 2) },
            {
              id: "co2",
              header: "CO₂ y notas",
              hideBelow: "lg",
              cell: (l) => [l.co2Observations, l.notes].filter(Boolean).join(" · ") || "—",
            },
          ]}
          empty={
            <EmptyState
              bare
              title="Sin lecturas"
              description="Registra la primera lectura de temperatura del tanque."
              action={
                canLog ? (
                  <Button variant="secondary" onClick={() => setLogOpen(true)}>
                    Añadir registro diario
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Tratamientos enológicos"
          description="Aditivos aplicados con su autorización SENASAG"
          divided
          className="px-5 pt-5"
          action={
            canTreat ? (
              <Button variant="secondary" size="sm" onClick={() => setTreatmentOpen(true)}>
                Registrar tratamiento
              </Button>
            ) : undefined
          }
        />
        <DataTable
          data={treatments}
          getRowId={(x) => x.id}
          caption={`Tratamientos de ${t.tankCode}`}
          captionHidden
          columns={[
            { id: "at", header: "Fecha", cell: (x) => fmtDate(x.appliedAt) },
            { id: "type", header: "Tipo", cell: (x) => TREATMENT_TYPE[x.treatmentType] },
            { id: "additive", header: "Aditivo", hideBelow: "md", cell: (x) => x.additiveName },
            { id: "dose", header: "Dosis g/hL", numeric: true, cell: (x) => fmtNumber(x.dosageAppliedGPerHl, 1) },
            { id: "total", header: "Total g", numeric: true, hideBelow: "lg", cell: (x) => orDash(x.totalAppliedG, 0) },
            {
              id: "code",
              header: "Código SENASAG",
              hideBelow: "lg",
              cell: (x) => <span className="font-mono text-xs">{x.regulatoryAuthCode}</span>,
            },
          ]}
          empty={<EmptyState bare title="Sin tratamientos" description="No se aplicaron aditivos en este tanque." />}
        />
      </Card>

      {canLog && <LogForm tankId={t.id} tankCode={t.tankCode} open={logOpen} onOpenChange={setLogOpen} />}
      {canTreat && (
        <TreatmentForm
          tankId={t.id}
          tankCode={t.tankCode}
          volumeLiters={t.volumeFilledLiters ?? null}
          open={treatmentOpen}
          onOpenChange={setTreatmentOpen}
        />
      )}
    </div>
  );
}
