import { expect, test, type Page } from "@playwright/test";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()),
  );
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
  return errors;
}

// Flujo de origen a dictamen: terroir nuevo → pesaje con laboratorio → aprobación.
// Tras crear datos se navega con clics: los mocks viven en la memoria de la página.
test("el agrónomo registra un terroir, pesa uva de esa parcela y aprueba el lote", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("agronomo@cintiviejo.test");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();

  // 1. Terroir
  await page.goto("/origen/nuevo");
  await page.getByLabel("Nombre de la parcela").fill("Parcela 7 · Alto Cinti");
  await page.getByLabel("Superficie").fill("3,1");
  await page.getByLabel("Altitud").fill("2380");
  await page.getByLabel("Cepa").fill("Moscatel de Alejandría");
  await page.getByRole("checkbox", { name: /Parcela apta para D.O./ }).click();
  await page.getByLabel("Tipo de D.O.").fill("D.O. Singani");
  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByRole("heading", { name: "Parcela 7 · Alto Cinti" })).toBeVisible();

  // 2. Pesaje desde la ficha (parcela preseleccionada con ?terroir=)
  await page.getByRole("link", { name: "Registrar pesaje" }).first().click();
  await expect(page.getByRole("heading", { name: "Registrar ingreso" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Terroir de origen" })).toContainText("Parcela 7 · Alto Cinti");

  await page.getByLabel("Peso bruto").fill("12.600");
  await page.getByLabel("Tara").fill("200");
  await expect(page.locator("output")).toContainText("12.400");
  // Brix, pH y acidez son obligatorios en el mismo alta.
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(page.getByText("Obligatorio: mide los grados Brix.")).toBeVisible();

  await page.getByLabel("Grados Brix").fill("23,8");
  await page.getByLabel("pH").fill("3,9");
  await expect(page.getByText("Sobre el objetivo")).toBeVisible();
  await page.getByLabel("pH").fill("3,45");
  await page.getByLabel("Acidez total").fill("6,1");
  await page.getByLabel("Temperatura de la uva al ingreso").fill("16,2");
  await page.getByRole("button", { name: "Registrar ingreso" }).click();

  // 3. Análisis y dictamen
  await expect(page.getByRole("heading", { name: /^HARV-2026-CINTI-/ })).toBeVisible();
  await expect(page.getByText("Pendiente de inspección").first()).toBeVisible();
  await expect(page.getByText("12.400 kg").first()).toBeVisible();
  await page.getByRole("button", { name: "Aprobar lote" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Esta decisión es definitiva");
  await dialog.getByLabel("Notas").fill("Inspección visual sin botritis.");
  await dialog.getByRole("button", { name: "Sí, aprobar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Lote aprobado").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar lote" })).toHaveCount(0);

  // 4. En la lista de vendimia figura como aprobado
  await page.getByRole("link", { name: "Vendimia y laboratorio" }).first().click();
  await expect(page.getByRole("row", { name: /HARV-2026-CINTI-/ })).toContainText("Aprobado");
  expect(errors).toEqual([]);
});
