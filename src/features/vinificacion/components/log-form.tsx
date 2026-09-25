"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, SlideOver, Textarea, toast } from "@drinks-on-chain/ui";
import { useAddTankLog } from "@/lib/erp/hooks";
import { today } from "@/lib/erp/today";
import { dateTimeInputToIso, hasErrors, parseDecimal, toDateTimeInput } from "../form-utils";
import { TEMP_ALERT_C, validateLog, type LogField, type LogValues } from "../tank-model";
import { FormErrorAlert } from "./form-error";
import { useReturnFocus } from "@/lib/use-return-focus";

const empty = (): LogValues => ({
  temperatureCelsius: "",
  specificGravity: "",
  phValue: "",
  co2Observations: "",
  recordedAt: toDateTimeInput(today()),
  notes: "",
});

/**
 * "Añadir registro diario" (09 §3 fila 4.2): pantalla táctil de planta, objetivos de 56 px,
 * temperatura obligatoria y fecha por defecto "ahora".
 */
export function LogForm({
  tankId,
  tankCode,
  open,
  onOpenChange,
}: {
  tankId: string;
  tankCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addLog = useAddTankLog();
  useReturnFocus(open);
  const [values, setValues] = useState<LogValues>(empty);
  const [errors, setErrors] = useState<Partial<Record<LogField, string>>>({});

  const set = (k: LogField) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const close = (next: boolean) => {
    if (addLog.isPending) return;
    if (!next) {
      setValues(empty());
      setErrors({});
      addLog.reset();
    }
    onOpenChange(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateLog(values, today());
    setErrors(found);
    if (hasErrors(found)) return;
    const temp = parseDecimal(values.temperatureCelsius)!;
    addLog.mutate(
      {
        id: tankId,
        body: {
          temperatureCelsius: temp,
          specificGravity: parseDecimal(values.specificGravity, { grouping: false }),
          phValue: parseDecimal(values.phValue),
          co2Observations: values.co2Observations.trim() || null,
          recordedAt: dateTimeInputToIso(values.recordedAt),
          notes: values.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Lectura registrada",
            description:
              temp > TEMP_ALERT_C
                ? `${tankCode} a ${temp.toLocaleString("es-BO")} °C: revisa el control de temperatura.`
                : `${tankCode} · ${temp.toLocaleString("es-BO")} °C`,
            tone: temp > TEMP_ALERT_C ? "warning" : "success",
          });
          close(false);
        },
      },
    );
  };

  const temp = parseDecimal(values.temperatureCelsius);
  return (
    <SlideOver
      open={open}
      onOpenChange={close}
      title="Añadir registro diario"
      description={`Lectura del tanque ${tankCode}`}
      size="md"
      dismissible={!addLog.isPending}
      footer={
        <>
          <Button variant="secondary" size="xl" onClick={() => close(false)} disabled={addLog.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="tank-log-form" size="xl" loading={addLog.isPending}>
            Guardar lectura
          </Button>
        </>
      }
    >
      <form id="tank-log-form" className="grid grid-cols-1 gap-5" onSubmit={submit} noValidate>
        <Field
          label="Temperatura"
          required
          error={errors.temperatureCelsius}
          help={
            temp !== null && temp > TEMP_ALERT_C
              ? `Por encima de ${TEMP_ALERT_C} °C: se avisará en el panel.`
              : "Del mosto, en el centro del tanque."
          }
        >
          <Input
            giant
            numeric
            suffix="°C"
            value={values.temperatureCelsius}
            onChange={set("temperatureCelsius")}
            autoFocus
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Densidad" error={errors.specificGravity} help="Gravedad específica, p. ej. 1,048.">
            <Input size="lg" numeric value={values.specificGravity} onChange={set("specificGravity")} />
          </Field>
          <Field label="pH" error={errors.phValue}>
            <Input size="lg" numeric value={values.phValue} onChange={set("phValue")} />
          </Field>
        </div>
        <Field label="Observaciones de CO₂" help="Burbujeo, sombrero, olores.">
          <Input size="lg" value={values.co2Observations} onChange={set("co2Observations")} />
        </Field>
        <Field label="Fecha y hora" required error={errors.recordedAt} help="Hora UTC; por defecto, ahora.">
          <Input size="lg" type="datetime-local" value={values.recordedAt} onChange={set("recordedAt")} />
        </Field>
        <Field label="Notas">
          <Textarea value={values.notes} onChange={set("notes")} rows={2} />
        </Field>
        <FormErrorAlert error={addLog.error} />
      </form>
    </SlideOver>
  );
}
