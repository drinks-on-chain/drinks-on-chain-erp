import type { NextConfig } from "next";
import { API_BASE, resolveApiOrigin } from "./src/lib/env";

// `next typegen` (pnpm typecheck) también carga la configuración; ahí no se exige API_ORIGIN,
// porque no se sirve ni se despliega nada.
const typegenOnly = process.argv.includes("typegen");

// P-1 (contrato de la Ola 0 §7): la app llama a /api/v1/* de su propio origen y `src/proxy.ts`
// lo reescribe a ${API_ORIGIN}/v1/* con la IP del cliente firmada (O1-OPS-1), así la cookie de
// renovación `doc_rt` es de primera parte. API_ORIGIN se valida también al construir para que un
// despliegue sin ella falle en el build y no en la primera petición.
if (!typegenOnly) resolveApiOrigin();

const nextConfig: NextConfig = {
  async headers() {
    // Las respuestas de la API reescrita nunca se guardan en la caché de Vercel
    return [
      {
        source: `${API_BASE}/v1/:path*`,
        headers: [{ key: "x-vercel-enable-rewrite-caching", value: "0" }],
      },
    ];
  },
};

export default nextConfig;
