import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./support";

// Un embotellado recién creado aún no tiene certificado de laboratorio: 404 esperado.
const NO_LAB = /^404 \/api\/v1\/lab-analyses\/batch\//;

// Flujo de ejemplo del documento maestro ("Singani Gran Reserva 2026"): un lote nuevo recorre
// origen → vendimia → tanque → destilación y queda en el reposo de 180 días, con su lote del
// servidor en la lista. El recorrido completo hasta el expediente llega con la fase 3 de O2-ERP-1.
// Los mocks viven en la memoria de la página: tras crear datos se navega solo con clics.

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

test("Singani Gran Reserva 2026: de la parcela al reposo de 180 días", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page, [NO_LAB]);
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
  // El pesaje crea el lote: nace con su instantánea de reglas.
  await page.getByRole("combobox", { name: "Lote" }).click();
  await expect(page.getByRole("option", { name: "Nuevo lote…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
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

  // El lote del servidor (nació al llenar el tanque con uva sin lote) está en reposo, con su candado.
  await nav(page, "Lotes");
  const row = page.getByRole("row", { name: /CVJ-L2026-006/ });
  await expect(row).toContainText("Reposo");
  await expect(row).toContainText("Singani");
  await expect(row).toContainText(/Faltan 1[78]\d días/);
  await row.getByRole("link", { name: "Ver" }).click();
  await expect(page.getByRole("list", { name: "Candados del lote" })).toContainText("Reposo mínimo de 180 días");
  await expect(
    page.getByRole("list", { name: "Registros del lote" }).getByRole("link", { name: harvestCode }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
