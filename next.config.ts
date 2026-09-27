import type { NextConfig } from "next";
import { API_BASE, resolveApiOrigin } from "./src/lib/env";

// `next typegen` (pnpm typecheck) también carga la configuración y evalúa las reescrituras;
// ahí no se exige API_ORIGIN, porque no se sirve ni se despliega nada.
const typegenOnly = process.argv.includes("typegen");

const nextConfig: NextConfig = {
  // P-1 (contrato de la Ola 0 §7): la app llama a /api/v1/* de su propio origen y Next lo
  // reenvía a ${API_ORIGIN}/v1/*, así la cookie de renovación `doc_rt` es de primera parte.
  // Con NEXT_PUBLIC_MOCKS=1 no hay reescritura: MSW responde en el navegador. Las reescrituras
  // se fijan en el build: API_ORIGIN tiene que estar definida al construir.
  async rewrites() {
    if (typegenOnly && !process.env.API_ORIGIN) return [];
    const origin = resolveApiOrigin();
    if (!origin) return [];
    return [{ source: `${API_BASE}/v1/:path*`, destination: `${origin}/v1/:path*` }];
  },
};

export default nextConfig;
