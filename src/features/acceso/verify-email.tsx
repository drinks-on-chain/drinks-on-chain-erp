"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Alert, Button, Spinner } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useVerifyEmail } from "@/lib/auth/hooks";

/** Verifica el correo al abrir el enlace (una sola vez) y cuenta el resultado. */
export function VerifyEmail({ token }: { token: string }) {
  const verify = useVerifyEmail();
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    verify.mutate(token);
  }, [token, verify]);

  const done = (
    <Button asChild size="lg">
      <Link href="/login">Ir a iniciar sesión</Link>
    </Button>
  );

  if (!token || verify.isError) {
    const invalid = !token || (verify.error instanceof ApiError && verify.error.isValidation);
    return (
      <div className="grid grid-cols-1 gap-4">
        <Alert tone="warning" title={invalid ? "El enlace no es válido" : "No se pudo verificar"}>
          {invalid
            ? "Ya se usó o está incompleto. Si tu correo ya está verificado, puedes entrar sin más."
            : errorMessage(verify.error)}
        </Alert>
        {done}
      </div>
    );
  }
  if (verify.isSuccess) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <Alert tone="success" title="Correo verificado">
          Gracias: tu correo quedó confirmado.
        </Alert>
        {done}
      </div>
    );
  }
  return (
    <div className="grid place-items-center py-8" aria-busy="true">
      <Spinner label="Verificando tu correo…" />
    </div>
  );
}
