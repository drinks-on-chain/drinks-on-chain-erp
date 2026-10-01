import type { NextRequest } from "next/server";
import { proxyApiRequest } from "@/lib/api-proxy";

/**
 * P-1 + O1-OPS-1: `/api/v1/*` se reescribe a `${API_ORIGIN}/v1/*` con la IP del cliente firmada
 * (`src/lib/api-proxy.ts`). Con `NEXT_PUBLIC_MOCKS=1` y sin `API_ORIGIN` no hace nada: MSW
 * responde en el navegador.
 */
export function proxy(request: NextRequest) {
  return proxyApiRequest(request);
}

export const config = {
  matcher: "/api/v1/:path*",
};
