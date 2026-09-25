"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Flame, Wine } from "lucide-react";
import type { DestinationType } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Input,
  KeyValueList,
  RadioGroup,
  Select,
  Skeleton,
  toast,
} from "@drinks-on-chain/ui";
import { PageChrome } from "@/components/page-chrome";
import { DecisionModal, type DecisionOption } from "@/features/vinificacion/components/decision-modal";
import { FormErrorAlert } from "@/features/vinificacion/components/form-error";
import { hasErrors, parseDecimal, toDateInput } from "@/features/vinificacion/form-utils";
import {
  doEligibility,
  suggestTankCode,
  validateNewTank,
  type NewTankField,
  type NewTankValues,
} from "@/features/vinificacion/tank-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateTank, useHarvestBatches, useTanks, useTerroirs } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtDate, fmtKg, fmtNumber } from "@/lib/format";

const FORM_ID = "new-tank-form";

export function NewTankForm() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const harvest = useHarvestBatches();
  const terroirs = useTerroirs();
  const tanks = useTanks();
  const createTank = useCreateTank();

  const [values, setValues] = useState<Omit<NewTankValues, "tankCode"> & { tankCode: string | null }>(() => ({
    harvestBatchId: params.get("vendimia") ?? "",
    tankCode: null,
    capacityLiters: "",
    material: "Acero inoxidable AISI 316",
    volumeFilledLiters: "",
    status: "FERMENTING",
    startDate: toDateInput(today()),
  }));
  const [errors, setErrors] = useState<Partial<Record<NewTankField, string>>>({});
  const [deciding, setDeciding] = useState(false);

  const approved = useMemo(
    () =>
      (harvest.data?.items ?? [])
        .filter((h) => h.phytosanitaryStatus === "APPROVED")
        .sort((a, b) => b.intakeDate.localeCompare(a.intakeDate)),
    [harvest.data],
  );
  const terroirById = useMemo(() => new Map((terroirs.data?.items ?? []).map((t) => [t.id, t])), [terroirs.data]);
  const allTanks = tanks.data?.items ?? [];
  const activeCodes = allTanks.filter((t) => t.status !== "CLEANED").map((t) => t.tankCode);
  const suggestedCode = suggestTankCode(allTanks.map((t) => t.tankCode));
  const tankCode = values.tankCode ?? suggestedCode;

  const selected = approved.find((h) => h.id === values.harvestBatchId);
  const preselectedNotApproved =
    !!params.get("vendimia") && !!harvest.data && !approved.some((h) => h.id === params.get("vendimia"));
  const terroir = selected ? terroirById.get(selected.terroirId) : undefined;
  const singani = doEligibility(terroir);

  const set = (k: NewTankField, value: string) => {
    setValues((v) => ({ ...v, [k]: value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const formValues = (): NewTankValues => ({ ...values, tankCode });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateNewTank(formValues(), {
      approvedHarvestIds: new Set(approved.map((h) => h.id)),
      activeCodes,
      today: today(),
    });
    setErrors(found);
    if (hasErrors(found)) return;
    createTank.reset();
    setDeciding(true);
  };

  const confirm = (destinationType: DestinationType) => {
    const v = formValues();
    createTank.mutate(
      {
        harvestBatchId: v.harvestBatchId,
        tankCode: v.tankCode.trim(),
        capacityLiters: parseDecimal(v.capacityLiters),
        material: v.material.trim() || null,
        volumeFilledLiters: parseDecimal(v.volumeFilledLiters),
        status: v.status,
        destinationType,
        startDate: v.startDate,
      },
      {
        onSuccess: (tank) => {
          toast({
            title: `${tank.tankCode} en marcha`,
            description:
              destinationType === "SINGANI_DIST" ? "Destino: destilación (singani)." : "Destino: crianza (vino).",
            tone: "success",
          });
          setDeciding(false);
          router.push(`/vinificacion/${tank.id}`);
        },
      },
    );
  };

  const options: DecisionOption<DestinationType>[] = [
    {
      value: "WINE_AGING",
      title: "A crianza",
      subtitle: "Vino · barricas o botella",
      icon: <Wine size={28} strokeWidth={1.5} />,
    },
    {
      value: "SINGANI_DIST",
      title: "A destilación",
      subtitle: "Singani · alambique y reposo de 180 días",
      icon: <Flame size={28} strokeWidth={1.5} />,
      disabled: !singani.eligible,
      disabledReason: singani.reasons.join(" "),
    },
  ];

  const allowed = can(me.data, "tank.create");
  const loading = harvest.isPending || terroirs.isPending || tanks.isPending || me.isPending;
  const failed = harvest.isError || terroirs.isError || tanks.isError;

  const chrome = (
    <PageChrome
      breadcrumbs={[{ label: "Vinificación", href: "/vinificacion" }, { label: "Llenar tanque" }]}
      actions={
        allowed && !loading && !failed && approved.length > 0 ? (
          <Button type="submit" form={FORM_ID}>
            Llenar tanque
          </Button>
        ) : null
      }
    />
  );

  if (loading)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        <Skeleton className="h-10 w-72" />
        <Skeleton shape="block" className="h-96" />
      </div>
    );
  if (failed)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        <ErrorState
          description={errorMessage(harvest.error ?? terroirs.error ?? tanks.error)}
          onRetry={() => Promise.all([harvest.refetch(), terroirs.refetch(), tanks.refetch()])}
          retrying={harvest.isFetching}
        />
      </div>
    );
  if (!allowed)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        <EmptyState
          title="Tu rol no puede llenar tanques"
          description="Llenar un tanque y fijar su destino es tarea de enología o de la administración de la bodega."
          action={
            <Button asChild variant="secondary">
              <Link href="/vinificacion">Volver al mapa de tanques</Link>
            </Button>
          }
        />
      </div>
    );
  if (approved.length === 0)
    return (
      <div className="grid grid-cols-1 gap-6">
        {chrome}
        <EmptyState
          title="No hay lotes aprobados para vinificar"
          description="Solo entran al tanque los lotes de vendimia con dictamen fitosanitario aprobado."
          action={
            <Button asChild variant="secondary">
              <Link href="/vendimia">Ir a vendimia</Link>
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="grid grid-cols-1 gap-6">
      {chrome}
      <div>
        <h1 className="font-display text-3xl">Llenar tanque</h1>
        <p className="m-0 text-fg-muted">
          Registra el tanque y su destino técnico. El destino se fija aquí y no se puede cambiar después.
        </p>
      </div>

      {preselectedNotApproved && (
        <Alert tone="warning" title="Ese lote no se puede vinificar">
          El lote indicado no tiene dictamen fitosanitario aprobado. Elige un lote aprobado.
        </Alert>
      )}

      <form id={FORM_ID} onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="grid gap-8 p-5 md:p-6">
          <FormSection title="Lote de vendimia" description="Solo se ofrecen lotes con dictamen aprobado." columns={1}>
            <Field label="Lote" required error={errors.harvestBatchId}>
              <Select
                size="lg"
                placeholder="Elige el lote que entra al tanque"
                value={selected ? values.harvestBatchId : undefined}
                onValueChange={(v) => set("harvestBatchId", v)}
                options={approved.map((h) => {
                  const t = terroirById.get(h.terroirId);
                  return {
                    value: h.id,
                    label: `${h.harvestBatchCode} · ${t ? `${t.parcelName} · ${t.varietyName}` : "Parcela"} · ${fmtKg(h.netWeightKg)}`,
                  };
                })}
              />
            </Field>
          </FormSection>

          <FormSection title="Tanque" columns={2}>
            <Field
              label="Código del tanque"
              required
              error={errors.tankCode}
              help={`Siguiente libre: ${suggestedCode}.`}
            >
              <Input size="lg" value={tankCode} onChange={(e) => set("tankCode", e.target.value)} />
            </Field>
            <Field label="Material">
              <Input size="lg" value={values.material} onChange={(e) => set("material", e.target.value)} />
            </Field>
            <Field label="Capacidad" required error={errors.capacityLiters}>
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.capacityLiters}
                onChange={(e) => set("capacityLiters", e.target.value)}
              />
            </Field>
            <Field
              label="Volumen llenado"
              required
              error={errors.volumeFilledLiters}
              help={
                parseDecimal(values.capacityLiters) && parseDecimal(values.volumeFilledLiters) !== null
                  ? `${fmtNumber(Math.round((parseDecimal(values.volumeFilledLiters)! / parseDecimal(values.capacityLiters)!) * 100))} % de la capacidad.`
                  : "Litros de mosto que entran al tanque."
              }
            >
              <Input
                size="lg"
                numeric
                suffix="L"
                value={values.volumeFilledLiters}
                onChange={(e) => set("volumeFilledLiters", e.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Estado y fecha" columns={2}>
            <Field label="Estado inicial" required>
              <RadioGroup
                variant="card"
                value={values.status}
                onValueChange={(v) => set("status", v)}
                options={[
                  { value: "FILLING", label: "Llenando", description: "El mosto aún está entrando." },
                  { value: "FERMENTING", label: "Fermentando", description: "Empieza la bitácora diaria." },
                ]}
              />
            </Field>
            <Field label="Fecha de inicio" required error={errors.startDate}>
              <Input
                size="lg"
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
          </FormSection>
        </Card>

        <aside className="grid content-start gap-4">
          <Card className="p-5">
            <CardHeader title="Lote elegido" className="mb-3" />
            {selected ? (
              <KeyValueList
                layout="stacked"
                items={[
                  { term: "Código", value: selected.harvestBatchCode },
                  { term: "Parcela", value: terroir ? terroir.parcelName : "—" },
                  { term: "Variedad", value: terroir?.varietyName ?? "—" },
                  {
                    term: "Altitud",
                    value: terroir ? `${fmtNumber(terroir.altitudeMasl)} m s. n. m.` : "—",
                  },
                  { term: "Peso neto", value: fmtKg(selected.netWeightKg) },
                  { term: "Ingreso", value: fmtDate(selected.intakeDate) },
                ]}
              />
            ) : (
              <p className="m-0 text-sm text-fg-muted">Elige un lote para ver su origen.</p>
            )}
          </Card>
          <Card className="grid gap-3 p-5">
            <CardHeader title="Destino técnico" />
            <p className="m-0 text-sm text-fg-muted">
              Al pulsar «Llenar tanque» eliges el destino: crianza (vino) o destilación (singani). El backend lo fija al
              crear el tanque y la ruta contraria queda bloqueada.
            </p>
            {selected &&
              (singani.eligible ? (
                <Badge tone="accent" variant="strong">
                  Apto para Singani D.O.
                </Badge>
              ) : (
                <Alert tone="warning" title="Solo crianza">
                  {singani.reasons.join(" ")}
                </Alert>
              ))}
          </Card>
        </aside>
      </form>

      <DecisionModal
        open={deciding}
        onOpenChange={setDeciding}
        title="Destino técnico de este lote"
        description={`${tankCode}${selected ? ` · ${selected.harvestBatchCode}` : ""}. Al elegir, la ruta contraria queda bloqueada.`}
        options={options}
        acknowledgement="Entiendo que el destino no se puede cambiar después de llenar el tanque."
        confirmLabel="Confirmar destino y llenar"
        onConfirm={confirm}
        confirming={createTank.isPending}
        error={createTank.error ? <FormErrorAlert error={createTank.error} /> : undefined}
      />
    </div>
  );
}
