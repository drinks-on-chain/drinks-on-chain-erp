"use client";

import { Field, Input, cn } from "@drinks-on-chain/ui";
import { parseDecimal, fmtNumber } from "@/lib/format";

export type CutsField = "headsLiters" | "heartLiters" | "tailsLiters" | "heartAbvPercent" | "vinasseLiters";
export type CutsValues = Record<CutsField, string>;

/**
 * Cortes del alambique (05 §3.3 StillCutsForm, 01-erp.html §07): cabezas, corazón (el campo clave,
 * en oro), colas y grado del corazón. Muestra cuánto suman los cortes frente a la entrada; que no
 * la superen (balance de masa) lo comprueba el servidor al cerrar.
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
  /** Litros de vino base que entraron al alambique (para el total de cortes). */
  inputVolumeLiters: number | null;
  disabled?: boolean;
}) {
  const sum = (["headsLiters", "heartLiters", "tailsLiters", "vinasseLiters"] as const).reduce(
    (total, f) => total + (parseDecimal(values[f]) ?? 0),
    0,
  );

  const cut = (field: CutsField, label: string, help: string, { key = false, required = true } = {}) => (
    <Field
      label={label}
      help={help}
      error={errors[field]}
      required={required}
      className={cn(key && "rounded-md bg-accent-soft p-3")}
    >
      <Input
        size="lg"
        numeric
        suffix={field === "heartAbvPercent" ? "% vol" : "L"}
        value={values[field]}
        disabled={disabled}
        onChange={(e) => onChange(field, e.target.value)}
        className={cn(key && "border-2 border-accent font-medium")}
      />
    </Field>
  );

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cut("headsLiters", "Cabezas", "Descarte inicial.")}
        {cut("heartLiters", "Corazón", "Rendimiento: el singani del lote.", { key: true })}
        {cut("tailsLiters", "Colas", "Descarte final.")}
        {cut("heartAbvPercent", "Grado del corazón", "Decide el alcohol puro del lote.")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cut("vinasseLiters", "Vinaza", "Opcional. Residuo del alambique.", { required: false })}
      </div>
      <p className="m-0 text-sm text-fg-muted tabular-nums" aria-live="polite">
        Cortes: {fmtNumber(sum)} L
        {inputVolumeLiters !== null && inputVolumeLiters > 0 ? ` de ${fmtNumber(inputVolumeLiters)} L de entrada` : ""}
      </p>
    </div>
  );
}
