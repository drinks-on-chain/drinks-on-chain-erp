"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardHeader,
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
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import {
  DISTILLATION_FIELDS,
  distillationCandidates,
  toOpenDistillationDto,
  type DistillationField,
  type DistillationValues,
} from "@/features/destilacion/distillation-model";
import { DoEvaluationView } from "@/features/lotes/components/do-evaluation";
import { toDateInput } from "@/features/vinificacion/form-utils";
import { lotLookup, lotName } from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import {
  useCreateDistillation,
  useHarvestBatches,
  useLot,
  useProductions,
  useTanks,
  useTerroirs,
} from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtLiters, fmtNumber } from "@/lib/format";

const FORM_ID = "new-distillation-form";

/**
 * Abrir una destilación (contrato de la Ola 2 §5.2): tanque con la fermentación completada y
 * destino singani, alambique, fecha de inicio y vino base que entra. Los cortes y el grado del
 * corazón se registran al cerrarla, y ahí empieza el reposo. La D.O. no se declara: la comprueba
 * el servidor con la uva del lote y sus reglas.
 */
export function NewDistillationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const tanks = useTanks();
  const productions = useProductions();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const createDistillation = useCreateDistillation();
  // 409/422 del servidor: cada mensaje junto a su campo (details[].field).
  const server = fieldErrorsFrom(createDistillation.error, DISTILLATION_FIELDS).fieldErrors;

  const [values, setValues] = useState<DistillationValues>(() => ({
    fermentationTankId: params.get("tanque") ?? "",
    equipmentIdentifier: "",
    processStartDate: toDateInput(today()),
    inputVolumeLiters: "",
    initialAlcoholPercentage: "",
    notes: "",
  }));
  const [errors, setErrors] = useState<Partial<Record<DistillationField, string>>>({});

  const candidates = useMemo(() => distillationCandidates(tanks.data?.items ?? []), [tanks.data]);
  const lookup = useMemo(() => lotLookup(harvest.data?.items, terroirs.data?.items), [harvest.data, terroirs.data]);
  const tank = candidates.find((t) => t.id === values.fermentationTankId);
  const preselected = params.get("tanque");
  const preselectedInvalid = !!preselected && !!tanks.data && !candidates.some((t) => t.id === preselected);
  const previous = tank ? (productions.data?.items ?? []).filter((p) => p.fermentationTankId === tank.id) : [];
  const lot = useLot(tank?.lotId ?? "", !!tank?.lotId);
  const tankLiters = tank?.finalVolumeLiters ?? tank?.volumeFilledLiters ?? null;
  // Sin cifra escrita y sin tandas previas, entra todo el vino base del tanque.
  const inputVolume =
    values.inputVolumeLiters.trim() || (tankLiters != null && previous.length === 0 ? String(tankLiters) : "");

  const set = <K extends DistillationField>(k: K, value: DistillationValues[K]) => {
    setValues((v) => ({ ...v, [k]: value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    createDistillation.reset();
    const result = toOpenDistillationDto(
      { ...values, inputVolumeLiters: inputVolume },
      { candidateIds: new Set(candidates.map((t) => t.id)), today: today() },
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    try {
      const p = await createDistillation.mutateAsync(result.dto);
      toast({
        title: "Destilación abierta",
        description: "Registra los cortes al cerrarla: ahí empieza el reposo.",
        tone: "success",
      });
      router.push(`/destilacion/${p.id}`);
    } catch {
      // El aviso del formulario explica el rechazo del servidor.
    }
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
              Abrir destilación
            </Button>
          ) : null
        }
      />
      <div>
        <h1 className="font-display text-3xl">Registrar destilación</h1>
        <p className="m-0 text-fg-muted">
          Abre la destilación con el vino base que entra al alambique. Los cortes se registran al cerrarla, y ahí
          empieza el reposo.
        </p>
      </div>
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
        description="Registrar una destilación es tarea de enología o de la dirección de la bodega."
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
        description="Van al alambique los tanques con la fermentación completada y destino destilación (singani)."
        action={
          <Button asChild variant="secondary">
            <Link href="/vinificacion">Ir al mapa de tanques</Link>
          </Button>
        }
      />,
    );

  return shell(
    <>
      {preselectedInvalid && (
        <Alert tone="warning" title="Ese tanque no puede ir al alambique">
          No tiene la fermentación completada con destino destilación (singani). Elige otro tanque.
        </Alert>
      )}

      <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="grid gap-8 p-5 md:p-6">
          <FormSection title="Vino base" columns={1}>
            <Field
              label="Tanque"
              required
              error={errors.fermentationTankId ?? server.fermentationTankId}
              help="Tanques con la fermentación completada y destino destilación."
            >
              <Select
                size="lg"
                placeholder="Elige el tanque"
                // Con `key`: el tanque de la URL puede llegar después de la primera carga de la lista.
                key={tank ? "elegido" : "sin-elegir"}
                value={tank ? values.fermentationTankId : undefined}
                onValueChange={(v) => set("fermentationTankId", v)}
                options={candidates.map((t) => ({
                  value: t.id,
                  label: `${t.tankCode} · ${lotName(lookup, t.harvestBatchId)}${
                    t.finalVolumeLiters != null ? ` · ${fmtLiters(t.finalVolumeLiters)}` : ""
                  }`,
                }))}
              />
            </Field>
            {previous.length > 0 && (
              <Alert tone="info">
                {tank?.tankCode} ya pasó por el alambique{" "}
                {previous.length === 1 ? "una vez" : `${fmtNumber(previous.length)} veces`}: esta será otra tanda, con
                el vino base que quede.
              </Alert>
            )}
          </FormSection>

          <FormSection title="Proceso" columns={2}>
            <Field
              label="Alambique"
              required
              error={errors.equipmentIdentifier ?? server.equipmentIdentifier}
              help="P. ej. «Alambique de cobre AL-01»."
            >
              <Input
                size="lg"
                value={values.equipmentIdentifier}
                onChange={(e) => set("equipmentIdentifier", e.target.value)}
              />
            </Field>
            <Field
              label="Volumen de entrada"
              required
              error={errors.inputVolumeLiters ?? server.inputVolumeLiters}
              help={
                tankLiters != null
                  ? `Vino base que entra. El tanque quedó con ${fmtLiters(tankLiters)} al completar la fermentación.`
                  : "Vino base que entra."
              }
            >
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.inputVolumeLiters}
                placeholder={tankLiters != null && previous.length === 0 ? String(tankLiters) : undefined}
                onChange={(e) => set("inputVolumeLiters", e.target.value)}
              />
            </Field>
            <Field
              label="Inicio"
              required
              error={errors.processStartDate ?? server.processStartDate}
              help="No puede ser anterior al fin de la fermentación."
            >
              <Input
                size="lg"
                type="date"
                value={values.processStartDate}
                onChange={(e) => set("processStartDate", e.target.value)}
              />
            </Field>
            <Field
              label="Grado del vino base"
              error={errors.initialAlcoholPercentage ?? server.initialAlcoholPercentage}
              help="Opcional."
            >
              <Input
                size="lg"
                numeric
                inputMode="text"
                suffix="% vol"
                value={values.initialAlcoholPercentage}
                onChange={(e) => set("initialAlcoholPercentage", e.target.value)}
              />
            </Field>
          </FormSection>

          <Field label="Notas" error={errors.notes}>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
          <RuleViolationNotice error={createDistillation.error} fields={DISTILLATION_FIELDS} />
        </Card>

        <aside className="grid content-start gap-4">
          <Card className="grid gap-3 p-5">
            <CardHeader title="Denominación de origen" />
            {!tank ? (
              <p className="m-0 text-sm text-fg-muted">Elige un tanque para ver la D.O. de su lote.</p>
            ) : lot.data ? (
              <DoEvaluationView evaluation={lot.data.denomination} />
            ) : (
              <Skeleton shape="block" className="h-16" />
            )}
            <p className="m-0 text-xs text-fg-subtle">
              La calcula el servidor con toda la uva del lote y sus reglas, y la vuelve a comprobar al abrir la
              destilación. No se declara.
            </p>
          </Card>
          <Alert tone="info" title="El reposo empieza al cerrar">
            {lot.data
              ? `Las reglas de este lote exigen ${fmtNumber(lot.data.rules.singani.minRestDays)} días de reposo desde el cierre de la destilación.`
              : "El reposo mínimo es el de las reglas del lote y cuenta desde el cierre de la destilación."}
          </Alert>
        </aside>
      </form>
    </>,
  );
}
