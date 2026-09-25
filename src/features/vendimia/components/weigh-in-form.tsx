"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Select, Skeleton, Textarea, toast } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useCreateHarvestBatch, useTerroirs } from "@/lib/erp/hooks";
import { today } from "@/lib/erp/today";
import { fmtKg, fmtNumber } from "@/lib/format";
import { LAB_TARGETS } from "../lab-targets";
import {
  emptyWeighIn,
  netWeight,
  toHarvestDto,
  weighInFieldErrors,
  type WeighInErrors,
  type WeighInField,
  type WeighInValues,
} from "../weigh-in";
import { BigNumberInput, BigNumberReadout } from "./big-number-input";
import { LabReadingCard } from "./lab-reading-card";

/**
 * 3.1 Pesaje (pantalla táctil): parcela, báscula (bruto y tara con neto en vivo) y las tres
 * lecturas de laboratorio, obligatorias en el mismo alta (09 §8 punto 6).
 */
export function WeighInForm({ initialTerroirId }: { initialTerroirId?: string }) {
  const router = useRouter();
  const terroirs = useTerroirs();
  const create = useCreateHarvestBatch();
  const [values, setValues] = useState<WeighInValues>(() => emptyWeighIn(today(), initialTerroirId));
  const [errors, setErrors] = useState<WeighInErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: WeighInField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key])
      setErrors((e) => {
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

  const net = netWeight(values.grossWeightKg, values.tareWeightKg);
  const netInvalid = net != null && net <= 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = toHarvestDto(values, today());
    if (!result.ok) {
      setErrors(result.errors);
      setFormError("Revisa los campos marcados.");
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
      if (err instanceof ApiError && err.isValidation) {
        setErrors(weighInFieldErrors(err.details));
        setFormError(err.message);
      } else {
        toast({ title: "No se pudo registrar el ingreso", description: errorMessage(err), tone: "danger" });
      }
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Registro de pesaje" className="grid gap-8">
      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="pesaje-bascula" className="grid content-start gap-5">
          <h2 id="pesaje-bascula" className="font-ui text-lg font-semibold">
            Báscula
          </h2>

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
              help="Hora UTC. Por defecto, el momento actual."
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
              netInvalid ? "El bruto debe ser mayor que la tara." : "Bruto − tara. El backend lo vuelve a calcular."
            }
          />
        </section>

        <section aria-labelledby="pesaje-laboratorio" className="grid content-start gap-5">
          <div className="grid gap-1">
            <h2 id="pesaje-laboratorio" className="font-ui text-lg font-semibold">
              Análisis preliminar
            </h2>
            <p className="m-0 text-sm text-fg-muted">
              Brix, pH y acidez son obligatorios para registrar el ingreso. Fuera de objetivo no bloquea: se marca en
              ámbar para el dictamen.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <LabReadingCard
              target={LAB_TARGETS.brix}
              required
              name="brixDegrees"
              value={values.brixDegrees}
              onChange={(v) => set("brixDegrees", v)}
              error={errors.brixDegrees}
            />
            <LabReadingCard
              target={LAB_TARGETS.ph}
              required
              name="initialPh"
              value={values.initialPh}
              onChange={(v) => set("initialPh", v)}
              error={errors.initialPh}
            />
            <LabReadingCard
              target={LAB_TARGETS.acidity}
              required
              name="initialAcidityGl"
              value={values.initialAcidityGl}
              onChange={(v) => set("initialAcidityGl", v)}
              error={errors.initialAcidityGl}
            />
          </div>
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

      {formError && (
        <Alert tone="danger" title="No se pudo registrar el ingreso">
          {formError}
        </Alert>
      )}

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
