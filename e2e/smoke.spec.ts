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

test("cambio de organización: Sofía pasa de enóloga en Altos a dueña de Casa Uriondo (suspendida)", async ({
  page,
}) => {
  // Al cambiar, las consultas de la pantalla que se deja se relanzan con la bodega nueva: en una
  // bodega suspendida responden 403 ORG_NOT_ACTIVE, que es justo lo que lleva a la pantalla dedicada.
  const errors = trackErrors(page, [/^403 \/api\/v1\/terroirs/]);
  await login(page, "sofia@aramayo.test");
  await expect(shellUser(page)).toContainText("Enología · Bodega Altos de Calamuchita");

  // Desde una pantalla interior: al cambiar vuelve al inicio con la otra bodega activa.
  await page.getByRole("link", { name: "Origen y terroirs", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Origen y terroirs" })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Organización activa" });
  await selector.click();
  await page.getByRole("option", { name: /Casa Uriondo/ }).click();

  await expect(page.getByText("Ahora trabajas en Casa Uriondo.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(shellUser(page)).toContainText("Dirección · Casa Uriondo");
  // Casa Uriondo está suspendida (mocks 0.3): pantalla dedicada en lugar del panel.
  await expect(page.getByRole("heading", { level: 1, name: "La bodega está suspendida" })).toBeVisible();

  // La organización elegida sobrevive a la recarga.
  await page.reload();
  await expect(shellUser(page)).toContainText("Dirección · Casa Uriondo");
  await expect(page.getByRole("heading", { level: 1, name: "La bodega está suspendida" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("el enlace Perfil del menú de usuario navega sin recargar la página", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  // Una marca en `window` sobrevive a la navegación del cliente y desaparece con una recarga.
  await page.evaluate(() => ((window as unknown as { __sinRecarga?: boolean }).__sinRecarga = true));
  await shellUser(page).click();
  await page.getByRole("menuitem", { name: "Perfil" }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("heading", { level: 1, name: "Lic. Lucía Rojas" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);
  expect(errors).toEqual([]);
});

test("una sesión revocada avisa en el login, también al recargar", async ({ page }) => {
  await login(page, "enologa@cintiviejo.test");
  // Revoca en los mocks las sesiones abiertas (como un bloqueo desde el Backoffice).
  await page.evaluate(() => {
    const key = "doc-mocks:sessions";
    const state = JSON.parse(localStorage.getItem(key) ?? "{}") as { sessions?: Record<string, { revoked: boolean }> };
    for (const session of Object.values(state.sessions ?? {})) session.revoked = true;
    localStorage.setItem(key, JSON.stringify(state));
  });
  const notice = page.getByText("Tu sesión se cerró por seguridad. Vuelve a entrar.");
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(notice).toBeVisible();
  // En el propio login, otra recarga sigue avisando (la cookie es de la sesión revocada).
  await page.reload();
  await expect(notice).toBeVisible();
  // Entrar de nuevo lo quita.
  await login(page, "enologa@cintiviejo.test");
  await expect(notice).toHaveCount(0);
});

test("cerrar sesión revoca la sesión: la recarga ya no entra", async ({ page }) => {
  await login(page, "enologa@cintiviejo.test");
  await shellUser(page).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
