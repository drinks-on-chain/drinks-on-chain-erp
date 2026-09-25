"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { Spinner, Toaster, toast } from "@drinks-on-chain/ui";
import { setSessionExpiredHandler } from "@/lib/api/client";
import { env } from "@/lib/env";
import { es } from "@/lib/i18n/es";
import { makeQueryClient } from "@/lib/query-client";

/** Con NEXT_PUBLIC_MOCKS=1 no pinta la app hasta que MSW intercepta las peticiones. */
function MocksGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!env.mocks);
  useEffect(() => {
    if (!env.mocks) return;
    import("@drinks-on-chain/mocks/browser")
      .then(({ startMockWorker }) => startMockWorker({ baseUrl: env.apiUrl || undefined, quiet: true }))
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

function SessionExpiry() {
  const router = useRouter();
  useEffect(() => {
    setSessionExpiredHandler(() => {
      toast({ title: es.auth.expired, tone: "warning" });
      router.replace("/login");
    });
  }, [router]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <MocksGate>
      <QueryClientProvider client={queryClient}>
        <SessionExpiry />
        {children}
        <Toaster />
      </QueryClientProvider>
    </MocksGate>
  );
}
