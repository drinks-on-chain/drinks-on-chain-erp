"use client";

import { Check, TriangleAlert } from "lucide-react";
import { Card, Field, Input, cn } from "@drinks-on-chain/ui";
import { fmtNumber, parseDecimal } from "@/lib/format";
import { readingState, stateText, targetText, type LabTarget } from "../lab-targets";

export type LabReadingCardProps = {
  target: LabTarget;
  /** Texto (editable) o número (lectura registrada). */
  value: string | number | null | undefined;
  /** Si se pasa, la tarjeta es editable; si no, muestra la lectura. */
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  name?: string;
  className?: string;
};

/**
 * Lectura de laboratorio (05 §3.3): valor grande, objetivo y estado. Ámbar fuera de objetivo
 * (no bloquea: el dictamen lo decide quien inspecciona). Táctil ≥ 56 px en modo edición.
 */
export function LabReadingCard({ target, value, onChange, error, required, name, className }: LabReadingCardProps) {
  const numeric = typeof value === "number" ? value : parseDecimal(value ?? "", { grouping: target.key !== "ph" });
  const state = readingState(numeric, target);
  const out = state === "low" || state === "high";
  const status = (
    <span
      className={cn("inline-flex items-center justify-center gap-1", out ? "font-medium text-fg" : "text-fg-subtle")}
    >
      {out ? (
        <TriangleAlert aria-hidden size={14} className="text-warning" />
      ) : state === "in" ? (
        <Check aria-hidden size={14} />
      ) : null}
      {stateText(state)}
    </span>
  );

  return (
    <Card
      padding="md"
      data-state={state}
      className={cn("grid content-start gap-2 text-center", out && "border-warning bg-warning-soft", className)}
    >
      {onChange ? (
        <Field
          label={target.label}
          required={required}
          error={error}
          help={
            <span className="grid gap-0.5">
              <span>{targetText(target)}</span>
              {status}
            </span>
          }
          className="justify-items-stretch [&>label]:justify-self-center"
        >
          <Input
            name={name}
            value={typeof value === "number" ? String(value) : (value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="—"
            className="min-h-20 px-2 text-center text-4xl font-medium tabular-nums"
          />
        </Field>
      ) : (
        <>
          <span className="font-ui text-sm font-medium text-fg">{target.label}</span>
          <span className="font-ui text-4xl font-medium tabular-nums">
            {numeric == null ? "—" : fmtNumber(numeric, target.digits)}
            {target.unit ? <span className="ml-1 text-lg text-fg-muted">{target.unit}</span> : null}
          </span>
          <span className="text-xs text-fg-subtle">{targetText(target)}</span>
          <span className="text-xs">{status}</span>
        </>
      )}
    </Card>
  );
}
