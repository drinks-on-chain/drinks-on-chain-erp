import { expect, test, type Page } from "@playwright/test";
import { login, settled } from "./support";

// 1G · Estados vacío y error de cada listado (y de las fichas) con los escenarios de los mocks.
// El escenario se fija en localStorage tras entrar (el login no depende de él). Los listados se abren
// desde la barra lateral partiendo de /perfil recargado: la sesión (`me`) sigue en caché y ninguna
// lista viene de la caché de TanStack Query. Las fichas se recargan con el escenario ya activo.

type Scenario = "normal" | "empty" | "error";

// El paquete solo exporta ESM ("import"): se carga con import() dinámico.
let SCENARIO_STORAGE_KEY = "";
test.beforeAll(async () => {
  ({ SCENARIO_STORAGE_KEY } = await import("@drinks-on-chain/mocks/handlers"));
});

async function setMockScenario(page: Page, scenario: Scenario) {
  await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [SCENARIO_STORAGE_KEY, scenario]);
}

// Los 500 reintentan dos veces con espera (query-client.ts): el ErrorState tarda unos segundos.
const SLOW = { timeout: 20_000 };

const LISTS: { path: string; nav: string; empty: string[]; content: RegExp }[] = [
  { path: "/", nav: "Panel", empty: ["Todo al día", "Sin candados"], content: /Tareas pendientes/ },
  { path: "/lotes", nav: "Lotes", empty: ["Aún no hay lotes"], content: /HARV-2026-/ },
  { path: "/origen", nav: "Origen y terroirs", empty: ["Aún no hay terroirs"], content: /Moscatel/ },
  {
    path: "/vendimia",
    nav: "Vendimia y laboratorio",
    empty: ["Aún no hay ingresos de uva"],
    content: /HARV-2026-/,
  },
  { path: "/vinificacion", nav: "Vinificación", empty: ["Aún no hay tanques"], content: /TK-0/ },
  { path: "/crianza", nav: "Crianza", empty: ["Ninguna crianza todavía"], content: /BAR-/ },
  { path: "/destilacion", nav: "Destilación y reposo", empty: ["Ninguna destilación todavía"], content: /Alambique/ },
  { path: "/envasado", nav: "Envasado y QR", empty: ["Aún no hay embotellados"], content: /CVJ-2026-/ },
  { path: "/cuenta", nav: "Cuenta Stellar", empty: ["Aún no hay lotes embotellados"], content: /CVJ-2026-/ },
  { path: "/ajustes", nav: "Ajustes", empty: ["Sin miembros"], content: /cintiviejo\.test/ },
];

/** Entra, recarga en /perfil (sin listas en caché), activa el escenario y abre el listado desde el menú. */
async function openList(page: Page, nav: string, scenario: Scenario) {
  await login(page, "admin@cintiviejo.test");
  await page.goto("/perfil");
  await settled(page);
  await setMockScenario(page, scenario);
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: nav, exact: true })
    .click();
}

// Cada listado de la bodega vacía ofrece salir del vacío: su acción principal dentro del EmptyState.
const EMPTY_ACTIONS: Record<string, string> = {
  "/lotes": "Registrar ingreso",
  "/origen": "Nuevo terroir",
  "/vendimia": "Registrar ingreso",
  "/vinificacion": "Llenar tanque",
  "/crianza": "Iniciar crianza",
  "/destilacion": "Registrar destilación",
  "/envasado": "Nuevo embotellado",
  "/ajustes": "Añadir miembro",
};

// Fichas: se abren desde su listado ya cargado, con el escenario "error" activado después.
// La ficha de lote no aparece: se deriva de los mismos listados que /lotes (ya cubierto).
const DETAILS: { list: string; detail: string }[] = [
  { list: "/origen", detail: "/origen/e26c2890-b4e4-5973-aec2-0f092355ad3b" },
  { list: "/vendimia", detail: "/vendimia/2a643ce2-9f17-5017-9d6a-b4eb661d4648" },
  { list: "/vinificacion", detail: "/vinificacion/d78d6307-f96b-533b-8f6e-710f6533bb42" },
  { list: "/crianza", detail: "/crianza/a48ddc67-0e24-51fe-a43d-877f55ac9de6" },
  { list: "/destilacion", detail: "/destilacion/e58a7714-0a95-5cc4-8fd8-07999cb576e3" },
  { list: "/envasado", detail: "/envasado/afef7d2a-4817-556f-ae16-24b38eee217a" },
];

const errorAlerts = (page: Page) => page.getByRole("alert").filter({ hasText: /No se pudo/ });

async function expectErrorThenRetry(page: Page) {
  await expect(errorAlerts(page).first()).toBeVisible(SLOW);
  await expect(page.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
  await setMockScenario(page, "normal");
  // Algunas pantallas muestran varios ErrorState (una tarjeta por fuente): se reintenta cada uno.
  for (let i = 0; i < 5 && (await errorAlerts(page).count()) > 0; i++) {
    const retry = errorAlerts(page).first().getByRole("button", { name: "Reintentar" });
    if ((await retry.count()) === 0) break;
    await retry.click();
    await page.waitForTimeout(600);
  }
  await expect(errorAlerts(page)).toHaveCount(0, SLOW);
}

test.describe("escenario empty", () => {
  for (const { path, nav, empty } of LISTS) {
    test(`vacío en ${path}`, async ({ page }) => {
      await openList(page, nav, "empty");
      for (const title of empty) await expect(page.getByRole("heading", { name: title })).toBeVisible(SLOW);
      const action = EMPTY_ACTIONS[path];
      if (action) {
        const state = page.locator("div", { has: page.getByRole("heading", { name: empty[0] }) }).last();
        await expect(
          state.getByRole("link", { name: action }).or(state.getByRole("button", { name: action })),
        ).toBeVisible();
      }
    });
  }
});

test.describe("escenario error", () => {
  for (const { path, nav, content } of LISTS) {
    test(`error y reintento en ${path}`, async ({ page }) => {
      await openList(page, nav, "error");
      await expectErrorThenRetry(page);
      await expect(page.getByText(content).first()).toBeVisible();
    });
  }

  for (const { list, detail } of DETAILS) {
    test(`error y reintento en ${detail}`, async ({ page }) => {
      await login(page, "admin@cintiviejo.test");
      await page.goto(list);
      await settled(page);
      await setMockScenario(page, "error");
      await page.locator(`a[href="${detail}"]`).first().click();
      await expectErrorThenRetry(page);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }

  test("error al cargar la sesión y reintento", async ({ page }) => {
    await login(page, "admin@cintiviejo.test");
    await setMockScenario(page, "error");
    await page.goto("/perfil");
    await expect(page.getByRole("heading", { name: "No se pudo cargar tu sesión" })).toBeVisible(SLOW);
    await setMockScenario(page, "normal");
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rosa Camargo" })).toBeVisible(SLOW);
  });
});
