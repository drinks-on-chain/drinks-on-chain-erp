"use client";

import { Field, Input, cn } from "@drinks-on-chain/ui";
import { parseDecimal } from "@/features/vinificacion/form-utils";
import { fmtNumber } from "@/lib/format";

export type CutsField = "headDiscardLiters" | "heartYieldLiters" | "tailDiscardLiters" | "initialAlcoholPercentage";
export type CutsValues = Record<CutsField, string>;

/**
 * Cortes del alambique (05 §3.3 StillCutsForm, 01-erp.html §07): cabeza, corazón (el campo
 * clave, en oro), cola y grado inicial. Muestra cuánto suman los cortes frente a la entrada.
 */
export function StillCutsForm({
  values,
  errors = {},
  onChange,
  inputVolumeLiters,
  disabled,
}: {
  values: CutsValues;
  errors?: Partial<Record<CutsField, string>>;
  onChange: (field: CutsField, value: string) => void;
  /** Litros de vino base que entran al alambique (para el total de cortes). */
  inputVolumeLiters: number | null;
  disabled?: boolean;
}) {
  const head = parseDecimal(values.headDiscardLiters) ?? 0;
  const heart = parseDecimal(values.heartYieldLiters) ?? 0;
  const tail = parseDecimal(values.tailDiscardLiters) ?? 0;
  const total = head + heart + tail;
  const over = inputVolumeLiters !== null && inputVolumeLiters > 0 && total > inputVolumeLiters;

  const cut = (field: CutsField, label: string, help: string, key = false) => (
    <Field
      label={label}
      help={help}
      error={errors[field]}
      required={key}
      className={cn(key && "rounded-md bg-accent-soft p-3")}
    >
      <Input
        size="lg"
        numeric
        suffix={field === "initialAlcoholPercentage" ? "% vol" : "L"}
        value={values[field]}
        disabled={disabled}
        onChange={(e) => onChange(field, e.target.value)}
        className={cn(key && "border-2 border-accent font-medium")}
      />
    </Field>
  );

  return (
    <div className="grid gap-3">
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cut("headDiscardLiters", "Cabeza", "Descarte inicial.")}
        {cut("heartYieldLiters", "Corazón", "Rendimiento: el singani del lote.", true)}
        {cut("tailDiscardLiters", "Cola", "Descarte final.")}
        {cut("initialAlcoholPercentage", "Grado inicial", "Del destilado al salir.")}
      </div>
      <p className={cn("m-0 text-sm tabular-nums", over ? "text-danger" : "text-fg-muted")} aria-live="polite">
        Cortes: {fmtNumber(total)} L
        {inputVolumeLiters !== null && inputVolumeLiters > 0
          ? ` de ${fmtNumber(inputVolumeLiters)} L de entrada${over ? " · superan la entrada" : ""}`
          : ""}
      </p>
    </div>
  );
}
