"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
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
import {
  agingCandidates,
  computeUnlockDate,
  validateAging,
  type AgingField,
  type AgingValues,
} from "@/features/crianza/aging-model";
import { FormErrorAlert } from "@/features/vinificacion/components/form-error";
import { hasErrors, parseDecimal, toDateInput } from "@/features/vinificacion/form-utils";
import { lotLookup, lotName } from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useAgings, useCreateAging, useHarvestBatches, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { TANK_STATUS } from "@/lib/erp/labels";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtDaysLeft, fmtLiters } from "@/lib/format";

const FORM_ID = "new-aging-form";
const CONTAINER_TYPES = ["Barrica", "Fudre", "Tanque de acero", "Huevo de hormigón", "Ánfora", "Botella"];

export function NewAgingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const tanks = useTanks();
  const agings = useAgings();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const createAging = useCreateAging();

  const [values, setValues] = useState<AgingValues>(() => ({
    fermentationTankId: params.get("tanque") ?? "",
    containerType: "Barrica",
    containerMaterial: "Roble francés",
    containerCode: "",
    barrelUseCycle: "1",
    volumeLiters: "",
    plannedMonths: "12",
    startDate: toDateInput(today()),
    notes: "",
  }));
  const [errors, setErrors] = useState<Partial<Record<AgingField, string>>>({});

  const candidates = useMemo(
    () => agingCandidates(tanks.data?.items ?? [], agings.data?.items ?? []),
    [tanks.data, agings.data],
  );
  const lookup = useMemo(() => lotLookup(harvest.data?.items, terroirs.data?.items), [harvest.data, terroirs.data]);
  const tank = candidates.find((t) => t.id === values.fermentationTankId);
  const preselected = params.get("tanque");
  const preselectedInvalid =
    !!preselected && !!tanks.data && !!agings.data && !candidates.some((t) => t.id === preselected);

  const months = parseDecimal(values.plannedMonths);
  const unlock =
    months !== null && Number.isInteger(months) && months >= 1 && months <= 120
      ? computeUnlockDate(values.startDate || toDateInput(today()), months)
      : null;
  const unlockDays = unlock ? Math.ceil((unlock.getTime() - today().getTime()) / 86_400_000) : null;

  const set = (k: AgingField, value: string) => {
    setValues((v) => ({ ...v, [k]: value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateAging(values, {
      candidateIds: new Set(candidates.map((t) => t.id)),
      tankVolume: tank?.volumeFilledLiters ?? null,
      today: today(),
    });
    setErrors(found);
    if (hasErrors(found)) return;
    createAging.mutate(
      {
        fermentationTankId: values.fermentationTankId,
        containerType: values.containerType.trim(),
        containerMaterial: values.containerMaterial.trim() || null,
        containerCode: values.containerCode.trim() || null,
        barrelUseCycle: parseDecimal(values.barrelUseCycle),
        volumeLiters: parseDecimal(values.volumeLiters) ?? tank?.volumeFilledLiters ?? null,
        plannedMonths: months!,
        startDate: values.startDate || null,
        notes: values.notes.trim() || null,
      },
      {
        onSuccess: (aging) => {
          toast({
            title: "Crianza iniciada",
            description: `Bloqueada hasta el ${fmtDate(aging.lockUntilDate)}.`,
            tone: "success",
          });
          router.push(`/crianza/${aging.id}`);
        },
      },
    );
  };

  const allowed = can(me.data, "aging.create");
  const queries = [tanks, agings, harvest, terroirs];
  const loading = me.isPending || queries.some((q) => q.isPending);
  const failed = queries.find((q) => q.isError);
  const ready = allowed && !loading && !failed && candidates.length > 0;

  const chrome = (
    <PageChrome
      breadcrumbs={[{ label: "Crianza", href: "/crianza" }, { label: "Iniciar crianza" }]}
      actions={
        ready ? (
          <Button type="submit" form={FORM_ID} loading={createAging.isPending}>
            Iniciar crianza
          </Button>
        ) : null
      }
    />
  );

  const shell = (body: ReactNode) => (
    <div className="grid grid-cols-1 gap-6">
      {chrome}
      <div>
        <h1 className="font-display text-3xl">Iniciar crianza</h1>
        <p className="m-0 text-fg-muted">
          El vino queda bloqueado hasta la fecha de liberación; no se podrá embotellar antes.
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
        title="Tu rol no puede iniciar crianzas"
        description="Iniciar una crianza es tarea de enología o de la administración de la bodega."
        action={
          <Button asChild variant="secondary">
            <Link href="/crianza">Volver a crianza</Link>
          </Button>
        }
      />,
    );
  if (candidates.length === 0)
    return shell(
      <EmptyState
        title="No hay tanques de vino por criar"
        description="Solo pasan a crianza los tanques llenados con destino crianza (vino) que aún no la iniciaron."
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
        <Alert tone="warning" title="Ese tanque no puede pasar a crianza">
          No tiene destino crianza (vino) o ya inició su crianza. Elige otro tanque.
        </Alert>
      )}

      <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="grid gap-8 p-5 md:p-6">
          <FormSection title="Vino de origen" columns={1}>
            <Field
              label="Tanque"
              required
              error={errors.fermentationTankId}
              help="Tanques con destino crianza que aún no la iniciaron."
            >
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
            {tank?.status === "FERMENTING" && (
              <Alert tone="info">La fermentación de {tank.tankCode} sigue en curso: confirma que ha concluido.</Alert>
            )}
          </FormSection>

          <FormSection title="Recipiente" columns={2}>
            <Field label="Tipo" required error={errors.containerType}>
              <Select
                size="lg"
                value={values.containerType}
                onValueChange={(v) => set("containerType", v)}
                options={CONTAINER_TYPES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label="Madera o material" help="Origen y tostado, p. ej. «Roble francés, tostado medio».">
              <Input
                size="lg"
                value={values.containerMaterial}
                onChange={(e) => set("containerMaterial", e.target.value)}
              />
            </Field>
            <Field label="Código" help="Identificador de la barrica o del lote de barricas.">
              <Input size="lg" value={values.containerCode} onChange={(e) => set("containerCode", e.target.value)} />
            </Field>
            <Field label="Ciclo de uso" error={errors.barrelUseCycle} help="1 = barrica nueva.">
              <Input
                size="lg"
                numeric
                value={values.barrelUseCycle}
                onChange={(e) => set("barrelUseCycle", e.target.value)}
              />
            </Field>
            <Field
              label="Volumen"
              error={errors.volumeLiters}
              help={
                tank?.volumeFilledLiters
                  ? `Por defecto, el del tanque: ${fmtLiters(tank.volumeFilledLiters)}.`
                  : undefined
              }
            >
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.volumeLiters}
                placeholder={tank?.volumeFilledLiters ? String(tank.volumeFilledLiters) : undefined}
                onChange={(e) => set("volumeLiters", e.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Tiempo de crianza" columns={2}>
            <Field label="Meses previstos" required error={errors.plannedMonths}>
              <Input
                size="lg"
                numeric
                suffix="meses"
                value={values.plannedMonths}
                onChange={(e) => set("plannedMonths", e.target.value)}
              />
            </Field>
            <Field label="Inicio" error={errors.startDate} help="Por defecto, hoy.">
              <Input
                size="lg"
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
          </FormSection>

          <Field label="Notas">
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
          <FormErrorAlert error={createAging.error} />
        </Card>

        <aside className="grid content-start gap-4">
          <Card className="grid gap-3 border-warning bg-warning-soft p-5" aria-live="polite">
            <CardHeader title="Fecha de liberación" />
            {unlock ? (
              <>
                <div className="flex items-center gap-3">
                  <Lock aria-hidden size={28} strokeWidth={1.5} className="text-warning" />
                  <span className="font-display text-3xl text-warning" data-testid="unlock-preview">
                    {fmtDate(unlock.toISOString())}
                  </span>
                </div>
                <p className="m-0 text-sm text-fg-muted">
                  {unlockDays !== null && unlockDays > 0 ? fmtDaysLeft(unlockDays) : "Se libera de inmediato"}. El
                  embotellado queda bloqueado hasta entonces. La fecha definitiva la fija el sistema al guardar.
                </p>
              </>
            ) : (
              <p className="m-0 text-sm text-fg-muted">Indica los meses para calcular la fecha.</p>
            )}
          </Card>
        </aside>
      </form>
    </>,
  );
}
