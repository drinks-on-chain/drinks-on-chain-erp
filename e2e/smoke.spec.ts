import { expect, test, type Page } from "@playwright/test";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

test("sin sesión, la portada lleva al login", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("login con un usuario de demo y lectura del perfil", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("enologa@cintiviejo.test");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  await expect(page.getByText("Lic. Lucía Rojas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("credenciales incorrectas muestran el error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("enologa@cintiviejo.test");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
});
