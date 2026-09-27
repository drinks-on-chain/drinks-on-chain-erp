import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./support";

// Integración con el backend real de desarrollo (03 §4 1G; O0-ERP-2). Excluida por defecto: solo
// corre con E2E_REAL_API=1, y el build usa E2E_API_ORIGIN como API_ORIGIN (Next reescribe
// /api/v1/* al backend). Ver "Prueba contra el backend real" en el README:
//
//   E2E_REAL_API=1 E2E_API_ORIGIN=https://136.243.223.39.sslip.io E2E_PASSWORD=… \
//     E2E_PORT=3150 pnpm e2e --project=escritorio
//
// Personas de la semilla del backend (README del backend, "Datos de demostración"); su
// contraseña es la de SEED_DEMO_PASSWORD y solo llega por E2E_PASSWORD (nunca en el repo).
// Solo lecturas y altas inocuas (una parcela `E2E-<fecha>`), con un solo worker para no rozar los
// límites del backend (login 10/min y renovación 30/min por IP): se navega con los enlaces del
// shell, sin recargar, salvo donde la recarga es lo que se prueba.

const PASSWORD = process.env.E2E_PASSWORD ?? "";
const needsPassword = () => test.skip(!PASSWORD, "Falta E2E_PASSWORD (contraseña de las personas de demostración).");

/** Un embotellado sin certificado de laboratorio responde 404: es lo esperado. */
const NO_LAB = /^404 \/api\/v1\/lab-analyses\/batch\//;

const shellUser = (page: Page) => page.getByRole("button", { name: /Menú de usuario/ });
const orgSelector = (page: Page) => page.getByRole("combobox", { name: "Organización activa" });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Espera a que la pantalla termine de cargar: un h1 visible y ningún Skeleton. */
async function settled(page: Page) {
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".animate-shimmer")).toHaveCount(0, { timeout: 20_000 });
}

/** Abre un módulo desde la navegación lateral, espera a que cargue y anota cuánto tardó. */
async function openModule(page: Page, name: string, heading: string | RegExp) {
  const started = Date.now();
  await page.getByRole("link", { name, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
  await settled(page);
  const ms = Date.now() - started;
  test.info().annotations.push({ type: "carga", description: `${name}: ${ms} ms` });
  // Contrato roto (ContractError), error de red o del servidor: la pantalla cae en ErrorState.
  await expect(
    page.getByText("No se pudo cargar"),
    `${name} cae en ErrorState: respuesta que no cumple el contrato, 403 o error del servidor`,
  ).toHaveCount(0);
  return ms;
}

test("credenciales inválidas: 401 con el envoltorio del contrato", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(`nadie-${Date.now()}@ejemplo.test`);
  await page.getByLabel("Contraseña").fill("no-es-la-clave");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login")),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("AUTH_INVALID_CREDENTIALS");
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
});

test("dueña de Cinti Viejo: sesión por cookie, módulos, alta de parcela, 422 por campo y cierre", async ({ page }) => {
  needsPassword();
  test.setTimeout(240_000);
  // El 422 del perfil es el que provoca la prueba de errores por campo.
  const errors = trackErrors(page, [NO_LAB, /^422 \/api\/v1\/users\/me$/]);

  await test.step("login a través de la reescritura: cookie doc_rt de primera parte", async () => {
    await login(page, "admin@cintiviejo.test");
    await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
    await expect(shellUser(page)).toContainText("Dirección · Destilería Cinti Viejo");
    const cookie = (await page.context().cookies()).find((c) => c.name === "doc_rt");
    expect(cookie, "cookie doc_rt en el origen de la app").toBeTruthy();
    expect(cookie!.domain).toBe("localhost");
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.path).toBe("/");
    // Nada de la sesión en el almacenamiento del navegador.
    expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toMatch(/token/i);
  });

  await test.step("la recarga mantiene la sesión (renovación con la cookie)", async () => {
    const [refresh] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/refresh")),
      page.reload(),
    ]);
    expect(refresh.status()).toBe(200);
    await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
    await settled(page);
  });

  await test.step("módulos de trazabilidad y cuenta", async () => {
    await openModule(page, "Lotes", "Lotes");
    await openModule(page, "Origen y terroirs", "Origen y terroirs");
    await expect(page.getByRole("link", { name: /Parcela 2 · Cañón Viejo/ })).toBeVisible();
    await openModule(page, "Vendimia y laboratorio", "Vendimia y laboratorio");
    await openModule(page, "Vinificación", "Mapa de tanques");
    await openModule(page, "Crianza", "Barricas y crianza");
    await openModule(page, "Destilación y reposo", "Destilación y reposo");
    await openModule(page, "Envasado y QR", "Envasado y QR");
    await page.getByRole("link", { name: "CVJ-2026-SINGANI-001", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "CVJ-2026-SINGANI-001" })).toBeVisible();
    // Línea de tiempo desde el grafo del backend (forma de la cadena, normalizada en el ERP).
    await expect(page.getByText("Destilación · Alambique de cobre Charentais AL-01")).toBeVisible();
    await expect(page.getByText(/^Parcela · Parcela 2 · Cañón Viejo/)).toBeVisible();
    await openModule(page, "Cuenta Stellar", "Cuenta Stellar");
    await expect(page.getByRole("link", { name: /Ver en stellar.expert/ })).toBeVisible();
    await openModule(page, "Ajustes", "Ajustes de la bodega");
  });

  const parcel = `E2E-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
  await test.step(`alta inocua de una parcela (${parcel})`, async () => {
    await openModule(page, "Origen y terroirs", "Origen y terroirs");
    await page.getByRole("link", { name: "Nuevo terroir" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo terroir" })).toBeVisible();
    await page.getByLabel("Nombre de la parcela").fill(parcel);
    await page.getByLabel("Superficie").fill("0,5");
    await page.getByLabel("Cepa").fill("Prueba E2E");
    await page.getByLabel("Altitud").fill("1000");
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/terroirs") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Crear terroir" }).click(),
    ]);
    expect(created.status()).toBe(201);
    await expect(page.getByRole("heading", { level: 1, name: parcel })).toBeVisible();
    await expect(page.getByText("Sin ingresos todavía")).toBeVisible();
  });

  await test.step("un 422 del backend marca el campo exacto (details[].field)", async () => {
    await shellUser(page).click();
    await page.getByRole("menuitem", { name: "Perfil" }).click();
    await expect(page.getByLabel("Teléfono")).toBeVisible();
    // 21 caracteres: el formulario lo admite y el backend lo rechaza (MaxLength 20). No se guarda nada.
    await page.getByLabel("Teléfono").fill("+59171234567890123456");
    const [rejected] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/users/me") && r.request().method() === "PATCH"),
      page.getByRole("button", { name: "Guardar cambios" }).click(),
    ]);
    expect(rejected.status()).toBe(422);
    const body = await rejected.json();
    expect(body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "phoneNumber" })]));
    await expect(page.getByLabel("Teléfono")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Nombre completo")).not.toHaveAttribute("aria-invalid", "true");
  });

  await test.step("cerrar sesión revoca la sesión: la recarga ya no entra", async () => {
    await shellUser(page).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  expect(errors, "respuestas o errores inesperados").toEqual([]);
});

test("Sofía: dos bodegas (una suspendida) y cambio de organización", async ({ page }) => {
  needsPassword();
  test.setTimeout(120_000);
  // Casa Uriondo está SUSPENDED: con FEATURE_ENFORCE_ACTIVE_ORG el backend responde 403 ORG_NOT_ACTIVE.
  const errors = trackErrors(page, [/^403 \/api\/v1\//]);
  await login(page, "sofia@aramayo.test");
  await expect(orgSelector(page)).toBeVisible();

  // El backend recuerda la última organización usada: se parte de la que toque.
  if (!(await shellUser(page).textContent())?.includes("Casa Uriondo")) {
    await orgSelector(page).click();
    await page.getByRole("option", { name: /Casa Uriondo/ }).click();
    await expect(page.getByText("Ahora trabajas en Casa Uriondo.", { exact: true })).toBeVisible();
  }
  await expect(shellUser(page)).toContainText("Dirección · Casa Uriondo");
  await expect(page.getByRole("heading", { level: 1, name: "La bodega está suspendida" })).toBeVisible();

  await orgSelector(page).click();
  await page.getByRole("option", { name: /Bodega Altos de Calamuchita/ }).click();
  await expect(page.getByText("Ahora trabajas en Bodega Altos de Calamuchita.", { exact: true })).toBeVisible();
  await expect(shellUser(page)).toContainText("Enología · Bodega Altos de Calamuchita");
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
  await settled(page);
  // Permisos de la membresía activa (enóloga): lee la cadena, no da de alta parcelas.
  await openModule(page, "Origen y terroirs", "Origen y terroirs");
  await expect(page.getByRole("link", { name: /Cuartel 2 · Los Sauces/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo terroir" })).toHaveCount(0);

  // La organización elegida sobrevive a la recarga (el refresco rotado en el cambio es el vigente).
  await page.reload();
  await expect(shellUser(page)).toContainText("Enología · Bodega Altos de Calamuchita");
  expect(errors).toEqual([]);
});

test("operario de Cinti Viejo: pesa y registra lecturas; no ve crianza, destilación ni envasado", async ({ page }) => {
  needsPassword();
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, "operario@cintiviejo.test");
  await expect(shellUser(page)).toContainText("Destilería Cinti Viejo");
  await settled(page);
  const nav = page.getByRole("navigation").first();
  for (const hidden of ["Origen y terroirs", "Crianza", "Destilación y reposo", "Envasado y QR", "Cuenta Stellar"]) {
    await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  await openModule(page, "Vendimia y laboratorio", "Vendimia y laboratorio");
  await expect(page.getByRole("link", { name: "Registrar ingreso" })).toBeVisible();
  await openModule(page, "Vinificación", "Mapa de tanques");
  // El operario no llena tanques (tank.create es de dirección y enología).
  await expect(page.getByRole("link", { name: "Llenar tanque" })).toHaveCount(0);
  // Ninguna lectura que su rol no permita: sin 403 en la red.
  expect(errors).toEqual([]);
});

test("contabilidad de Cinti Viejo: membresía bloqueada por la plataforma, sin acceso al ERP", async ({ page }) => {
  needsPassword();
  // La semilla no tiene ninguna persona ACCOUNTANT activa: la única está bloqueada, así que la
  // matriz de solo lectura de contabilidad no se puede recorrer contra el backend real.
  const errors = trackErrors(page);
  await login(page, "contabilidad@cintiviejo.test");
  await expect(page.getByRole("heading", { name: "Este acceso no es para el ERP" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("429 del login con Retry-After (opcional: E2E_REAL_429=1)", async ({ page }) => {
  // Cada intento fallido cuenta para el bloqueo progresivo por IP (20 fallos/h): no se lanza por
  // defecto para no bloquear el login de quien ejecuta la suite.
  test.skip(process.env.E2E_REAL_429 !== "1", "Solo con E2E_REAL_429=1.");
  test.setTimeout(120_000);
  const email = `bloqueo-${Date.now()}@ejemplo.test`;
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("no-es-la-clave");
  let status = 0;
  for (let i = 0; i < 8 && status !== 429; i++) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login")),
      page.getByRole("button", { name: "Entrar" }).click(),
    ]);
    status = response.status();
    if (status === 429) expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
  }
  expect(status).toBe(429);
  await expect(page.getByText(/Demasiados intentos\. Vuelve a intentarlo en \d+ (segundos|minutos?)\./)).toBeVisible();
});
