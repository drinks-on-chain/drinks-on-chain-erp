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

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

test("la enóloga de Altos solo ve los terroirs de su bodega, con su badge D.O.", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");
  await page.goto("/origen");

  const cards = page.getByRole("list", { name: "Terroirs" }).getByRole("listitem");
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole("link", { name: /Cuartel 2 · Los Sauces/ })).toBeVisible();
  // Parcelas de Cinti Viejo (otra bodega): no aparecen.
  await expect(page.getByText(/Los Parrales/)).toHaveCount(0);
  // El Portillo: Moscatel bajo 1.600 m → ámbar con el motivo (01-erp §04).
  await expect(page.getByText("No apto D.O. · altitud < 1.600 m")).toBeVisible();
  await expect(page.getByText("Apto para Singani D.O.")).toHaveCount(1);
  // La enóloga no da de alta terroirs (terroir.write).
  await expect(page.getByRole("link", { name: "Nuevo terroir" })).toHaveCount(0);

  // Filtros: pill de cepa y "Apto D.O.".
  await page.getByRole("button", { name: "Moscatel" }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Apto D.O." }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "Todas" }).click();
  await page.getByRole("button", { name: "Apto D.O." }).click();
  await page.getByRole("searchbox", { name: "Buscar terroir" }).fill("portillo");
  await expect(cards).toHaveCount(1);

  await cards.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: /El Portillo/ })).toBeVisible();
  await expect(page.getByText("Ficha de la parcela")).toBeVisible();
  await expect(page.getByText("altitud < 1.600 m").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("el agrónomo crea un terroir con vista previa del badge D.O.", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "agronomo@cintiviejo.test");
  await page.goto("/origen");
  await page.getByRole("link", { name: "Nuevo terroir" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo terroir" })).toBeVisible();

  // Validación en cliente antes de enviar.
  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByText("Escribe el nombre de la parcela.")).toBeVisible();

  await page.getByLabel("Nombre de la parcela").fill("Parcela 6 · La Cumbre");
  await page.getByLabel("Superficie").fill("2,4");
  await page.getByLabel("Cepa").fill("Moscatel de Alejandría");
  await page.getByLabel("Altitud").fill("1500");
  await page.getByRole("checkbox", { name: /Parcela apta para D.O./ }).click();
  await expect(page.getByText("No apto D.O. · altitud < 1.600 m")).toBeVisible();
  await expect(page.getByText("La parcela no cumple la regla de la D.O. Singani")).toBeVisible();
  await page.getByLabel("Altitud").fill("2.450");
  await expect(page.getByText("Apto para Singani D.O.")).toBeVisible();
  await page.getByLabel("Polígono GeoJSON").fill("{ no es json");
  await expect(page.getByText("No es un JSON válido.")).toBeVisible();
  await page.getByLabel("Polígono GeoJSON").fill("");

  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByRole("heading", { name: "Parcela 6 · La Cumbre" })).toBeVisible();
  await expect(page.getByText("Sin ingresos todavía")).toBeVisible();
  expect(errors).toEqual([]);
});
