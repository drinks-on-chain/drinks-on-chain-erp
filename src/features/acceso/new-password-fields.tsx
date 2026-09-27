"use client";

import { useId } from "react";
import { Check, Circle } from "lucide-react";
import { Field, Input } from "@drinks-on-chain/ui";
import { passwordRules, type NewPasswordErrors } from "./password-policy";

/**
 * Contraseña nueva y su confirmación con los requisitos a la vista (contrato de la Ola 1 §1):
 * cada requisito se marca al cumplirse y queda asociado al campo para los lectores de pantalla.
 */
export function NewPasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  errors,
  passwordLabel = "Contraseña nueva",
}: {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  errors: NewPasswordErrors;
  passwordLabel?: string;
}) {
  const rulesId = useId();
  const rules = passwordRules(password, confirm);
  return (
    <>
      <Field label={passwordLabel} required error={errors.password}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          aria-describedby={rulesId}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </Field>
      <ul id={rulesId} aria-label="Requisitos de la contraseña" className="m-0 -mt-2 grid list-none gap-1 p-0 text-sm">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={rule.ok ? "flex items-center gap-2 text-success-text" : "flex items-center gap-2 text-fg-muted"}
          >
            {rule.ok ? <Check aria-hidden size={16} /> : <Circle aria-hidden size={12} className="mx-0.5" />}
            <span>
              {rule.label}
              <span className="sr-only">{rule.ok ? " (cumplido)" : " (pendiente)"}</span>
            </span>
          </li>
        ))}
      </ul>
      <Field label="Repite la contraseña" required error={errors.confirm}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
        />
      </Field>
    </>
  );
}
