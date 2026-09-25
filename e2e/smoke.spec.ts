import { expect, test, type Page } from "@playwright/test";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Los 4xx/5xx se registran por URL (más útil que el mensaje genérico de la consola).
  page.on(
    "console",
    (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()),
  );
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
  return errors;
}

test("sin sesión, la portada lleva al login", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("login de la enóloga de Cinti Viejo y panel de su bodega", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("enologa@cintiviejo.test");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: /, Lucía$/ })).toBeVisible();
  await expect(page.getByText("Destilería Cinti Viejo").first()).toBeVisible();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
  await expect(page.getByText("Dictaminar ingreso de uva").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("credenciales incorrectas muestran el error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("enologa@cintiviejo.test");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
});
