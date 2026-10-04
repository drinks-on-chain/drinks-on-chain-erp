import { expect, test } from "@playwright/test";
import { trackErrors } from "./support";

// Flujo de origen a dictamen: terroir nuevo → pesaje (análisis opcional) → aprobación.
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
  // El análisis es opcional, pero si se registra va completo: Brix, pH y acidez.
  await page.getByLabel("Grados Brix").fill("23,8");
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(page.getByText("Falta el pH: el análisis se registra completo.")).toBeVisible();

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
  // El dictamen queda en el historial con su autor, su rol y sus notas.
  const history = page.getByRole("list", { name: "Historial de dictámenes" });
  await expect(history).toContainText("Aprobado");
  await expect(history).toContainText("Agronomía");
  await expect(history).toContainText("Inspección visual sin botritis.");

  // El análisis se registró con el pesaje; otro posterior pasa a ser el vigente (solo inserción).
  const analyses = page.getByRole("table", { name: /Historial de análisis/ });
  await expect(analyses.getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "Registrar análisis" }).click();
  const form = page.getByRole("dialog", { name: "Registrar análisis de madurez" });
  await form.getByRole("button", { name: "Guardar análisis" }).click();
  await expect(form.getByText("Mide los grados Brix.")).toBeVisible();
  await form.getByLabel("Grados Brix").fill("24,6");
  await form.getByLabel("pH").fill("3,5");
  await form.getByLabel("Acidez total").fill("5,6");
  await form.getByRole("button", { name: "Guardar análisis" }).click();
  await expect(form).toBeHidden();
  await expect(analyses.getByRole("row")).toHaveCount(3);
  await expect(analyses.getByRole("row").nth(1)).toContainText("24,6");
  await expect(analyses.getByRole("row").nth(1)).toContainText("Vigente");

  // 4. En la lista de vendimia figura como aprobado
  await page.getByRole("link", { name: "Vendimia y laboratorio" }).first().click();
  await expect(page.getByRole("row", { name: /HARV-2026-CINTI-/ })).toContainText("Aprobado");
  expect(errors).toEqual([]);
});
