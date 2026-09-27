"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Button } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useResetPassword } from "@/lib/auth/hooks";
import { NewPasswordFields } from "./new-password-fields";
import { passwordApiErrors, validateNewPassword, type NewPasswordErrors } from "./password-policy";

/**
 * `POST /v1/auth/reset-password`: guarda la contraseña nueva y cierra todas las sesiones de la
 * persona. Un enlace usado o caducado responde 422 `AUTH_RESET_TOKEN_INVALID`.
 */
export function ResetForm({ token }: { token: string }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<NewPasswordErrors>({});
  const [invalidLink, setInvalidLink] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateNewPassword(password, confirm);
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    reset.mutate(
      { token, password },
      {
        onError: (err) => {
          if (err instanceof ApiError && err.code === "AUTH_RESET_TOKEN_INVALID") {
            setInvalidLink(true);
            return;
          }
          const mapped = passwordApiErrors(err, ["password"] as const);
          setErrors(mapped.errors);
          setFormError(mapped.formError ?? (Object.keys(mapped.errors).length ? null : errorMessage(err)));
        },
      },
    );
  };

  if (reset.isSuccess) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <Alert tone="success" title="Contraseña cambiada">
          Ya puedes entrar con tu contraseña nueva. Por seguridad cerramos las sesiones que tenías abiertas.
        </Alert>
        <Button asChild size="lg">
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (invalidLink) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <Alert tone="warning" title="El enlace ya no vale">
          Caducó (dura 60 minutos) o ya se usó. Pide uno nuevo y ábrelo desde el último correo que recibas.
        </Alert>
        <Button asChild size="lg">
          <Link href="/recuperar">Pedir otro enlace</Link>
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPasswordChange={setPassword}
        onConfirmChange={setConfirm}
        errors={errors}
      />
      <Button type="submit" size="lg" loading={reset.isPending}>
        Guardar contraseña
      </Button>
      <p className="m-0 text-center text-sm">
        <Link href="/login" className="text-accent-text hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
