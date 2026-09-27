"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Alert, Button, Field, Input } from "@drinks-on-chain/ui";
import { Turnstile } from "@/components/turnstile";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useForgotPassword } from "@/lib/auth/hooks";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pide el enlace de recuperación (`POST /v1/auth/forgot-password` con `captchaToken`). El backend
 * responde 202 siempre, exista o no el correo: la pantalla de confirmación no revela nada.
 */
export function RecoverForm() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  // Cada envío consume el token de Turnstile: cambiar la clave vuelve a montar el widget.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [errors, setErrors] = useState<{ email?: string; captchaToken?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    const next: typeof errors = {};
    if (!EMAIL.test(address)) next.email = "Indica el correo con el que entras al ERP.";
    if (!token) next.captchaToken = "Completa la verificación anti-robots.";
    setErrors(next);
    if (Object.keys(next).length || !token) return;
    forgot.mutate(
      { email: address, captchaToken: token },
      {
        onSuccess: () => setSentTo(address),
        onError: (err) => {
          setCaptchaKey((k) => k + 1);
          const { fieldErrors } = fieldErrorsFrom(err, ["email", "captchaToken"] as const);
          setErrors(fieldErrors);
        },
      },
    );
  };

  if (sentTo) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <Alert tone="success" icon={<MailCheck aria-hidden size={20} />} title="Revisa tu correo">
          Si {sentTo} tiene una cuenta en Drinks on Chain, te llegará un enlace para elegir una contraseña nueva. Caduca
          en 60 minutos y solo se puede usar una vez.
        </Alert>
        <p className="m-0 text-sm text-fg-muted">
          ¿No llega? Mira en la carpeta de correo no deseado o vuelve a pedirlo en unos minutos.
        </p>
        <Button asChild variant="secondary" size="lg">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  const error = forgot.error;
  const general =
    error && !(error instanceof ApiError && error.isValidation && Object.keys(errors).length)
      ? errorMessage(error)
      : null;

  return (
    <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-4">
      <p className="m-0 text-fg-muted">Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.</p>
      {general && <Alert tone="danger">{general}</Alert>}
      <Field label="Correo electrónico" required error={errors.email}>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Turnstile key={captchaKey} onToken={setToken} />
      {errors.captchaToken && (
        <p role="alert" className="m-0 text-xs text-danger-text">
          {errors.captchaToken}
        </p>
      )}
      <Button type="submit" size="lg" loading={forgot.isPending}>
        Enviar enlace
      </Button>
      <p className="m-0 text-center text-sm">
        <Link href="/login" className="text-accent-text hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
