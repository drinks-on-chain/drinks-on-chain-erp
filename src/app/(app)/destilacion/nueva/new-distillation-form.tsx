"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { StillCutsForm, type CutsField } from "@/features/destilacion/components/still-cuts-form";
import {
  SINGANI_REST_DAYS,
  distillationCandidates,
  restUntilPreview,
  validateDistillation,
  type DistillationField,
  type DistillationValues,
} from "@/features/destilacion/distillation-model";
import { FormErrorAlert } from "@/features/vinificacion/components/form-error";
import { hasErrors, parseDecimal, toDateInput } from "@/features/vinificacion/form-utils";
import { doEligibility, lotLookup, lotName, terroirOfHarvest } from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateDistillation, useHarvestBatches, useProductions, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { TANK_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtLiters, fmtNumber } from "@/lib/format";

const FORM_ID = "new-distillation-form";

export function NewDistillationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const tanks = useTanks();
  const productions = useProductions();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const createDistillation = useCreateDistillation();

  const [values, setValues] = useState<DistillationValues>(() => ({
    fermentationTankId: params.get("tanque") ?? "",
    equipmentIdentifier: "",
    processStartDate: toDateInput(today()),
    processEndDate: toDateInput(today()),
    inputVolumeLiters: "",
    headDiscardLiters: "",
    heartYieldLiters: "",
    tailDiscardLiters: "",
    initialAlcoholPercentage: "",
    outputVolumeLiters: "",
    wasteVolumeLiters: "",
    isDoEligible: true,
    notes: "",
  }));
  const [errors, setErrors] = useState<Partial<Record<DistillationField, string>>>({});

  const candidates = useMemo(() => distillationCandidates(tanks.data?.items ?? []), [tanks.data]);
  const lookup = useMemo(() => lotLookup(harvest.data?.items, terroirs.data?.items), [harvest.data, terroirs.data]);
  const tank = candidates.find((t) => t.id === values.fermentationTankId);
  const preselected = params.get("tanque");
  const preselectedInvalid = !!preselected && !!tanks.data && !candidates.some((t) => t.id === preselected);
  const terroir = tank ? terroirOfHarvest(lookup, tank.harvestBatchId) : undefined;
  const eligibility = doEligibility(terroir);
  const doAllowed = !!tank && eligibility.eligible;
  const previous = tank ? (productions.data?.items ?? []).filter((p) => p.fermentationTankId === tank.id) : [];

  // Valores por defecto que dependen del tanque o de los cortes (se muestran como sugerencia).
  const head = parseDecimal(values.headDiscardLiters);
  const heart = parseDecimal(values.heartYieldLiters);
  const tail = parseDecimal(values.tailDiscardLiters);
  const defaults = {
    inputVolumeLiters: tank?.volumeFilledLiters ? String(tank.volumeFilledLiters) : "",
    outputVolumeLiters: heart !== null ? String(heart) : "",
    wasteVolumeLiters: head !== null || tail !== null ? String((head ?? 0) + (tail ?? 0)) : "",
  };
  const effective = (): DistillationValues => ({
    ...values,
    inputVolumeLiters: values.inputVolumeLiters.trim() || defaults.inputVolumeLiters,
    outputVolumeLiters: values.outputVolumeLiters.trim() || defaults.outputVolumeLiters,
    wasteVolumeLiters: values.wasteVolumeLiters.trim() || defaults.wasteVolumeLiters,
    isDoEligible: values.isDoEligible && doAllowed,
  });
  const restUntil = restUntilPreview(values.processStartDate, values.processEndDate);

  const set = <K extends DistillationField>(k: K, value: DistillationValues[K]) => {
    setValues((v) => ({ ...v, [k]: value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = effective();
    const found = validateDistillation(v, {
      candidateIds: new Set(candidates.map((t) => t.id)),
      doAllowed,
      today: today(),
    });
    setErrors(found);
    if (hasErrors(found)) return;
    createDistillation.mutate(
      {
        fermentationTankId: v.fermentationTankId,
        equipmentIdentifier: v.equipmentIdentifier.trim(),
        processStartDate: v.processStartDate,
        processEndDate: v.processEndDate || null,
        inputVolumeLiters: parseDecimal(v.inputVolumeLiters),
        outputVolumeLiters: parseDecimal(v.outputVolumeLiters),
        wasteVolumeLiters: parseDecimal(v.wasteVolumeLiters),
        initialAlcoholPercentage: parseDecimal(v.initialAlcoholPercentage),
        isDoEligible: v.isDoEligible,
        additionalParams: {
          headDiscardLiters: parseDecimal(v.headDiscardLiters),
          heartYieldLiters: parseDecimal(v.heartYieldLiters),
          tailDiscardLiters: parseDecimal(v.tailDiscardLiters),
        },
        notes: v.notes.trim() || null,
      },
      {
        onSuccess: (p) => {
          toast({
            title: "Destilación registrada",
            description: p.mandatoryRestUntil ? `En reposo hasta el ${fmtDate(p.mandatoryRestUntil)}.` : undefined,
            tone: "success",
          });
          router.push(`/destilacion/${p.id}`);
        },
      },
    );
  };

  const allowed = can(me.data, "distillation.create");
  const queries = [tanks, productions, harvest, terroirs];
  const loading = me.isPending || queries.some((q) => q.isPending);
  const failed = queries.find((q) => q.isError);
  const ready = allowed && !loading && !failed && candidates.length > 0;

  const shell = (body: ReactNode) => (
    <div className="grid grid-cols-1 gap-6">
      <PageChrome
        breadcrumbs={[{ label: "Destilación y reposo", href: "/destilacion" }, { label: "Registrar destilación" }]}
        actions={
          ready ? (
            <Button type="submit" form={FORM_ID} loading={createDistillation.isPending}>
              Registrar destilación
            </Button>
          ) : null
        }
      />
      {body}
    </div>
  );

  if (loading) return shell(<Skeleton shape="block" className="h-96" />);
  if (failed)
    return shell(
      <ErrorState
        description={errorMessage(failed.error)}
        onRetry={() => queries.forEach((q) => q.refetch())}
        retrying={queries.some((q) => q.isFetching)}
      />,
    );
  if (!allowed)
    return shell(
      <EmptyState
        title="Tu rol no puede registrar destilaciones"
        description="Registrar los cortes del alambique es tarea de enología o de la administración de la bodega."
        action={
          <Button asChild variant="secondary">
            <Link href="/destilacion">Volver a destilación</Link>
          </Button>
        }
      />,
    );
  if (candidates.length === 0)
    return shell(
      <EmptyState
        title="No hay tanques para destilar"
        description="Solo van al alambique los tanques llenados con destino destilación (singani)."
        action={
          <Button asChild variant="secondary">
            <Link href="/vinificacion">Ir al mapa de tanques</Link>
          </Button>
        }
      />,
    );

  return shell(
    <>
      <div>
        <h1 className="font-display text-3xl">Registrar destilación</h1>
        <p className="m-0 text-fg-muted">Cortes del alambique y datos del proceso. Al guardar empieza el reposo.</p>
      </div>
      {preselectedInvalid && (
        <Alert tone="warning" title="Ese tanque no puede ir al alambique">
          Su destino no es destilación (singani). Elige otro tanque.
        </Alert>
      )}

      <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="grid gap-8 p-5 md:p-6">
          <FormSection title="Vino base" columns={1}>
            <Field label="Tanque" required error={errors.fermentationTankId} help="Tanques con destino destilación.">
              <Select
                size="lg"
                placeholder="Elige el tanque"
                value={tank ? values.fermentationTankId : undefined}
                onValueChange={(v) => set("fermentationTankId", v)}
                options={candidates.map((t) => ({
                  value: t.id,
                  label: `${t.tankCode} · ${lotName(lookup, t.harvestBatchId)} · ${TANK_STATUS[t.status].label}`,
                }))}
              />
            </Field>
            {previous.length > 0 && (
              <Alert tone="info">
                {tank?.tankCode} ya pasó por el alambique{" "}
                {previous.length === 1 ? "una vez" : `${fmtNumber(previous.length)} veces`}: esta será otra tanda.
              </Alert>
            )}
          </FormSection>

          <FormSection title="Proceso" columns={2}>
            <Field
              label="Alambique"
              required
              error={errors.equipmentIdentifier}
              help="P. ej. «Alambique de cobre AL-01»."
            >
              <Input
                size="lg"
                value={values.equipmentIdentifier}
                onChange={(e) => set("equipmentIdentifier", e.target.value)}
              />
            </Field>
            <Field label="Volumen de entrada" required error={errors.inputVolumeLiters} help="Vino base que entra.">
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.inputVolumeLiters}
                placeholder={defaults.inputVolumeLiters}
                onChange={(e) => set("inputVolumeLiters", e.target.value)}
              />
            </Field>
            <Field label="Inicio" required error={errors.processStartDate}>
              <Input
                size="lg"
                type="date"
                value={values.processStartDate}
                onChange={(e) => set("processStartDate", e.target.value)}
              />
            </Field>
            <Field label="Fin" error={errors.processEndDate} help="El reposo cuenta desde el fin.">
              <Input
                size="lg"
                type="date"
                value={values.processEndDate}
                onChange={(e) => set("processEndDate", e.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Cortes del alambique" columns={1}>
            <StillCutsForm
              values={values}
              errors={errors}
              onChange={(f: CutsField, v) => set(f, v)}
              inputVolumeLiters={parseDecimal(values.inputVolumeLiters || defaults.inputVolumeLiters)}
            />
          </FormSection>

          <FormSection title="Balance" columns={2}>
            <Field label="Volumen de salida" error={errors.outputVolumeLiters} help="Por defecto, el corazón.">
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.outputVolumeLiters}
                placeholder={defaults.outputVolumeLiters}
                onChange={(e) => set("outputVolumeLiters", e.target.value)}
              />
            </Field>
            <Field label="Merma" error={errors.wasteVolumeLiters} help="Por defecto, cabeza + cola.">
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.wasteVolumeLiters}
                placeholder={defaults.wasteVolumeLiters}
                onChange={(e) => set("wasteVolumeLiters", e.target.value)}
              />
            </Field>
          </FormSection>

          <Field label="Notas">
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
          <FormErrorAlert error={createDistillation.error} />
        </Card>

        <aside className="grid content-start gap-4">
          <Card className="grid gap-3 p-5">
            <CardHeader title="Denominación de Origen" />
            {!tank ? (
              <p className="m-0 text-sm text-fg-muted">Elige un tanque para comprobar la aptitud D.O.</p>
            ) : doAllowed ? (
              <>
                <Badge tone="accent" variant="strong">
                  Parcela apta para Singani D.O.
                </Badge>
                <Checkbox
                  checked={values.isDoEligible}
                  onCheckedChange={(c) => set("isDoEligible", c === true)}
                  label="Destilación con D.O. Singani"
                  description={
                    terroir ? `${terroir.parcelName} · ${fmtNumber(terroir.altitudeMasl)} m s. n. m.` : undefined
                  }
                />
              </>
            ) : (
              <Alert tone="warning" title="Sin D.O. Singani">
                {eligibility.reasons.join(" ")}
              </Alert>
            )}
          </Card>
          <Card className="grid gap-3 border-warning bg-warning-soft p-5" aria-live="polite">
            <CardHeader title="Reposo obligatorio" />
            <div className="flex items-center gap-3">
              <Lock aria-hidden size={28} strokeWidth={1.5} className="text-warning" />
              <span className="font-display text-3xl text-warning">
                {restUntil ? fmtDate(restUntil.toISOString()) : "—"}
              </span>
            </div>
            <p className="m-0 text-sm text-fg-muted">
              {SINGANI_REST_DAYS} días desde el fin de la destilación. El embotellado queda bloqueado hasta entonces.
            </p>
            {tank?.volumeFilledLiters ? (
              <p className="m-0 text-xs text-fg-subtle">
                Tanque {tank.tankCode}: {fmtLiters(tank.volumeFilledLiters)} de vino base.
              </p>
            ) : null}
          </Card>
        </aside>
      </form>
    </>,
  );
}
