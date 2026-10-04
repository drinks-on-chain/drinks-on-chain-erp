"use client";

import { useState, type ReactNode } from "react";
import { Button, ReasonDialog, type ButtonProps } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { isRuleError } from "@/lib/api/rule-violations";
import { RuleViolationNotice } from "./rule-violation-notice";

type Props = {
  /** Texto del botón que abre el diálogo. */
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  /** Acción que no se deshace (descartar, anular): botón rojo en el diálogo. */
  destructive?: boolean;
  /** Longitud mínima del motivo (contrato: 3; correcciones: 10). */
  minLength?: number;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /** Contenido extra del diálogo, sobre el motivo (p. ej. una casilla). */
  children?: ReactNode;
  /** Recibe el motivo; si el servidor lo rechaza, debe lanzar el error. */
  onConfirm: (reason: string) => Promise<unknown>;
};

/**
 * Acción con motivo obligatorio (descartar una crianza, una destilación o un lote; anular un
 * código de botella): el motivo queda en la bitácora y en la línea de tiempo. Si el servidor
 * rechaza la acción por una regla, el aviso lo explica bajo el botón.
 */
export function ReasonAction({
  label,
  title,
  description,
  confirmLabel,
  destructive = false,
  minLength = 3,
  variant = "secondary",
  size,
  children,
  onConfirm,
}: Props) {
  const [ruleError, setRuleError] = useState<unknown>(null);
  return (
    <div className="grid justify-items-start gap-3">
      <ReasonDialog
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        destructive={destructive}
        minLength={minLength}
        trigger={
          <Button variant={variant} size={size} onClick={() => setRuleError(null)}>
            {label}
          </Button>
        }
        onConfirm={async (reason) => {
          try {
            await onConfirm(reason);
          } catch (err) {
            // Una regla de la trazabilidad se explica con su aviso; el resto, en el propio diálogo.
            if (isRuleError(err)) setRuleError(err);
            else throw new Error(errorMessage(err), { cause: err });
          }
        }}
      >
        {children}
      </ReasonDialog>
      <RuleViolationNotice error={ruleError} />
    </div>
  );
}
