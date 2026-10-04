import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./support";

// Flujo de ejemplo del documento maestro ("Singani Gran Reserva 2026"): un lote nuevo recorre
// origen → vendimia → tanque → destilación (abrir y cerrar con cortes) y queda en el reposo de 180
// días, con su lote del servidor en la lista y el embotellado bloqueado por el candado.
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
  await page.getByLabel("Tipo de D.O.").fill("D.O. Singani");
  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByRole("heading", { name: "Parcela 8 · Gran Reserva" })).toBeVisible();
  // La aptitud D.O. la calcula el servidor al guardar.
  await expect(page.getByText("Apto para Singani D.O.").first()).toBeVisible();

  await page.getByRole("link", { name: "Registrar pesaje" }).first().click();
  await page.getByLabel("Peso bruto").fill("18.550");
  await page.getByLabel("Tara").fill("150");
  // Agronomía pesa la uva sin lote (crear lotes es de enología): el lote nace al llenar el tanque.
  await expect(page.getByRole("combobox", { name: "Lote" })).toContainText("Sin lote: uva recibida");
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

  // 2. La enóloga llena el tanque con esa uva: como no tiene lote, el lote nace aquí.
  await logout(page);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
  await expect(page.getByText("Uva recibida sin lote")).toBeVisible();
  await page.getByRole("link", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("heading", { name: "Llenar tanque" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: harvestCode })).toBeChecked();
  await expect(page.getByLabel(`Kilos de ${harvestCode}`)).toHaveValue("18400");
  await expect(page.getByRole("combobox", { name: "Lote del tanque" })).toContainText("Nuevo lote…");
  await page.getByLabel("Nombre del lote").fill("Singani Gran Reserva 2026");
  await page.getByLabel("Capacidad").fill("15000");
  await page.getByLabel("Volumen llenado").fill("12.100");
  await page.getByRole("button", { name: "Llenar tanque" }).first().click();
  const tankHeading = page.getByRole("heading", { level: 1, name: /^TK-\d+$/ });
  await expect(tankHeading).toBeVisible();
  await expect(page.getByRole("link", { name: /Singani Gran Reserva 2026 · CVJ-L2026-006/ })).toBeVisible();

  // La bifurcación se decide al completar la fermentación: destino singani, con la D.O. comprobada.
  await page.getByRole("button", { name: "Completar fermentación" }).click();
  const decision = page.getByRole("dialog", { name: /Completar la fermentación de TK-/ });
  await expect(decision.getByLabel("Volumen final")).toHaveValue("12100");
  await decision.getByRole("button", { name: /A destilación/ }).click();
  await decision.getByRole("checkbox").click();
  await decision.getByRole("button", { name: "Confirmar destino y completar" }).click();
  await expect(page.getByText("Destino: Destilación (singani)", { exact: true })).toBeVisible();

  // 3. La destilación se abre con el vino base que entra al alambique…
  await page.getByRole("link", { name: "Pasar a destilación" }).click();
  await expect(page.getByRole("heading", { name: "Registrar destilación" })).toBeVisible();
  await page.getByLabel("Alambique").fill("Alambique de cobre AL-01");
  await page.getByLabel("Volumen de entrada").fill("12.100");
  await page.getByRole("button", { name: "Abrir destilación" }).first().click();
  await expect(page.getByText("Destilación abierta", { exact: true }).first()).toBeVisible();

  // …y se cierra con sus cortes: el corazón es el singani del lote y ahí empieza el reposo.
  const close = page.getByRole("form", { name: "Cerrar destilación" });
  await close.getByLabel("Cabezas").fill("120");
  await close.getByRole("textbox", { name: "Corazón", exact: true }).fill("1.500");
  await close.getByLabel("Colas").fill("210");
  await close.getByLabel("Grado del corazón").fill("60");
  await close.getByRole("button", { name: "Cerrar destilación" }).click();
  await expect(page.getByText("Destilación cerrada", { exact: true })).toBeVisible();

  // 4. El reposo normativo inmoviliza el lote 180 días: no se puede embotellar.
  await expect(page.getByText("Lote inmovilizado por normativa")).toBeVisible();
  await expect(page.getByTestId("countdown-days")).toHaveText(/^180\s*días$/);
  await expect(page.getByText("Reposo mínimo de 180 días.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasar a embotellado" })).toBeDisabled();

  // El lote del servidor (nació al llenar el tanque) está en reposo, con su candado.
  await nav(page, "Lotes");
  const row = page.getByRole("row", { name: /CVJ-L2026-006/ });
  await expect(row).toContainText("Singani Gran Reserva 2026");
  await expect(row).toContainText("Reposo");
  await expect(row).toContainText("Singani");
  await expect(row).toContainText("Faltan 180 días");
  await row.getByRole("link", { name: "Ver" }).click();
  await expect(page.getByRole("list", { name: "Candados del lote" })).toContainText("Reposo mínimo de 180 días");
  await expect(
    page.getByRole("list", { name: "Registros del lote" }).getByRole("link", { name: harvestCode }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
