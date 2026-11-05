import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./support";

// 1E Envasado (lista y ficha del embotellado), y el resto de 1A (perfil y
// ajustes) contra los mocks. El embotellado del lote y sus códigos están en embotellado.spec.ts;
// la lista y la ficha del lote, en lotes.spec.ts; la cuenta de la bodega (1F), en cuenta-bodega.spec.ts.
// La base de datos de MSW vive en la página: tras una escritura se navega con enlaces (sin recargar).

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();

test("Altos: la ficha de un embotellado muestra su balance y lleva a los códigos del lote", async ({ page }) => {
  const errors = trackErrors(page, []);
  await login(page, "enologa@altos.test");
  await nav(page, "Envasado y QR");
  await expect(page.getByRole("heading", { name: "Envasado y QR" })).toBeVisible();
  await page.getByRole("link", { name: "ALT-2026-WINE-001", exact: true }).click();

  await expect(page.getByRole("heading", { name: "ALT-2026-WINE-001" })).toBeVisible();
  const meters = page.getByRole("list", { name: "Balance del embotellado" });
  await expect(meters).toContainText("3.990 L de 4.050 L");
  await expect(meters).toContainText("1,48 % (60 L) · tolerada: 5 %");
  await expect(page.getByText("Códigos activos")).toBeVisible();
  await expect(page.getByText("1 a 5.320")).toBeVisible();

  await page.getByRole("link", { name: "Ver y exportar los códigos" }).click();
  await expect(page).toHaveURL(/\/lotes\/[\w-]+\?pestana=codigos$/);
  await expect(page.getByRole("table", { name: "Códigos de botella de ALT-2026-WINE-001" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ajustes: solo lectura para la enóloga; perfil editable", async ({ page }) => {
  const errors = trackErrors(page, []);
  await login(page, "enologa@altos.test");
  await nav(page, "Ajustes");
  await expect(page.getByText("Modo consulta")).toBeVisible();
  await expect(page.getByText("Bodega Altos de Calamuchita").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar datos" })).toHaveCount(0);
  // Equipo: ve nombres y roles, sin correos ni acciones de gestión.
  await nav(page, "Equipo");
  await expect(page.getByRole("cell", { name: "Ing. Diego Paredes" })).toBeVisible();
  await expect(page.getByText("agronomo@altos.test")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invitar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Acciones para/ })).toHaveCount(0);

  await page.goto("/perfil");
  await page.getByLabel("Teléfono").fill("+591 71000999");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Perfil actualizado", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ajustes: la administración edita la bodega y ve la configuración efectiva", async ({ page }) => {
  const errors = trackErrors(page, []);
  await login(page, "admin@cintiviejo.test");
  await nav(page, "Ajustes");
  await expect(page.getByText("Modo consulta")).toHaveCount(0);

  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByLabel("Teléfono de contacto").fill("+591 4 6660000");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Datos de la bodega guardados", { exact: true })).toBeVisible();
  await expect(page.getByText("+591 4 6660000")).toBeVisible();

  // Configuración efectiva: valores de la plataforma, solo lectura.
  await expect(page.getByText("Configuración efectiva", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Reposo mínimo tras la destilación.*180 días/ })).toBeVisible();
  expect(errors).toEqual([]);
});
