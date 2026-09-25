import { expect, test, type Page } from "@playwright/test";
import { axe, login, settled, trackErrors } from "./support";

// 1G · Auditoría axe (WCAG 2.1 A y AA) de cada pantalla del ERP contra los mocks.
// Ids reales de los fixtures (node_modules/@drinks-on-chain/mocks/fixtures/erp), filtrados por bodega.

const CINTI = {
  terroir: "e26c2890-b4e4-5973-aec2-0f092355ad3b",
  harvestPending: "93bd36a1-673b-52ed-adec-539d805cd018",
  harvestApproved: "2a643ce2-9f17-5017-9d6a-b4eb661d4648",
  tank: "d78d6307-f96b-533b-8f6e-710f6533bb42",
  aging: "a48ddc67-0e24-51fe-a43d-877f55ac9de6",
  production: "e58a7714-0a95-5cc4-8fd8-07999cb576e3",
  bottling: "afef7d2a-4817-556f-ae16-24b38eee217a",
};
const ALTOS_FERMENTING_TANK = "f87af6c0-197d-5fa3-b85e-29d7b27f00d9";

// Un embotellado sin certificado responde 404 en su certificado: es el estado "sin certificado".
const EXPECTED = [/^404 \/v1\/lab-analyses\/batch\//];

async function audit(page: Page, { dialog = false } = {}) {
  await settled(page);
  // Lector de pantalla: un único h1 y un único main por pantalla (con un diálogo abierto, el resto
  // de la página queda oculto con aria-hidden y el diálogo lleva su propio título).
  await expect(page.locator("h1")).toHaveCount(1);
  if (dialog) await expect(page.getByRole("dialog")).toHaveAccessibleName(/.+/);
  else await expect(page.getByRole("main")).toHaveCount(1);
  expect(await axe(page)).toEqual([]);
}

test.describe("sin sesión", () => {
  for (const path of ["/login", "/recuperar"]) {
    test(`axe ${path}`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(path);
      await audit(page);
      expect(errors).toEqual([]);
    });
  }
});

// Administración de Cinti Viejo: ve todas las acciones de escritura (formularios incluidos).
const ADMIN_ROUTES = [
  "/",
  "/lotes",
  `/lotes/${CINTI.harvestApproved}`,
  "/origen",
  `/origen/${CINTI.terroir}`,
  "/origen/nuevo",
  `/origen/${CINTI.terroir}/editar`,
  "/vendimia",
  "/vendimia/pesaje",
  `/vendimia/${CINTI.harvestApproved}`,
  "/vinificacion",
  "/vinificacion/nuevo",
  `/vinificacion/${CINTI.tank}`,
  "/crianza",
  "/crianza/nueva",
  `/crianza/${CINTI.aging}`,
  "/destilacion",
  "/destilacion/nueva",
  `/destilacion/${CINTI.production}`,
  "/envasado",
  "/envasado/nuevo",
  `/envasado/${CINTI.bottling}`,
  "/cuenta",
  "/perfil",
  "/ajustes",
];

test.describe("administración de Cinti Viejo", () => {
  for (const path of ADMIN_ROUTES) {
    test(`axe ${path}`, async ({ page }) => {
      const errors = trackErrors(page, EXPECTED);
      await login(page, "admin@cintiviejo.test");
      if (path !== "/") await page.goto(path);
      await audit(page);
      expect(errors).toEqual([]);
    });
  }

  test("axe con el modal de alta de miembro abierto", async ({ page }) => {
    await login(page, "admin@cintiviejo.test");
    await page.goto("/ajustes");
    await settled(page);
    await page.getByRole("button", { name: "Añadir miembro" }).first().click();
    await expect(page.getByRole("dialog", { name: "Añadir miembro" })).toBeVisible();
    await audit(page, { dialog: true });
  });
});

test("axe con el modal de dictamen fitosanitario abierto", async ({ page }) => {
  await login(page, "enologa@cintiviejo.test");
  await page.goto(`/vendimia/${CINTI.harvestPending}`);
  await settled(page);
  await page.getByRole("button", { name: "Aprobar lote" }).click();
  await expect(page.getByRole("dialog")).toContainText("Esta decisión es definitiva");
  await audit(page, { dialog: true });
});

test("axe con la bitácora del tanque abierta", async ({ page }) => {
  await login(page, "admin@altos.test");
  await page.goto(`/vinificacion/${ALTOS_FERMENTING_TANK}`);
  await settled(page);
  await page.getByRole("button", { name: "Añadir registro diario" }).first().click();
  await expect(page.getByRole("dialog", { name: "Añadir registro diario" })).toBeVisible();
  await audit(page, { dialog: true });
});
