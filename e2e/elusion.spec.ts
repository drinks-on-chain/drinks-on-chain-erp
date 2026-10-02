import { expect, test, type Page } from "@playwright/test";
import { login, trackErrors } from "./support";

// Pruebas negativas del contrato de la Ola 2 §18 desde la interfaz: cada intento de eludir una
// regla lo rechaza el servidor (mocks 0.5) con su código `TRC_…` y la pantalla lo explica con
// `RuleViolationNotice`. Tras crear datos se navega con clics: los mocks viven en la página.

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();
const notice = (page: Page) => page.getByTestId("rule-violation-notice");

/**
 * Añade campos al cuerpo de la siguiente escritura a `path`, como haría quien manipula la petición
 * desde las herramientas del navegador: la interfaz no ofrece esos campos.
 */
async function tamperNextPost(page: Page, path: string, extra: Record<string, unknown>) {
  await page.evaluate(
    ({ path, extra }) => {
      const original = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (init?.method === "POST" && new URL(url, location.href).pathname === path && typeof init.body === "string") {
          window.fetch = original;
          init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...extra }) };
        }
        return original(input, init);
      };
    },
    { path, extra },
  );
}

test("pesaje con el dictamen ya aprobado: el servidor lo rechaza (TRC_PHYTO_IN_CREATE)", async ({ page }) => {
  const errors = trackErrors(page, [/^422 \/api\/v1\/harvest-batches$/]);
  await login(page, "operario@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "Registrar ingreso" }).click();
  await page.getByRole("combobox", { name: "Terroir de origen" }).click();
  await page.getByRole("option", { name: /Parcela 1 · Los Parrales/ }).click();
  await page.getByLabel("Peso bruto").fill("5.150");
  await page.getByLabel("Tara").fill("150");

  // Autoaprobación: se cuela `phytosanitaryStatus: APPROVED` en el alta.
  await tamperNextPost(page, "/api/v1/harvest-batches", { phytosanitaryStatus: "APPROVED" });
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(notice(page)).toContainText("El dictamen no se registra al pesar");
  await expect(notice(page)).toContainText("el dictamen fitosanitario va aparte");
  await expect(notice(page)).toContainText("TRC_PHYTO_IN_CREATE");

  // Sin manipular la petición, el pesaje nace pendiente de inspección.
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(page.getByRole("heading", { name: /^HARV-2026-PARRALES-/ })).toBeVisible();
  await expect(page.getByText("Pendiente de inspección").first()).toBeVisible();
  // Y el operario no puede dictaminar.
  await expect(page.getByRole("button", { name: "Aprobar lote" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("uva de una parcela no apta en un lote de singani (TRC_DO_TERROIR_NOT_ELIGIBLE)", async ({ page }) => {
  const errors = trackErrors(page, [/^422 \/api\/v1\/harvest-batches$/]);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "Registrar ingreso" }).click();
  await page.getByRole("combobox", { name: "Lote" }).click();
  await page.getByRole("option", { name: /Singani Edición Aniversario 2026/ }).click();
  // Vischoqueña: la D.O. Singani del lote exige Moscatel de Alejandría.
  await page.getByRole("combobox", { name: "Terroir de origen" }).click();
  await page.getByRole("option", { name: /Parcela 3 · Las Carreras/ }).click();
  await page.getByLabel("Peso bruto").fill("3.200");
  await page.getByLabel("Tara").fill("200");
  await page.getByRole("button", { name: "Registrar ingreso" }).click();

  await expect(notice(page)).toContainText("La parcela no es apta para la D.O. Singani");
  await expect(notice(page)).toContainText("Cepas admitidas (D.O. Singani)");
  await expect(notice(page)).toContainText("Exige el lote:");
  await expect(notice(page)).toContainText("Moscatel de Alejandría");
  await expect(notice(page)).toContainText("Vischoqueña");
  await expect(notice(page)).toContainText("TRC_DO_TERROIR_NOT_ELIGIBLE");

  // Con una parcela apta, el mismo pesaje entra al lote.
  await page.getByRole("combobox", { name: "Terroir de origen" }).click();
  await page.getByRole("option", { name: /Parcela 4 · El Molino/ }).click();
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(page.getByRole("heading", { name: /^HARV-2026-MOLINO-/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Singani Edición Aniversario 2026 · CVJ-L2026-003/ })).toBeVisible();
  // La ficha del pesaje muestra la D.O. calculada con las reglas del lote.
  await expect(page.getByText("Calculada con las reglas del lote")).toBeVisible();
  expect(errors).toEqual([]);
});

test("destino singani con uva no apta: la bifurcación lo rechaza (TRC_DO_NOT_ELIGIBLE)", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page, [/^422 \/api\/v1\/fermentation-tanks\/[\w-]+\/complete$/]);
  await login(page, "enologa@cintiviejo.test");
  // Negra Criolla de San Roque, en un lote sin tipo decidido: se aprueba y fermenta.
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "HARV-2026-ROQUE-05", exact: true }).click();
  await page.getByRole("button", { name: "Aprobar lote" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, aprobar" }).click();
  await expect(page.getByText("Lote aprobado").first()).toBeVisible();
  await page.getByRole("link", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("checkbox", { name: "HARV-2026-ROQUE-05" })).toBeChecked();
  await page.getByLabel("Volumen llenado").fill("4.100");
  await page.getByRole("button", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: /^TK-\d+$/ })).toBeVisible();

  // Aunque se elija destilación, la D.O. la calcula el servidor con toda la uva del lote.
  await page.getByRole("button", { name: "Completar fermentación" }).click();
  const modal = page.getByRole("dialog", { name: /Completar la fermentación/ });
  await modal.getByRole("button", { name: /A destilación/ }).click();
  await modal.getByRole("checkbox").click();
  await modal.getByRole("button", { name: "Confirmar destino y completar" }).click();
  const rule = modal.getByTestId("rule-violation-notice");
  await expect(rule).toContainText("El lote no cumple la D.O. Singani");
  await expect(rule).toContainText("Cepas admitidas (D.O. Singani)");
  await expect(rule).toContainText("Negra Criolla");
  await expect(rule).toContainText("TRC_DO_NOT_ELIGIBLE");

  // El lote sigue fermentando, sin tipo: como vino sí se completa.
  await modal.getByRole("button", { name: /A crianza/ }).click();
  await modal.getByRole("button", { name: "Confirmar destino y completar" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText("Destino: Crianza (vino)", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
