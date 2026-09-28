import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// En local se usa el Chrome instalado; en CI, el Chromium que instala Playwright.
const channel = process.env.CI ? undefined : "chrome";

// Las pruebas de flujo corren contra los mocks. Con E2E_REAL_API=1 solo corre
// e2e/backend-real.spec.ts, con MSW apagado, contra E2E_API_ORIGIN (por defecto el backend de
// desarrollo). Por compatibilidad, E2E_REAL_API también puede ser directamente el origen.
const DEV_API_ORIGIN = "https://136.243.223.39.sslip.io";
/** Clave de sitio de prueba pública de Cloudflare Turnstile (la misma que `src/lib/env.ts`). */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const realFlag = process.env.E2E_REAL_API?.trim();
const REAL_API = realFlag
  ? process.env.E2E_API_ORIGIN?.trim() || (/^https?:\/\//.test(realFlag) ? realFlag : DEV_API_ORIGIN)
  : undefined;

// Contra el backend real, sin la instantánea de la página que Playwright escribe en
// `error-context.md` al fallar: incluye el valor de los campos de contraseña (la de demostración).
if (REAL_API) process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: REAL_API ? "backend-real.spec.ts" : undefined,
  testIgnore: REAL_API ? undefined : "backend-real.spec.ts",
  fullyParallel: !REAL_API,
  // Contra el backend real, de una en una (límites por IP del login y la renovación).
  workers: REAL_API ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  // Contra el backend real no se reintenta: cada intento suma logins a los límites por IP.
  retries: process.env.CI && !REAL_API ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // MSW arranca en el navegador y la sesión se recupera al cargar: margen para máquinas cargadas.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-BO",
    // Contra el backend real, una acción atascada falla en 30 s en vez de agotar la prueba entera.
    actionTimeout: REAL_API ? 30_000 : undefined,
    // Contra el backend real no hay trazas: guardarían la contraseña de demostración que se teclea.
    trace: REAL_API ? "off" : "retain-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], channel } },
    { name: "tablet", use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium", channel } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Con backend real, Next reescribe /api/v1/* a ${API_ORIGIN}/v1/* (P-1).
    // Recuperar la contraseña necesita Turnstile: sin clave propia, la de prueba pública de
    // Cloudflare (siempre valida; el backend de desarrollo usa su secreto de prueba).
    env: REAL_API
      ? {
          NEXT_PUBLIC_MOCKS: "0",
          API_ORIGIN: REAL_API,
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY,
        }
      : { NEXT_PUBLIC_MOCKS: "1" },
  },
});
