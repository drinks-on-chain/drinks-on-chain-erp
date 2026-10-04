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
import { VoidedBadge, VoidedText } from "@/components/voided";
import { CorrectRecordButton } from "@/features/lotes/components/correction-dialog";
import { activeOnly, isVoided } from "@/lib/erp/voided";
import { ScreenTitle } from "@/components/screen-title";
import { LogForm } from "@/features/vinificacion/components/log-form";
import {
  CleanTankButton,
  CompleteFermentationButton,
  StartFermentationButton,
} from "@/features/vinificacion/components/tank-actions";
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
import { useAgings, useHarvestBatches, useLot, useProductions, useTank, useTerroirs } from "@/lib/erp/hooks";
import { DESTINATION, TANK_STATUS, TREATMENT_TYPE } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtDateTime, fmtKg, fmtLiters, fmtNumber } from "@/lib/format";

const orDash = (n: number | null | undefined, digits = 0, suffix = "") =>
  n === null || n === undefined ? "—" : `${fmtNumber(n, digits)}${suffix}`;

export function TankDetail({ id }: { id: string }) {
  const me = useMe();
  const tank = useTank(id);
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  // Crianza y destilación solo las leen dirección, enología y contabilidad.
  const agings = useAgings(can(me.data, "aging.read"));
  const productions = useProductions({}, can(me.data, "distillation.read"));
  const lot = useLot(tank.data?.lotId ?? "", !!tank.data?.lotId);
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
  // Las lecturas anuladas siguen en la bitácora (tachadas), pero no cuentan para la última
  // lectura, la alerta de temperatura ni las gráficas.
  const activeLogs = activeOnly(logs);
  const last = activeLogs[0];
  const lotLabel = lot.data ? `${lot.data.name} · ${lot.data.reference}` : `Tanque ${t.tankCode}`;
  const hot = t.status === "FERMENTING" && isHot(last);
  const day = fermentationDay(t, today());
  const status = TANK_STATUS[t.status];
  const step = nextStep(t, agings.data?.items ?? [], productions.data?.items ?? []);
  const stepAction =
    step?.available && can(me.data, step.kind === "crianza" ? "aging.create" : "distillation.create") ? step : null;
  const canLog = can(me.data, "tank.log") && (t.status === "FILLING" || t.status === "FERMENTING");
  const canTreat = can(me.data, "tank.treatment") && t.status !== "CLEANED" && t.status !== "TRANSFERRED";
  // Las transiciones del tanque (iniciar, completar, limpiar) son de enología y dirección.
  const canTransition = can(me.data, "tank.create");
  const inputs = t.inputs ?? [];

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
                value: t.lotId ? (
                  <Link className="text-accent-text hover:underline" href={`/lotes/${t.lotId}`}>
                    {lot.data ? `${lot.data.name} · ${lot.data.reference}` : "Ver lote"}
                  </Link>
                ) : (
                  "—"
                ),
              },
              {
                term: inputs.length > 1 ? "Pesajes" : "Pesaje",
                value:
                  inputs.length > 0 ? (
                    <span className="grid gap-0.5">
                      {inputs.map((i) => {
                        const code = lookup.harvestById.get(i.harvestBatchId)?.harvestBatchCode ?? "Pesaje";
                        return (
                          <span key={i.harvestBatchId}>
                            <Link className="text-accent-text hover:underline" href={`/vendimia/${i.harvestBatchId}`}>
                              {code}
                            </Link>{" "}
                            · {fmtKg(i.kg)}
                          </span>
                        );
                      })}
                    </span>
                  ) : h ? (
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
              ...(t.finalVolumeLiters != null
                ? [{ term: "Volumen final", value: fmtLiters(t.finalVolumeLiters) }]
                : []),
              ...(day !== null ? [{ term: "Fermentación", value: `Día ${fmtNumber(day)}` }] : []),
              {
                term: "Destino",
                value: t.destinationType ? DESTINATION[t.destinationType] : "Se decide al completar la fermentación",
              },
            ]}
          />
        </Card>

        <Card className="grid content-start gap-3 p-5">
          <CardHeader title="Siguiente paso" />
          {t.status === "FILLING" && (
            <>
              <p className="m-0 text-sm text-fg-muted">
                El mosto aún está entrando. Al iniciar la fermentación empieza la bitácora diaria.
              </p>
              {canTransition && <StartFermentationButton tank={t} />}
            </>
          )}
          {t.status === "FERMENTING" && (
            <>
              <p className="m-0 text-sm text-fg-muted">
                Cuando la fermentación termine (densidad estable), complétala: ahí se registra el volumen final y se
                decide el destino, vino o singani.
              </p>
              {canTransition && <CompleteFermentationButton tank={t} />}
            </>
          )}
          {t.status === "CLEANED" && (
            <p className="m-0 text-sm text-fg-muted">Tanque limpio: su código está libre para otro llenado.</p>
          )}
          {(t.status === "COMPLETED" || t.status === "TRANSFERRED") && !step && (
            <p className="m-0 text-sm text-fg-muted">
              Este tanque se cerró sin un destino de vino o singani: no tiene etapa siguiente en el ERP.
            </p>
          )}
          {(t.status === "COMPLETED" || t.status === "TRANSFERRED") && step && (
            <>
              <p className="m-0 text-sm text-fg-muted">
                {step.kind === "crianza"
                  ? "El destino decidido es crianza (vino): la ruta de destilación está bloqueada."
                  : "El destino decidido es destilación (singani): la ruta de crianza está bloqueada."}
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
              {t.status === "TRANSFERRED" && canTransition && <CleanTankButton tank={t} />}
            </>
          )}
        </Card>
      </div>

      {activeLogs.length > 0 && (
        <Card className="grid gap-6 p-5 md:grid-cols-2">
          <TrendSparkline
            label="Temperatura"
            unit="°C"
            threshold={TEMP_ALERT_C}
            alert={hot}
            points={activeLogs.map((l) => ({ at: l.recordedAt, value: l.temperatureCelsius }))}
          />
          <TrendSparkline
            label="Densidad"
            unit=""
            digits={3}
            points={activeLogs.flatMap((l) =>
              l.specificGravity != null ? [{ at: l.recordedAt, value: l.specificGravity }] : [],
            )}
          />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Bitácora"
          description={`${fmtNumber(activeLogs.length)} ${activeLogs.length === 1 ? "lectura" : "lecturas"}, la más reciente primero${
            logs.length > activeLogs.length
              ? ` · ${fmtNumber(logs.length - activeLogs.length)} ${logs.length - activeLogs.length === 1 ? "anulada" : "anuladas"}`
              : ""
          }`}
          divided
          className="px-5 pt-5"
        />
        <DataTable
          data={logs}
          getRowId={(l) => l.id}
          caption={`Bitácora de ${t.tankCode}`}
          captionHidden
          columns={[
            {
              id: "at",
              header: "Fecha",
              cell: (l) => (
                <span className="flex flex-wrap items-center gap-2">
                  <VoidedText voided={isVoided(l)}>{fmtDateTime(l.recordedAt)}</VoidedText>
                  {isVoided(l) && <VoidedBadge at={l.voidedAt} feminine />}
                  {!isVoided(l) && (l.correctedFields?.length ?? 0) > 0 && <Badge tone="info">Corregida</Badge>}
                </span>
              ),
            },
            {
              id: "temp",
              header: "Temp. °C",
              numeric: true,
              cell: (l) => (
                <VoidedText voided={isVoided(l)}>
                  <span className={!isVoided(l) && isHot(l) ? "font-medium text-warning-text" : undefined}>
                    {fmtNumber(l.temperatureCelsius, 1)}
                  </span>
                </VoidedText>
              ),
            },
            {
              id: "sg",
              header: "Densidad",
              numeric: true,
              cell: (l) => <VoidedText voided={isVoided(l)}>{orDash(l.specificGravity, 3)}</VoidedText>,
            },
            {
              id: "ph",
              header: "pH",
              numeric: true,
              hideBelow: "md",
              cell: (l) => <VoidedText voided={isVoided(l)}>{orDash(l.phValue, 2)}</VoidedText>,
            },
            {
              id: "co2",
              header: "CO₂ y notas",
              hideBelow: "lg",
              cell: (l) => [l.co2Observations, l.notes].filter(Boolean).join(" · ") || "—",
            },
          ]}
          rowActions={(l) => (
            <CorrectRecordButton
              lotId={t.lotId}
              lotLabel={lotLabel}
              voided={isVoided(l)}
              record={{ id: l.id, type: "FERMENTATION_LOG", label: `Lectura del ${fmtDateTime(l.recordedAt)}` }}
            />
          )}
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
            {
              id: "at",
              header: "Fecha",
              cell: (x) => (
                <span className="flex flex-wrap items-center gap-2">
                  <VoidedText voided={isVoided(x)}>{fmtDate(x.appliedAt)}</VoidedText>
                  {isVoided(x) && <VoidedBadge at={x.voidedAt} />}
                  {!isVoided(x) && (x.correctedFields?.length ?? 0) > 0 && <Badge tone="info">Corregido</Badge>}
                </span>
              ),
            },
            {
              id: "type",
              header: "Tipo",
              cell: (x) => <VoidedText voided={isVoided(x)}>{TREATMENT_TYPE[x.treatmentType]}</VoidedText>,
            },
            {
              id: "additive",
              header: "Aditivo",
              hideBelow: "md",
              cell: (x) => <VoidedText voided={isVoided(x)}>{x.additiveName}</VoidedText>,
            },
            {
              id: "dose",
              header: "Dosis g/hL",
              numeric: true,
              cell: (x) => <VoidedText voided={isVoided(x)}>{fmtNumber(x.dosageAppliedGPerHl, 1)}</VoidedText>,
            },
            { id: "total", header: "Total g", numeric: true, hideBelow: "lg", cell: (x) => orDash(x.totalAppliedG, 0) },
            {
              id: "code",
              header: "Código SENASAG",
              hideBelow: "lg",
              cell: (x) => <span className="font-mono text-xs">{x.regulatoryAuthCode}</span>,
            },
          ]}
          rowActions={(x) => (
            <CorrectRecordButton
              lotId={t.lotId}
              lotLabel={lotLabel}
              voided={isVoided(x)}
              record={{ id: x.id, type: "TREATMENT", label: `${x.additiveName} del ${fmtDate(x.appliedAt)}` }}
            />
          )}
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
