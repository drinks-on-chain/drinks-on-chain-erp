import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./support";

// 1C (vinificación) y 1D (crianza y destilación) contra los mocks (hoy = 2026-09-25).

// Flujos largos (login + varias pantallas): margen para máquinas cargadas.
test.describe.configure({ timeout: 60_000 });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

test("enóloga de Cinti Viejo: mapa de tanques y destilación en reposo con el embotellado bloqueado", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");

  await page.goto("/vinificacion");
  await expect(page.getByRole("heading", { name: "Mapa de tanques" })).toBeVisible();
  await expect(page.getByTestId("tank-card").filter({ hasText: "TK-08" })).toBeVisible();
  // Cinti Viejo no tiene tanques fermentando: el filtro lo muestra vacío.
  await page.getByRole("button", { name: /^Fermentando · 0$/ }).click();
  await expect(page.getByText("Ningún tanque con estos filtros")).toBeVisible();

  await page.goto("/destilacion");
  await expect(page.getByRole("heading", { name: "Destilación y reposo" })).toBeVisible();
  // Dos tandas del mismo lote: la que está a 18 días de terminar el reposo.
  const resting = page.getByRole("row").filter({ hasText: "Los Parrales" }).filter({ hasText: "18 d" });
  await resting.getByRole("link", { name: "Parcela 1 · Los Parrales · Moscatel de Alejandría" }).click();

  await expect(page.getByText("Lote inmovilizado por normativa")).toBeVisible();
  await expect(page.getByTestId("countdown-days")).toHaveText(/^18\s*días$/);
  await expect(page.getByRole("button", { name: "Pasar a embotellado" })).toBeDisabled();
  await expect(page.getByText("El botón se habilita cuando el contador llega a cero.")).toBeVisible();
  await expect(page.getByText("1.500 L").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("enóloga de Altos: registro diario en el tanque con temperatura alta", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");

  await page.goto("/vinificacion");
  const hot = page.getByTestId("tank-card").filter({ hasText: "TK-04" });
  await expect(hot).toContainText("Temperatura alta");
  await expect(hot).toContainText("27,5 °C");
  await hot.click();

  await expect(page.getByRole("heading", { name: "TK-04" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Temperatura alta" })).toBeVisible();
  await page.getByRole("button", { name: "Añadir registro diario" }).first().click();

  const form = page.getByRole("dialog", { name: "Añadir registro diario" });
  await form.getByRole("button", { name: "Guardar lectura" }).click();
  await expect(form.getByText("La temperatura es obligatoria.")).toBeVisible();

  await form.getByLabel("Temperatura").fill("22,4");
  await form.getByLabel("Densidad").fill("1,012");
  await form.getByLabel("pH").fill("3,45");
  await form.getByLabel("Observaciones de CO₂").fill("Burbujeo suave");
  await form.getByRole("button", { name: "Guardar lectura" }).click();

  await expect(form).toBeHidden();
  await expect(page.getByText("Lectura registrada").first()).toBeVisible();
  const firstRow = page.getByRole("table", { name: "Bitácora de TK-04" }).getByRole("row").nth(1);
  await expect(firstRow).toContainText("22,4");
  await expect(firstRow).toContainText("1,012");
  // La última lectura ya no supera 26 °C.
  await expect(page.getByRole("alert").filter({ hasText: "Temperatura alta" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("enóloga de Altos: la crianza en barrica muestra su cuenta regresiva", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");

  await page.goto("/crianza");
  await expect(page.getByRole("heading", { name: "Barricas y crianza" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Cuartel 1 · La Angostura · Tannat" });
  await expect(row).toContainText("39 d");
  await row.getByRole("link", { name: "Cuartel 1 · La Angostura · Tannat" }).click();

  await expect(page.getByText("Vino en crianza")).toBeVisible();
  await expect(page.getByTestId("countdown-days")).toHaveText(/^39\s*días$/);
  await expect(page.getByText("Se libera el 3 nov 2026.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasar a embotellado" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("enóloga de Altos: llenar un tanque exige uva aprobada y la bifurcación se decide al completar", async ({
  page,
}) => {
  // Los 422 del dictamen pendiente y de la capacidad son parte del recorrido.
  const errors = trackErrors(page, [/^422 \/api\/v1\/fermentation-tanks$/]);
  await login(page, "enologa@altos.test");
  await page.getByRole("link", { name: "Vinificación", exact: true }).first().click();
  await page.getByRole("link", { name: "Llenar tanque" }).click();
  await expect(page.getByRole("heading", { name: "Llenar tanque" })).toBeVisible();
  // Solo se ofrece la uva con kilos disponibles; la ya vinificada no aparece.
  await expect(page.getByRole("checkbox", { name: "HARV-2025-ANGOSTURA-06" })).toHaveCount(0);

  // Uva pendiente de dictamen: el servidor la rechaza y el aviso explica la regla del lote.
  await page.getByRole("checkbox", { name: "HARV-2026-SAUCES-12" }).click();
  await expect(page.getByLabel("Código del tanque")).toHaveValue("TK-17");
  await page.getByLabel("Volumen llenado").fill("4.000");
  await page.getByRole("button", { name: "Llenar tanque" }).first().click();
  const notice = page.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("Uva sin dictamen fitosanitario aprobado");
  await expect(notice).toContainText("Dictamen fitosanitario aprobado para fermentar");
  await expect(notice).toContainText("Pendiente de inspección");
  await expect(notice).toContainText("TRC_PHYTO_NOT_APPROVED");

  // Se aprueba el pesaje y se vuelve a llenar el tanque, ya con la uva elegida.
  await page.getByRole("link", { name: "Vendimia y laboratorio", exact: true }).first().click();
  await page.getByRole("link", { name: "HARV-2026-SAUCES-12", exact: true }).click();
  await page.getByRole("button", { name: "Aprobar lote" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, aprobar" }).click();
  await expect(page.getByText("Lote aprobado").first()).toBeVisible();
  await page.getByRole("link", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("checkbox", { name: "HARV-2026-SAUCES-12" })).toBeChecked();

  // La capacidad la comprueba el servidor.
  await page.getByLabel("Capacidad").fill("8000");
  await page.getByLabel("Volumen llenado").fill("9000");
  await page.getByRole("button", { name: "Llenar tanque" }).first().click();
  await expect(notice).toContainText("El llenado supera la capacidad");
  await expect(notice).toContainText("TRC_TANK_CAPACITY_EXCEEDED");
  await page.getByLabel("Volumen llenado").fill("6.500");
  await page.getByRole("button", { name: "Llenar tanque" }).first().click();

  await expect(page.getByRole("heading", { name: "TK-17" })).toBeVisible();
  await expect(page.getByText("Se decide al completar la fermentación", { exact: true })).toBeVisible();
  // Mientras fermenta no hay paso siguiente: antes hay que completar la fermentación.
  await expect(page.getByRole("link", { name: "Pasar a destilación" })).toHaveCount(0);

  await page.getByRole("button", { name: "Completar fermentación" }).click();
  const modal = page.getByRole("dialog", { name: "Completar la fermentación de TK-17" });
  await expect(modal).toBeVisible();
  const confirm = modal.getByRole("button", { name: "Confirmar destino y completar" });
  await expect(confirm).toBeDisabled();
  await modal.getByRole("button", { name: /A destilación/ }).click();
  await expect(confirm).toBeDisabled();
  await modal.getByRole("checkbox").click();
  await modal.getByLabel("Volumen final").fill("6.300");
  await confirm.click();

  await expect(modal).toBeHidden();
  await expect(page.getByText("Destino: Destilación (singani)", { exact: true })).toBeVisible();
  await expect(page.getByText("Fermentación terminada").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Pasar a destilación" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("enóloga de Altos: el destino debe coincidir con el tipo del lote", async ({ page }) => {
  const errors = trackErrors(page, [/^422 \/api\/v1\/fermentation-tanks\/[\w-]+\/complete$/]);
  await login(page, "enologa@altos.test");
  await page.getByRole("link", { name: "Vinificación", exact: true }).first().click();
  // TK-10 fermenta uva de un lote que ya es de vino.
  await page.getByTestId("tank-card").filter({ hasText: "TK-10" }).click();
  await expect(page.getByRole("heading", { name: "TK-10" })).toBeVisible();
  await page.getByRole("button", { name: "Completar fermentación" }).click();
  const modal = page.getByRole("dialog", { name: "Completar la fermentación de TK-10" });
  await modal.getByRole("button", { name: /A destilación/ }).click();
  await modal.getByRole("checkbox").click();
  await modal.getByRole("button", { name: "Confirmar destino y completar" }).click();
  const notice = modal.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("El destino no coincide con el tipo del lote");
  await expect(notice).toContainText("Crianza (vino)");
  await expect(notice).toContainText("TRC_DESTINATION_MISMATCH");

  // Con el destino del lote, la fermentación se completa.
  await modal.getByRole("button", { name: /A crianza/ }).click();
  await modal.getByRole("button", { name: "Confirmar destino y completar" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText("Destino: Crianza (vino)", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pasar a crianza" })).toBeVisible();
  expect(errors).toEqual([]);
});
