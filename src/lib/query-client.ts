import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { meQueryKey } from "@/lib/auth/keys";
import { flagOrgInactive } from "@/lib/auth/org-status";

export function makeQueryClient() {
  // Un 403 `ORG_NOT_ACTIVE` (la bodega se suspendió o revocó a mitad de la sesión) avisa al shell,
  // que muestra la pantalla de bodega no activa, y vuelve a leer `me` para conocer el estado.
  const onError = (error: unknown) => {
    if (flagOrgInactive(error)) void client.invalidateQueries({ queryKey: meQueryKey });
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // No se reintenta lo que no va a cambiar (4xx); sí los fallos de red y 5xx.
        retry: (count, error) => {
          if (error instanceof ApiError && error.status < 500) return false;
          return count < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  return client;
}
