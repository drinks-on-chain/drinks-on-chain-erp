import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";

export function makeQueryClient() {
  return new QueryClient({
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
}
