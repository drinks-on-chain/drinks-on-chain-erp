"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useIsAuthenticated, useLogin } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

export function LoginForm() {
  const router = useRouter();
  const loginMutation = useLogin();
  const authenticated = useIsAuthenticated();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Con una sesión recuperada al arrancar (cookie de renovación) no hace falta entrar.
  useEffect(() => {
    if (authenticated) router.replace("/");
  }, [authenticated, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate({ email, password }, { onSuccess: () => router.replace("/") });
  }

  const error = loginMutation.error;
  // 422 del backend: cada mensaje junto a su campo (details[].field).
  const { fieldErrors, formErrors } = fieldErrorsFrom(error, ["email", "password"]);
  const message =
    error instanceof ApiError && error.isUnauthorized
      ? es.auth.invalid
      : error instanceof ApiError && error.isValidation
        ? formErrors.join(" ")
        : error && errorMessage(error);

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
      {message && <Alert tone="danger">{message}</Alert>}
      <Field label={es.auth.email} required error={fieldErrors.email}>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={es.auth.password} required error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={loginMutation.isPending}>
        {loginMutation.isPending ? es.auth.submitting : es.auth.submit}
      </Button>
      <p className="text-center text-sm">
        <Link href="/recuperar" className="text-accent-text hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}
