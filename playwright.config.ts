import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// En local se usa el Chrome instalado; en CI, el Chromium que instala Playwright.
const channel = process.env.CI ? undefined : "chrome";

// Las pruebas de flujo corren contra los mocks. Con E2E_REAL_API=1 solo corre
// e2e/backend-real.spec.ts, con MSW apagado, contra E2E_API_ORIGIN (por defecto el backend de
// desarrollo). Por compatibilidad, E2E_REAL_API también puede ser directamente el origen.
const DEV_API_ORIGIN = "https://136.243.223.39.sslip.io";
const realFlag = process.env.E2E_REAL_API?.trim();
const REAL_API = realFlag
  ? process.env.E2E_API_ORIGIN?.trim() || (/^https?:\/\//.test(realFlag) ? realFlag : DEV_API_ORIGIN)
  : undefined;

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
    env: REAL_API ? { NEXT_PUBLIC_MOCKS: "0", API_ORIGIN: REAL_API } : { NEXT_PUBLIC_MOCKS: "1" },
  },
});
