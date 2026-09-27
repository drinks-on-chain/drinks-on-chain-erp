import { expect, test, type Page } from "@playwright/test";
import { login, trackErrors } from "./support";

// Humo del ERP con la sesión del contrato de la Ola 0: acceso en memoria, renovación con la
// cookie al arrancar, organización activa y errores por campo.

/** Rol y bodega activos en el bloque de usuario del AppShell. */
const shellUser = (page: Page) => page.getByRole("button", { name: /Menú de usuario/ });

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
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
  await expect(page.getByText("Dictaminar ingreso de uva").first()).toBeVisible();
  // Una sola membresía: no hay selector de organización; nada de la sesión en el almacenamiento.
  await expect(page.getByRole("combobox", { name: "Organización activa" })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("doc.session"))).toBeNull();
  expect(errors).toEqual([]);
});

test("credenciales incorrectas muestran el error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("enologa@cintiviejo.test");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
});

test("un 422 de validación marca el campo exacto (details[].field)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("no-es-un-correo");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Contraseña")).not.toHaveAttribute("aria-invalid", "true");
});

test("la recarga mantiene la sesión (renovación con la cookie al arrancar)", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await page.reload();
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});

test("cambio de organización: Sofía pasa de enóloga en Altos a dueña de Casa Uriondo", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "sofia@aramayo.test");
  await expect(shellUser(page)).toContainText("Enología · Bodega Altos de Calamuchita");

  // Desde una pantalla interior: al cambiar vuelve al panel con los datos de la otra bodega.
  await page.getByRole("link", { name: "Origen y terroirs", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Origen y terroirs" })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Organización activa" });
  await selector.click();
  await page.getByRole("option", { name: /Casa Uriondo/ }).click();

  await expect(page.getByText("Ahora trabajas en Casa Uriondo.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(shellUser(page)).toContainText("Dirección · Casa Uriondo");
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();

  // Como dueña ve los ajustes de la bodega como editables.
  await page.getByRole("link", { name: "Ajustes", exact: true }).first().click();
  await expect(page.getByText(/puede ver los ajustes; los cambia la administración/)).toHaveCount(0);

  // La organización elegida sobrevive a la recarga.
  await page.reload();
  await expect(shellUser(page)).toContainText("Dirección · Casa Uriondo");
  expect(errors).toEqual([]);
});

test("cerrar sesión revoca la sesión: la recarga ya no entra", async ({ page }) => {
  await login(page, "enologa@cintiviejo.test");
  await shellUser(page).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
