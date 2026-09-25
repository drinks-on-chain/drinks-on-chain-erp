"use client";

import type { ReactNode } from "react";
import { Field, Input, cn } from "@drinks-on-chain/ui";

export type BigNumberInputProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** Unidad en el sufijo ("kg", "L"). */
  unit: string;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * Input de báscula (05 §3.3): cifra de 64 px con la unidad como sufijo, fondo hundido y
 * teclado numérico en tablet. Objetivo táctil muy por encima de 56 px.
 */
export function BigNumberInput({
  label,
  value,
  onChange,
  unit,
  help,
  error,
  required,
  disabled,
  name,
  id,
  placeholder = "0",
  autoFocus,
  className,
}: BigNumberInputProps) {
  return (
    <Field
      label={label}
      help={help}
      error={error}
      required={required}
      disabled={disabled}
      htmlFor={id}
      className={className}
    >
      <Input
        giant
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        placeholder={placeholder}
        autoFocus={autoFocus}
        suffix={unit}
        className="text-5xl md:text-6xl"
      />
    </Field>
  );
}

/** Lectura grande de solo lectura con el mismo aspecto (p. ej. el peso neto calculado). */
export function BigNumberReadout({
  label,
  value,
  unit,
  help,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit: string;
  help?: ReactNode;
  tone?: "neutral" | "accent" | "warning";
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1", className)}>
      <span className="font-ui text-sm font-medium text-fg">{label}</span>
      <output
        aria-live="polite"
        className={cn(
          "flex min-h-28 items-center justify-end gap-3 rounded-md border px-6 font-ui tabular-nums",
          tone === "accent" && "border-accent bg-accent-soft",
          tone === "warning" && "border-warning bg-warning-soft",
          tone === "neutral" && "border-border bg-bg-sunken",
        )}
      >
        <span className="text-5xl font-medium tracking-[0.02em] md:text-6xl">{value}</span>
        <span className="text-2xl font-medium text-fg-muted">{unit}</span>
      </output>
      {help ? <p className="m-0 text-xs text-fg-subtle">{help}</p> : null}
    </div>
  );
}
