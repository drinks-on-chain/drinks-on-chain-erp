import { expect, test, type Page } from "@playwright/test";
import { axe, login, settled, trackErrors } from "./support";

// 1G · Auditoría axe (WCAG 2.1 A y AA) de cada pantalla del ERP contra los mocks.
// Ids reales de los fixtures (node_modules/@drinks-on-chain/mocks/fixtures/erp), filtrados por bodega.

const CINTI = {
  /** Lote «Moscatel de Alejandría 2026» (en reposo). */
  lot: "4af50d09-875b-5d1d-b026-62d60ae13b35",
  /** Lote «Singani Gran Reserva 2026» (embotellado, con laboratorio y expediente cerrado). */
  lotCertified: "05b7584c-13e0-5770-9336-9071197e3259",
  terroir: "e26c2890-b4e4-5973-aec2-0f092355ad3b",
  harvestPending: "93bd36a1-673b-52ed-adec-539d805cd018",
  harvestApproved: "2a643ce2-9f17-5017-9d6a-b4eb661d4648",
  tank: "d78d6307-f96b-533b-8f6e-710f6533bb42",
  aging: "a48ddc67-0e24-51fe-a43d-877f55ac9de6",
  production: "e58a7714-0a95-5cc4-8fd8-07999cb576e3",
  bottling: "afef7d2a-4817-556f-ae16-24b38eee217a",
};
const ALTOS_FERMENTING_TANK = "f87af6c0-197d-5fa3-b85e-29d7b27f00d9";

const EXPECTED: RegExp[] = [];

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
  "/lotes/nuevo",
  `/lotes/${CINTI.lot}`,
  `/lotes/${CINTI.lot}?pestana=linea-de-tiempo`,
  `/lotes/${CINTI.lot}?pestana=balance`,
  `/lotes/${CINTI.lot}/embotellar`,
  `/lotes/${CINTI.lotCertified}?pestana=laboratorio`,
  `/lotes/${CINTI.lotCertified}?pestana=expediente`,
  `/lotes/${CINTI.lotCertified}?pestana=trazabilidad`,
  `/lotes/${CINTI.lotCertified}?pestana=correcciones`,
  `/lotes/${CINTI.lotCertified}?pestana=archivos`,
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
  "/reportes",
  "/cuenta",
  // 1K (Ola 3): solicitudes, pestaña del lote de la preventa y formulario de ampliación.
  "/tokenizacion",
  "/lotes/aa3d8614-2fc6-5f53-94f9-e8cdb76f6986?pestana=tokenizacion",
  "/lotes/aa3d8614-2fc6-5f53-94f9-e8cdb76f6986/tokenizar",
  "/perfil",
  "/ajustes",
  "/equipo",
  "/ajustes/bitacora",
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

  test("axe con el modal de invitación abierto", async ({ page }) => {
    await login(page, "admin@cintiviejo.test");
    await page.goto("/equipo");
    await settled(page);
    await page.getByRole("button", { name: "Invitar" }).first().click();
    await expect(page.getByRole("dialog", { name: "Invitar al equipo" })).toBeVisible();
    await audit(page, { dialog: true });
  });
});

test("axe en los códigos de botella de un lote embotellado y con la anulación abierta", async ({ page }) => {
  await login(page, "admin@cintiviejo.test");
  await page.goto("/lotes");
  await settled(page);
  await page
    .getByRole("row", { name: /CVJ-L2025-001/ })
    .getByRole("link", { name: "Ver" })
    .click();
  await page.getByRole("tab", { name: "Códigos" }).click();
  await expect(page.getByRole("table", { name: /Códigos de botella de/ }).getByRole("row")).toHaveCount(21);
  await audit(page);
  await page
    .getByRole("button", { name: /^Anular/ })
    .first()
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await settled(page);
  await expect(page.getByRole("alertdialog")).toHaveAccessibleName(/Anular el código/);
  expect(await axe(page)).toEqual([]);
});

test("axe con la vista previa del embotellado calculada", async ({ page }) => {
  await login(page, "admin@cintiviejo.test");
  await page.goto(`/lotes/${CINTI.lot}/embotellar`);
  await settled(page);
  await page.getByLabel("Botellas llenadas").fill("2.950");
  await page.getByLabel("Grado alcohólico final").fill("40");
  await expect(page.getByTestId("rule-violation-notice").first()).toBeVisible();
  await audit(page);
});

test("axe con el análisis de laboratorio, la corrección y el archivo abiertos", async ({ page }) => {
  await login(page, "admin@cintiviejo.test");
  await page.goto("/lotes");
  await settled(page);
  // Lote embotellado sin laboratorio y con el expediente abierto.
  await page
    .getByRole("row", { name: /CVJ-L2025-003/ })
    .getByRole("link", { name: "Ver" })
    .click();
  await page.getByRole("tab", { name: "Laboratorio" }).click();
  await page.getByRole("button", { name: "Registrar análisis" }).click();
  await expect(page.getByRole("dialog", { name: "Registrar análisis de laboratorio" })).toBeVisible();
  await audit(page, { dialog: true });
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("tab", { name: "Correcciones" }).click();
  await page.getByRole("button", { name: "Registrar corrección" }).click();
  const correction = page.getByRole("dialog", { name: "Registrar corrección" });
  await correction.getByRole("combobox", { name: "Registro que se corrige" }).click();
  await page.getByRole("option", { name: /^Embotellado/ }).click();
  await expect(correction.getByLabel("Tipo de botella")).toBeVisible();
  await audit(page, { dialog: true });
  await correction.getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("tab", { name: "Archivos" }).click();
  await page.getByRole("button", { name: "Adjuntar archivo" }).first().click();
  await expect(page.getByRole("dialog", { name: "Adjuntar archivo" })).toBeVisible();
  await audit(page, { dialog: true });
});

test("axe con la corrección de una lectura del tanque abierta", async ({ page }) => {
  await login(page, "admin@altos.test");
  await page.goto(`/vinificacion/${ALTOS_FERMENTING_TANK}`);
  await settled(page);
  await page
    .getByRole("table", { name: /^Bitácora de / })
    .getByRole("button", { name: /^Corregir/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Corregir lectura de fermentación" })).toBeVisible();
  await audit(page, { dialog: true });
});

test("axe en el panel del operario", async ({ page }) => {
  await login(page, "operario@cintiviejo.test");
  await expect(page.getByRole("list", { name: "Accesos directos" })).toBeVisible();
  await audit(page);
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

test("axe con el análisis de madurez abierto", async ({ page }) => {
  await login(page, "enologa@cintiviejo.test");
  await page.goto(`/vendimia/${CINTI.harvestPending}`);
  await settled(page);
  await page.getByRole("button", { name: "Registrar análisis" }).click();
  await expect(page.getByRole("dialog", { name: "Registrar análisis de madurez" })).toBeVisible();
  await audit(page, { dialog: true });
});

test("axe con la bifurcación al completar la fermentación abierta", async ({ page }) => {
  await login(page, "admin@altos.test");
  await page.goto(`/vinificacion/${ALTOS_FERMENTING_TANK}`);
  await settled(page);
  await page.getByRole("button", { name: "Completar fermentación" }).click();
  await expect(page.getByRole("dialog", { name: /Completar la fermentación/ })).toBeVisible();
  await audit(page, { dialog: true });
});
