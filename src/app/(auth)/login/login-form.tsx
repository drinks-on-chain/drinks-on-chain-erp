"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useLogin } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

export function LoginForm() {
  const router = useRouter();
  const loginMutation = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate({ email, password }, { onSuccess: () => router.replace("/") });
  }

  const error = loginMutation.error;
  const message = error instanceof ApiError && error.isUnauthorized ? es.auth.invalid : error && errorMessage(error);

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
      {message && <Alert tone="danger">{message}</Alert>}
      <Field label={es.auth.email} required>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={es.auth.password} required>
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
