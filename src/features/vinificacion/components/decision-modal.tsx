"use client";

import { useState, type ReactNode } from "react";
import { Button, Checkbox, Modal, cn, focusRing } from "@drinks-on-chain/ui";

export type DecisionOption<V extends string> = {
  value: V;
  title: string;
  subtitle: string;
  icon: ReactNode;
  disabled?: boolean;
  /** Por qué la opción no está disponible (se muestra bajo el título). */
  disabledReason?: ReactNode;
};

export type DecisionModalProps<V extends string> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  options: readonly DecisionOption<V>[];
  /** Texto de la casilla de confirmación explícita. */
  acknowledgement: ReactNode;
  confirmLabel: string;
  onConfirm: (value: V) => void;
  confirming?: boolean;
  /** Error del backend al confirmar (ya maquetado, p. ej. un Alert). */
  error?: ReactNode;
};

/**
 * Decisión irreversible con dos opciones masivas (05 §3.3, 01-erp.html §06): se elige una,
 * se confirma de forma explícita y solo entonces se habilita el botón.
 */
export function DecisionModal<V extends string>({
  open,
  onOpenChange,
  title,
  description,
  options,
  acknowledgement,
  confirmLabel,
  onConfirm,
  confirming = false,
  error,
}: DecisionModalProps<V>) {
  const [value, setValue] = useState<V | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const chosen = options.find((o) => o.value === value && !o.disabled);

  const change = (next: boolean) => {
    if (confirming) return;
    if (!next) {
      setValue(null);
      setAcknowledged(false);
    }
    onOpenChange(next);
  };

  return (
    <Modal
      open={open}
      onOpenChange={change}
      title={title}
      description={description}
      size="lg"
      dismissible={!confirming}
      footer={
        <>
          <Button variant="secondary" onClick={() => change(false)} disabled={confirming}>
            Cancelar
          </Button>
          <Button
            onClick={() => chosen && onConfirm(chosen.value)}
            disabled={!chosen || !acknowledged}
            loading={confirming}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div role="group" aria-label="Opciones" className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                disabled={o.disabled || confirming}
                onClick={() => setValue(o.value)}
                className={cn(
                  "grid min-h-36 content-start gap-2 rounded-md border bg-bg-raised p-4 text-left transition-colors",
                  focusRing,
                  selected
                    ? "border-accent bg-accent-soft ring-1 ring-accent"
                    : "border-border hover:border-border-strong",
                  o.disabled && "cursor-not-allowed opacity-70",
                )}
              >
                <span aria-hidden className="text-accent-text">
                  {o.icon}
                </span>
                <strong className="text-lg">{o.title}</strong>
                <span className="text-sm text-fg-muted">{o.subtitle}</span>
                {o.disabled && o.disabledReason && <span className="text-xs text-warning">{o.disabledReason}</span>}
              </button>
            );
          })}
        </div>
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(c) => setAcknowledged(c === true)}
          disabled={!chosen || confirming}
          label={acknowledgement}
        />
        {error}
      </div>
    </Modal>
  );
}
