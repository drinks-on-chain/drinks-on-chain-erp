import { expect, test, type Page } from "@playwright/test";

// 1C (vinificación) y 1D (crianza y destilación) contra los mocks (hoy = 2026-09-25).

// Flujos largos (login + varias pantallas): margen para máquinas cargadas.
test.describe.configure({ timeout: 60_000 });

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

test("enóloga de Altos: llenar un tanque fija el destino con confirmación explícita", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");
  await page.goto("/vinificacion");
  await page.getByRole("link", { name: "Llenar tanque" }).click();
  await expect(page.getByRole("heading", { name: "Llenar tanque" })).toBeVisible();

  // Un Tannat no puede ir a destilación.
  await page.getByRole("combobox", { name: "Lote" }).click();
  await page.getByRole("option", { name: /HARV-2025-ANGOSTURA-06/ }).click();
  await expect(page.getByText(/La D.O. Singani exige Moscatel de Alejandría/).first()).toBeVisible();

  await page.getByRole("combobox", { name: "Lote" }).click();
  await page.getByRole("option", { name: /HARV-2026-SAUCES-07/ }).click();
  await expect(page.getByText("Apto para Singani D.O.")).toBeVisible();
  await expect(page.getByLabel("Código del tanque")).toHaveValue("TK-11");
  await page.getByLabel("Capacidad").fill("8000");
  await page.getByLabel("Volumen llenado").fill("9000");
  await page.getByRole("button", { name: "Llenar tanque" }).click();
  await expect(page.getByText("El volumen supera la capacidad del tanque.")).toBeVisible();
  await page.getByLabel("Volumen llenado").fill("6.500");
  await page.getByRole("button", { name: "Llenar tanque" }).click();

  const modal = page.getByRole("dialog", { name: "Destino técnico de este lote" });
  await expect(modal).toBeVisible();
  const confirm = modal.getByRole("button", { name: "Confirmar destino y llenar" });
  await expect(confirm).toBeDisabled();
  await modal.getByRole("button", { name: /A destilación/ }).click();
  await expect(confirm).toBeDisabled();
  await modal.getByRole("checkbox").click();
  await confirm.click();

  await expect(page.getByRole("heading", { name: "TK-11" })).toBeVisible();
  await expect(page.getByText("Destino: Destilación (singani)", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pasar a destilación" })).toBeVisible();
  expect(errors).toEqual([]);
});
