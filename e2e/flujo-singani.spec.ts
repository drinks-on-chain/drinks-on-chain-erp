import { expect, test, type Page } from "@playwright/test";

// Flujo de ejemplo del documento maestro ("Singani Gran Reserva 2026"), de origen a QR (03 §4, 1G).
// Parte 1: un lote nuevo recorre origen → vendimia → tanque → destilación y queda en el reposo
// de 180 días. Parte 2: como el reposo no puede cumplirse en una prueba, se embotella la
// destilación de la misma bodega que ya lo cumplió y se exportan sus QR.
// Los mocks viven en la memoria de la página: tras crear datos se navega solo con clics.

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()),
  );
  page.on("response", (r) => {
    const line = `${r.status()} ${new URL(r.url()).pathname}`;
    // Un embotellado recién creado aún no tiene certificado de laboratorio: 404 esperado.
    if (r.status() >= 400 && !/^404 \/v1\/lab-analyses\/batch\//.test(line)) errors.push(line);
  });
  return errors;
}

async function login(page: Page, email: string) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
}

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();

test("Singani Gran Reserva 2026: de la parcela al reposo y del reposo cumplido al QR", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await page.goto("/login");

  // 1. El agrónomo registra la parcela D.O. y el ingreso de uva, y lo aprueba.
  await login(page, "agronomo@cintiviejo.test");
  await nav(page, "Origen y terroirs");
  await page.getByRole("link", { name: "Nuevo terroir" }).click();
  await page.getByLabel("Nombre de la parcela").fill("Parcela 8 · Gran Reserva");
  await page.getByLabel("Superficie").fill("2,4");
  await page.getByLabel("Altitud").fill("2410");
  await page.getByLabel("Cepa").fill("Moscatel de Alejandría");
  await page.getByRole("checkbox", { name: /Parcela apta para D.O./ }).click();
  await page.getByLabel("Tipo de D.O.").fill("D.O. Singani");
  await expect(page.getByText("Apto para Singani D.O.").first()).toBeVisible();
  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByRole("heading", { name: "Parcela 8 · Gran Reserva" })).toBeVisible();

  await page.getByRole("link", { name: "Registrar pesaje" }).first().click();
  await page.getByLabel("Peso bruto").fill("18.550");
  await page.getByLabel("Tara").fill("150");
  await page.getByLabel("Grados Brix").fill("23,4");
  await page.getByLabel("pH").fill("3,4");
  await page.getByLabel("Acidez total").fill("5,9");
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  const harvestHeading = page.getByRole("heading", { name: /^HARV-2026-/ });
  await expect(harvestHeading).toBeVisible();
  const harvestCode = (await harvestHeading.textContent())!.trim();
  await expect(page.getByText("18.400 kg").first()).toBeVisible();

  await page.getByRole("button", { name: "Aprobar lote" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, aprobar" }).click();
  await expect(page.getByText("Lote aprobado").first()).toBeVisible();

  // 2. La enóloga llena el tanque y fija el destino: destilación.
  await logout(page);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
  await page.getByRole("link", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("heading", { name: "Llenar tanque" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lote" })).toContainText(harvestCode);
  await page.getByLabel("Capacidad").fill("15000");
  await page.getByLabel("Volumen llenado").fill("12.100");
  await page.getByRole("button", { name: "Llenar tanque" }).click();
  const decision = page.getByRole("dialog", { name: "Destino técnico de este lote" });
  await decision.getByRole("button", { name: /A destilación/ }).click();
  await decision.getByRole("checkbox").click();
  await decision.getByRole("button", { name: "Confirmar destino y llenar" }).click();
  await expect(page.getByText("Destino: Destilación (singani)", { exact: true })).toBeVisible();

  // 3. Destilación con cortes: el corazón es el singani del lote.
  await page.getByRole("link", { name: "Pasar a destilación" }).click();
  await expect(page.getByRole("heading", { name: "Registrar destilación" })).toBeVisible();
  await page.getByLabel("Alambique").fill("Alambique de cobre AL-01");
  await page.getByLabel("Volumen de entrada").fill("12.100");
  await page.getByLabel("Cabeza").fill("120");
  await page.getByLabel("Corazón").fill("1.500");
  await page.getByLabel("Cola").fill("210");
  await page.getByLabel("Grado inicial").fill("60");
  await page.getByRole("button", { name: "Registrar destilación" }).first().click();

  // 4. El reposo normativo inmoviliza el lote 180 días: no se puede embotellar.
  await expect(page.getByText(/180/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasar a embotellado" })).toBeDisabled();

  // El lote aparece en la vista derivada con su etapa y candado.
  await nav(page, "Lotes");
  await expect(page.getByRole("row", { name: new RegExp(harvestCode) })).toContainText("Reposo");

  // 5. Del reposo cumplido al QR: embotellar la destilación ya liberada de la bodega.
  await nav(page, "Envasado y QR");
  await page.getByRole("link", { name: "Nuevo embotellado" }).click();
  await page.getByRole("combobox", { name: "Fuente" }).click();
  await page.getByRole("option", { name: /HARV-2025-MOLINO-03/ }).click();
  await page.getByRole("button", { name: "Usar esta cifra" }).click();
  await page.getByLabel(/Botellas llenadas/).fill("950");
  await page.getByRole("button", { name: "Cerrar producción y generar identidad" }).click();
  await page
    .getByRole("dialog", { name: "¿Cerrar la producción?" })
    .getByRole("button", { name: "Sí, cerrar y sellar" })
    .click();
  await expect(page.getByRole("heading", { name: /sellado$/ })).toBeVisible();
  await expect(page.getByText(/^CVJ-2026-SINGANI-\d{3}$/).first()).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^qr-CVJ-2026-SINGANI-\d{3}\.csv$/);
  expect(errors).toEqual([]);
});
