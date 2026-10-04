"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Select, Skeleton, Textarea, toast } from "@drinks-on-chain/ui";
import { RuleViolationNotice } from "@/components/rule-violation-notice";
import { NewLotFields } from "@/features/lotes/components/new-lot-fields";
import { RulesPreview } from "@/features/lotes/components/rules-preview";
import type { LotFormErrors, LotFormField, LotFormValues } from "@/features/lotes/lot-model";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { useCreateHarvestBatch, useLots, useTerroirs } from "@/lib/erp/hooks";
import { can } from "@/lib/erp/permissions";
import { today } from "@/lib/erp/today";
import { fmtKg, fmtNumber } from "@/lib/format";
import { LAB_TARGETS } from "../lab-targets";
import {
  WEIGH_IN_ERROR_FIELDS,
  emptyWeighIn,
  emptyWeighInLot,
  netWeight,
  toHarvestDto,
  weighInFieldErrors,
  weighInLotErrors,
  type WeighInErrors,
  type WeighInField,
  type WeighInValues,
} from "../weigh-in";
import { BigNumberInput, BigNumberReadout } from "./big-number-input";
import { LabReadingCard } from "./lab-reading-card";

/** Etapas en las que un lote admite pesajes (contrato de la Ola 2 §3.2). */
const OPEN_STAGES = ["ORIGIN", "HARVEST", "FERMENTING"] as const;

/**
 * Pesaje (pantalla táctil): lote, parcela y báscula (bruto y tara con neto en vivo). El análisis
 * de madurez es opcional y el dictamen fitosanitario se registra aparte, nunca en el alta.
 */
export function WeighInForm({ initialTerroirId, initialLotId }: { initialTerroirId?: string; initialLotId?: string }) {
  const router = useRouter();
  const me = useMe();
  const terroirs = useTerroirs();
  const lots = useLots({ stage: OPEN_STAGES });
  const canReadTerroirs = can(me.data, "terroir.read");
  const canCreateLot = can(me.data, "lot.write");
  const canAnalyze = can(me.data, "harvest.maturity");
  const create = useCreateHarvestBatch();
  const [values, setValues] = useState<WeighInValues>(() =>
    emptyWeighIn(today(), initialTerroirId, initialLotId ?? "none"),
  );
  const [newLot, setNewLot] = useState<LotFormValues>(() => emptyWeighInLot(today()));
  const [errors, setErrors] = useState<WeighInErrors>({});
  const [lotErrors, setLotErrors] = useState<LotFormErrors>({});
  const [invalid, setInvalid] = useState(false);

  const set = (key: WeighInField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
  };
  const setLot = <K extends LotFormField>(key: K, value: LotFormValues[K]) => {
    setNewLot((v) => ({ ...v, [key]: value }));
    if (lotErrors[key])
      setLotErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
  };

  const options = useMemo(
    () =>
      (terroirs.data?.items ?? [])
        .filter((t) => t.isActive || t.id === initialTerroirId)
        .sort((a, b) => a.parcelName.localeCompare(b.parcelName, "es"))
        .map((t) => ({ value: t.id, label: `${t.parcelName} · ${t.varietyName}` })),
    [terroirs.data, initialTerroirId],
  );

  const lotOptions = useMemo(
    () => [
      { value: "none", label: "Sin lote: uva recibida" },
      ...(lots.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.name} · ${l.reference}` })),
      ...(canCreateLot ? [{ value: "new", label: "Nuevo lote…" }] : []),
    ],
    [lots.data, canCreateLot],
  );

  function chooseLot(choice: string) {
    set("lotChoice", choice);
    // El pesaje es de la añada del lote: se propone la suya.
    const lot = lots.data?.items.find((l) => l.id === choice);
    if (lot) set("harvestYear", String(lot.harvestYear));
  }

  const net = netWeight(values.grossWeightKg, values.tareWeightKg);
  const netInvalid = net != null && net <= 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.reset();
    const result = toHarvestDto(values, today(), newLot);
    setInvalid(!result.ok);
    if (!result.ok) {
      setErrors(result.errors);
      setLotErrors(result.lotErrors);
      return;
    }
    try {
      const batch = await create.mutateAsync(result.dto);
      toast({
        title: "Ingreso registrado",
        description: `${batch.harvestBatchCode} · ${fmtKg(batch.netWeightKg)} netos`,
        tone: "success",
      });
      router.push(`/vendimia/${batch.id}`);
    } catch (err) {
      setErrors(weighInFieldErrors(err));
      setLotErrors(weighInLotErrors(err));
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Registro de pesaje" className="grid grid-cols-1 gap-8">
      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="pesaje-bascula" className="grid content-start gap-5">
          <h2 id="pesaje-bascula" className="font-ui text-lg font-semibold">
            Báscula
          </h2>

          {lots.isError ? (
            <Alert
              tone="danger"
              title="No se pudieron cargar los lotes"
              action={
                <Button size="sm" variant="tertiary" onClick={() => lots.refetch()}>
                  Reintentar
                </Button>
              }
            >
              {errorMessage(lots.error)}
            </Alert>
          ) : !lots.data ? (
            <Skeleton shape="block" className="h-20" />
          ) : (
            <Field
              label="Lote"
              required
              error={errors.lotChoice}
              help="La uva sin lote se asigna a uno al llenar el tanque."
            >
              <Select size="lg" value={values.lotChoice} onValueChange={chooseLot} options={lotOptions} />
            </Field>
          )}

          {terroirs.isError ? (
            <Alert
              tone="danger"
              title="No se pudieron cargar las parcelas"
              action={
                <Button size="sm" variant="tertiary" onClick={() => terroirs.refetch()}>
                  Reintentar
                </Button>
              }
            >
              {errorMessage(terroirs.error)}
            </Alert>
          ) : !terroirs.data ? (
            <Skeleton shape="block" className="h-20" />
          ) : !canReadTerroirs ? (
            <Alert tone="warning" title="Tu rol no puede consultar las parcelas">
              El pesaje necesita elegir la parcela de origen. Pide a la dirección, enología o agronomía que registren
              este ingreso.
            </Alert>
          ) : options.length === 0 ? (
            <Alert tone="warning" title="No hay terroirs activos">
              Registra primero la parcela de origen en{" "}
              <Link href="/origen/nuevo" className="underline">
                Origen y terroirs
              </Link>
              .
            </Alert>
          ) : (
            <Field label="Terroir de origen" required error={errors.terroirId}>
              <Select
                size="lg"
                value={values.terroirId}
                onValueChange={(v) => set("terroirId", v)}
                placeholder="Elige la parcela"
                options={options}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Año de cosecha" required error={errors.harvestYear}>
              <Input
                size="lg"
                numeric
                inputMode="numeric"
                value={values.harvestYear}
                onChange={(e) => set("harvestYear", e.target.value)}
              />
            </Field>
            <Field
              label="Fecha y hora de ingreso"
              required
              error={errors.intakeDate}
              help="Hora UTC. Por defecto, ahora; un ingreso anterior queda marcado como registro tardío."
            >
              <Input
                size="lg"
                type="datetime-local"
                value={values.intakeDate}
                onChange={(e) => set("intakeDate", e.target.value)}
              />
            </Field>
          </div>

          <BigNumberInput
            label="Peso bruto"
            unit="kg"
            required
            value={values.grossWeightKg}
            onChange={(v) => set("grossWeightKg", v)}
            error={errors.grossWeightKg}
            help="Lectura de la báscula con la carga."
          />
          <BigNumberInput
            label="Tara"
            unit="kg"
            required
            value={values.tareWeightKg}
            onChange={(v) => set("tareWeightKg", v)}
            error={errors.tareWeightKg}
            help="Peso del vehículo o de las cajas vacías."
          />
          <BigNumberReadout
            label="Peso neto recibido"
            unit="kg"
            value={net == null ? "—" : fmtNumber(net)}
            tone={net == null ? "neutral" : netInvalid ? "warning" : "accent"}
            help={
              netInvalid ? "El bruto debe ser mayor que la tara." : "Bruto − tara. El servidor lo vuelve a calcular."
            }
          />
        </section>

        <section aria-labelledby="pesaje-detalle" className="grid content-start gap-5">
          {values.lotChoice === "new" && (
            <div className="grid grid-cols-1 gap-4">
              <h2 className="m-0 font-ui text-lg font-semibold">Lote nuevo</h2>
              <NewLotFields values={newLot} errors={lotErrors} onChange={setLot} compact hideYear />
              <RulesPreview />
            </div>
          )}

          <div className="grid grid-cols-1 gap-1">
            <h2 id="pesaje-detalle" className="font-ui text-lg font-semibold">
              {canAnalyze ? "Análisis de madurez" : "Datos del ingreso"}
            </h2>
            <p className="m-0 text-sm text-fg-muted">
              {canAnalyze
                ? "Opcional: Brix, pH y acidez se pueden registrar ahora o después, en la ficha del pesaje. El dictamen fitosanitario se registra aparte."
                : "El análisis de madurez y el dictamen fitosanitario los registran enología o agronomía en la ficha del pesaje."}
            </p>
          </div>
          {canAnalyze && (
            <div className="grid gap-4 sm:grid-cols-3">
              <LabReadingCard
                target={LAB_TARGETS.brix}
                name="brixDegrees"
                value={values.brixDegrees}
                onChange={(v) => set("brixDegrees", v)}
                error={errors.brixDegrees}
              />
              <LabReadingCard
                target={LAB_TARGETS.ph}
                name="initialPh"
                value={values.initialPh}
                onChange={(v) => set("initialPh", v)}
                error={errors.initialPh}
              />
              <LabReadingCard
                target={LAB_TARGETS.acidity}
                name="initialAcidityGl"
                value={values.initialAcidityGl}
                onChange={(v) => set("initialAcidityGl", v)}
                error={errors.initialAcidityGl}
              />
            </div>
          )}
          <Field label="Temperatura de la uva al ingreso" error={errors.temperatureAtIntakeC} help="Opcional.">
            <Input
              size="lg"
              numeric
              inputMode="text"
              suffix="°C"
              value={values.temperatureAtIntakeC}
              onChange={(e) => set("temperatureAtIntakeC", e.target.value)}
            />
          </Field>
          <Field
            label="Notas"
            error={errors.notes}
            help="Opcional. Estado sanitario visible, incidencias del transporte…"
          >
            <Textarea rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </section>
      </div>

      {invalid && (
        <Alert tone="danger" title="No se pudo registrar el ingreso">
          Revisa los campos marcados.
        </Alert>
      )}
      <RuleViolationNotice error={create.error} fields={WEIGH_IN_ERROR_FIELDS} />

      <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Button asChild variant="secondary" size="xl">
          <Link href="/vendimia">Cancelar</Link>
        </Button>
        <Button type="submit" size="xl" loading={create.isPending}>
          Registrar ingreso
        </Button>
      </div>
    </form>
  );
}
