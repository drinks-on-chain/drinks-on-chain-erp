"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { ProductionBatchResponse } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  Skeleton,
  Textarea,
  toast,
  type Tone,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { ReasonAction } from "@/components/reason-action";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { ScreenTitle } from "@/components/screen-title";
import { CountdownLock } from "@/features/crianza/components/countdown-lock";
import { CutsSummary } from "@/features/destilacion/components/cuts-summary";
import { StillCutsForm, type CutsField } from "@/features/destilacion/components/still-cuts-form";
import {
  CLOSE_ERROR_FIELDS,
  closeFieldErrors,
  cutsOf,
  emptyClose,
  isOpenDistillation,
  restView,
  toCloseDistillationDto,
  type CloseField,
  type CloseValues,
  type RestState,
} from "@/features/destilacion/distillation-model";
import { lockRuleText } from "@/features/lotes/lot-model";
import { toDateInput } from "@/features/vinificacion/form-utils";
import { lotLookup, lotName } from "@/features/vinificacion/tank-model";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import {
  useCloseDistillation,
  useDiscardProduction,
  useHarvestBatches,
  useLot,
  useProduction,
  useTanks,
  useTerroirs,
} from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtLiters, fmtNumber } from "@/lib/format";

const liters = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtLiters(n));

const STATE: Record<RestState, { label: string; tone: Tone }> = {
  open: { label: "Destilación abierta", tone: "info" },
  resting: { label: "En reposo", tone: "warning" },
  ready: { label: "Listo", tone: "success" },
  none: { label: "Sin reposo", tone: "neutral" },
  bottled: { label: "Embotellado", tone: "neutral" },
  discarded: { label: "Descartado", tone: "danger" },
};

export function DistillationDetail({ id }: { id: string }) {
  const me = useMe();
  const production = useProduction(id);
  const tanks = useTanks();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const discard = useDiscardProduction();
  const lot = useLot(production.data?.lotId ?? "", !!production.data?.lotId);

  const p = production.data;
  const tank = p ? tanks.data?.items.find((t) => t.id === p.fermentationTankId) : undefined;
  const lookup = lotLookup(harvest.data?.items, terroirs.data?.items);
  const name = tank ? lotName(lookup, tank.harvestBatchId) : null;
  const breadcrumbs = [
    { label: "Destilación y reposo", href: "/destilacion" },
    { label: name ?? p?.equipmentIdentifier ?? "Destilación" },
  ];

  if (production.isError) {
    const notFound =
      production.error instanceof ApiError && (production.error.isNotFound || production.error.isForbidden);
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <ScreenTitle>Destilación</ScreenTitle>
        {notFound ? (
          <EmptyState
            title="Destilación no disponible"
            description="No existe, pertenece a otra bodega o tu rol no puede verla."
            action={
              <Button asChild variant="secondary">
                <Link href="/destilacion">Volver a destilación</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            description={errorMessage(production.error)}
            onRetry={() => production.refetch()}
            retrying={production.isFetching}
          />
        )}
      </div>
    );
  }

  if (!p) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageChrome breadcrumbs={breadcrumbs} />
        <ScreenTitle busy>Destilación</ScreenTitle>
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton shape="block" className="h-80" />
          <Skeleton shape="block" className="h-80" />
        </div>
      </div>
    );
  }

  // Reposo evaluado por el servidor con las reglas del lote y su reloj (`lock`).
  const rest = restView(p, today());
  const open = isOpenDistillation(p);
  const status = STATE[rest.state];
  const h = tank ? lookup.harvestById.get(tank.harvestBatchId) : undefined;
  const canWrite = can(me.data, "distillation.create");
  const canDiscard = canWrite && (open || rest.state === "resting" || rest.state === "ready" || rest.state === "none");
  const closed =
    rest.state === "bottled"
      ? "Este singani ya se embotelló."
      : rest.state === "discarded"
        ? "Esta destilación se descartó: no puede embotellarse."
        : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome breadcrumbs={breadcrumbs} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl">{name ?? "Destilación"}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
        {p.isDoEligible && (
          <Badge tone="accent" variant="strong">
            D.O. Singani
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          {open ? (
            canWrite ? (
              <CloseDistillationForm production={p} />
            ) : (
              <Card className="grid gap-2 p-5">
                <CardHeader title="Destilación abierta" />
                <p className="m-0 text-sm text-fg-muted">
                  Enología o la dirección registran los cortes al cerrarla; ahí empieza el reposo.
                </p>
              </Card>
            )
          ) : (
            <Card className="grid gap-4 p-5">
              <CardHeader title="Cortes del alambique" />
              <CutsSummary
                cuts={cutsOf(p)}
                inputLiters={p.inputVolumeLiters ?? null}
                heartAbvPercent={p.heartAbvPercent}
                pureAlcoholLiters={p.pureAlcoholLiters ?? null}
              />
            </Card>
          )}
          <Card className="grid gap-4 p-5">
            <CardHeader title="Proceso" />
            <KeyValueList
              items={[
                { term: "Alambique", value: p.equipmentIdentifier },
                { term: "Inicio", value: fmtDate(p.processStartDate) },
                { term: "Fin", value: p.processEndDate ? fmtDate(p.processEndDate) : "Abierta" },
                { term: "Entrada", value: liters(p.inputVolumeLiters) },
                ...(p.vinasseLiters != null ? [{ term: "Vinaza", value: liters(p.vinasseLiters) }] : []),
                ...(p.availableLiters != null && (rest.state === "resting" || rest.state === "ready")
                  ? [{ term: "Disponible para embotellar", value: liters(p.availableLiters) }]
                  : []),
                {
                  term: "Grado del vino base",
                  value: p.initialAlcoholPercentage != null ? `${fmtNumber(p.initialAlcoholPercentage, 1)} % vol` : "—",
                },
                {
                  term: "Lote",
                  value: p.lotId ? (
                    <Link className="text-accent-text hover:underline" href={`/lotes/${p.lotId}`}>
                      {lot.data ? `${lot.data.name} · ${lot.data.reference}` : "Ver lote"}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                {
                  term: "Tanque de origen",
                  value: tank ? (
                    <Link className="text-accent-text hover:underline" href={`/vinificacion/${tank.id}`}>
                      {tank.tankCode}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                {
                  term: "Pesaje",
                  value: h ? (
                    <Link className="text-accent-text hover:underline" href={`/vendimia/${h.id}`}>
                      {h.harvestBatchCode}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
                ...(p.notes ? [{ term: "Notas", value: p.notes }] : []),
              ]}
            />
          </Card>
        </div>

        <div className="grid content-start gap-4">
          {open ? (
            <Card className="grid gap-2 p-5">
              <CardHeader title="Reposo" />
              <p className="m-0 text-sm text-fg-muted">
                El reposo obligatorio empieza al cerrar la destilación
                {lot.data ? `: ${fmtNumber(lot.data.rules.singani.minRestDays)} días según las reglas del lote.` : "."}
              </p>
            </Card>
          ) : (
            <CountdownLock
              daysRemaining={rest.daysRemaining}
              progress={rest.progress}
              title="Lote inmovilizado por normativa"
              reason={
                rest.lock
                  ? `${lockRuleText(rest.lock)}.`
                  : rest.restDays
                    ? `Reposo de ${fmtNumber(rest.restDays)} días desde el cierre de la destilación.`
                    : "Esta destilación no tiene reposo pendiente."
              }
              releaseDate={rest.unlockAt}
              startDate={rest.startDate}
              startLabel="inicio del reposo"
              action={{
                label: "Pasar a embotellado",
                href: p.lotId ? `/lotes/${p.lotId}/embotellar` : `/envasado/nuevo?destilacion=${p.id}`,
              }}
              hideAction={!can(me.data, "bottling.create")}
              closedNote={closed}
            />
          )}
          {canDiscard && (
            <ReasonAction
              label="Descartar destilación"
              title={`¿Descartar la destilación de ${p.equipmentIdentifier}?`}
              description="Su corazón deja de contar para el embotellado del lote. No se puede deshacer; el motivo queda en la línea de tiempo."
              confirmLabel="Sí, descartar"
              destructive
              variant="tertiary"
              onConfirm={async (reason) => {
                await discard.mutateAsync({ id: p.id, reason });
                toast({ title: "Destilación descartada", tone: "success" });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Cierre de la destilación (`POST …/close`): cortes, grado del corazón y fecha de fin. */
function CloseDistillationForm({ production: p }: { production: ProductionBatchResponse }) {
  const close = useCloseDistillation();
  const [values, setValues] = useState<CloseValues>(() => emptyClose(toDateInput(today())));
  const [errors, setErrors] = useState<Partial<Record<CloseField, string>>>({});

  const set = (key: CloseField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    close.reset();
    const result = toCloseDistillationDto(values, today());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      const done = await close.mutateAsync({ id: p.id, body: result.dto });
      toast({
        title: "Destilación cerrada",
        description: done.mandatoryRestUntil ? `En reposo hasta el ${fmtDate(done.mandatoryRestUntil)}.` : undefined,
        tone: "success",
      });
    } catch (err) {
      setErrors(closeFieldErrors(err));
    }
  }

  return (
    <Card className="p-5">
      <form noValidate onSubmit={submit} aria-label="Cerrar destilación" className="grid gap-5">
        <CardHeader
          title="Cerrar destilación"
          description="Registra los cortes y el grado del corazón. Al cerrar empieza el reposo obligatorio."
        />
        <StillCutsForm
          values={values}
          errors={errors}
          onChange={(f: CutsField, v) => set(f, v)}
          inputVolumeLiters={p.inputVolumeLiters ?? null}
          disabled={close.isPending}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Fin de la destilación"
            required
            error={errors.processEndDate}
            help="El reposo cuenta desde esta fecha."
          >
            <Input
              size="lg"
              type="date"
              value={values.processEndDate}
              onChange={(e) => set("processEndDate", e.target.value)}
            />
          </Field>
          <Field label="Notas" error={errors.notes} help="Opcional.">
            <Textarea rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
        <RuleViolationNotice error={close.error} fields={CLOSE_ERROR_FIELDS} />
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={close.isPending}>
            Cerrar destilación
          </Button>
        </div>
      </form>
    </Card>
  );
}
