import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// En local se usa el Chrome instalado; en CI, el Chromium que instala Playwright.
const channel = process.env.CI ? undefined : "chrome";

// Las pruebas de flujo corren contra los mocks. Con E2E_REAL_API=<url del backend> solo corre
// e2e/backend-real.spec.ts, con MSW apagado (integración temprana, 03 §4 1G).
const REAL_API = process.env.E2E_REAL_API;

export default defineConfig({
  testDir: "./e2e",
  testMatch: REAL_API ? "backend-real.spec.ts" : undefined,
  testIgnore: REAL_API ? undefined : "backend-real.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-BO",
    trace: "retain-on-failure",
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
    env: { NEXT_PUBLIC_MOCKS: REAL_API ? "0" : "1", NEXT_PUBLIC_API_URL: REAL_API ?? "" },
  },
});
