"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Spinner, Toaster, toast } from "@drinks-on-chain/ui";
import { bootstrapSession, setSessionEndedHandler } from "@/lib/api/client";
import { env } from "@/lib/env";
import { es } from "@/lib/i18n/es";
import { makeQueryClient } from "@/lib/query-client";

/** Con NEXT_PUBLIC_MOCKS=1 no pinta la app hasta que MSW intercepta las peticiones. */
function MocksGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!env.mocks);
  useEffect(() => {
    if (!env.mocks) return;
    // MSW responde en /api/v1/* de este origen (P-1).
    import("@drinks-on-chain/mocks/browser")
      // Los enlaces de los correos del buzón simulado llevan a este origen (cualquier puerto).
      .then(({ startMockWorker }) => startMockWorker({ quiet: true, appUrls: { ERP: window.location.origin } }))
      .then(() => setReady(true));
  }, []);
  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <Spinner label={es.common.loading} />
      </div>
    );
  }
  return children;
}

/**
 * Recupera la sesión al arrancar (renovación con la cookie) y reacciona cuando termina:
 * caducada o revocada (reutilización del refresco, bloqueo) → aviso y login.
 */
function SessionLifecycle() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    void bootstrapSession();
  }, []);
  useEffect(() => {
    setSessionEndedHandler((reason) => {
      queryClient.clear();
      toast({ title: reason === "revoked" ? es.auth.revoked : es.auth.expired, tone: "warning" });
      router.replace("/login");
    });
  }, [router, queryClient]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <MocksGate>
      <QueryClientProvider client={queryClient}>
        <SessionLifecycle />
        {children}
        <Toaster />
      </QueryClientProvider>
    </MocksGate>
  );
}
