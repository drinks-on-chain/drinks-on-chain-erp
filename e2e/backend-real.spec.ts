import { expect, test } from "@playwright/test";

// Integración temprana contra el backend real (03 §4, 1G; O0-ERP-2). Excluida por defecto: solo
// corre con E2E_REAL_API, que el build usa como API_ORIGIN (Next reescribe /api/v1/* al backend):
//   E2E_REAL_API=https://136.243.223.39.sslip.io E2E_PORT=3150 pnpm e2e --project=escritorio
// Con E2E_REAL_EMAIL y E2E_REAL_PASSWORD (usuario de bodega creado por backend) prueba además
// el login y la lectura de terroirs. Las credenciales nunca se escriben en el repo.
// No puede pasar entera hasta que el backend implemente el contrato de la Ola 0 (O0-BE-4):
// `GET /users/me` con membresías, listas paginadas y la cookie de renovación `doc_rt`.

test("el backend real rechaza credenciales inválidas con el envoltorio esperado", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("nadie@ejemplo.test");
  await page.getByLabel("Contraseña").fill("no-es-la-clave");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/auth/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
  expect(response.status()).toBe(401);
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
});

test("login real y directorio de terroirs de la bodega", async ({ page }) => {
  const email = process.env.E2E_REAL_EMAIL;
  const password = process.env.E2E_REAL_PASSWORD;
  test.skip(!email || !password, "Faltan E2E_REAL_EMAIL / E2E_REAL_PASSWORD (usuario de prueba del backend).");
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
  await page.getByRole("link", { name: "Origen y terroirs", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Origen y terroirs" })).toBeVisible();
  // Con o sin parcelas, la pantalla no debe caer en el estado de error (contrato roto).
  await expect(page.getByText("Algo salió mal")).toHaveCount(0);
});
