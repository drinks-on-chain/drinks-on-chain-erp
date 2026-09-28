import { expect, test, type Browser, type Page } from "@playwright/test";
import { hasMailbox, mailLink } from "./mailpit";
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
/** Parcela `E2E-…` que da de alta la dueña de Cinti Viejo: el operario pesa sobre ella. */
let e2eParcel: string | null = null;
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
    // El certificado llega en `details.labAnalysis` del embotellado: hecho, no "Pendiente".
    await expect(page.getByText(/^Certificado de laboratorio · /)).toBeVisible();
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
    e2eParcel = parcel;
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

test("Sofía: Casa Uriondo suspendida (solo estado, perfil y bitácora) y cambio a Altos", async ({ page }) => {
  needsPassword();
  test.setTimeout(120_000);
  // Casa Uriondo está SUSPENDED: el backend responde 403 ORG_NOT_ACTIVE a las rutas del ERP. El
  // shell no pide ninguna (el panel de trazabilidad no se monta); solo `/wineries/my`, el perfil y
  // la bitácora, que el backend permite en SUSPENDED.
  const errors = trackErrors(page);
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
  await expect(page.getByText("Solo lectura mientras dure la suspensión.")).toBeVisible();

  // Navegación reducida: el estado y la bitácora (y el perfil en el menú de usuario).
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link")).toHaveText(["Estado de la bodega", "Bitácora"]);
  // Un módulo por URL lleva a la misma pantalla sin pedir nada al backend.
  await page.goto("/origen");
  await expect(page.getByRole("heading", { level: 1, name: "La bodega está suspendida" })).toBeVisible();

  const [audit] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/v1/organizations/current/audit")),
    nav.getByRole("link", { name: "Bitácora", exact: true }).click(),
  ]);
  expect(audit.status(), "la bitácora propia se lee con la bodega suspendida").toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Bitácora de la bodega" })).toBeVisible();
  await expect(page.getByText("No se pudo cargar la bitácora")).toHaveCount(0);

  await shellUser(page).click();
  await page.getByRole("menuitem", { name: "Perfil" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Lic. Sofía Aramayo" })).toBeVisible();

  // Se deja la semilla como estaba: la última organización de Sofía es Altos.
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

test("operario de Cinti Viejo: lee parcelas y pesa; no crea parcelas ni ve crianza, destilación ni envasado", async ({
  page,
}) => {
  needsPassword();
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page, "operario@cintiviejo.test");
  await expect(shellUser(page)).toContainText("Destilería Cinti Viejo");
  await settled(page);
  const nav = page.getByRole("navigation").first();
  for (const hidden of ["Crianza", "Destilación y reposo", "Envasado y QR", "Cuenta Stellar"]) {
    await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }

  // Lectura mínima de parcelas (contrato de la Ola 1 §11 bis): lista y ficha, sin alta ni edición.
  await openModule(page, "Origen y terroirs", "Origen y terroirs");
  await expect(page.getByRole("link", { name: /Parcela 2 · Cañón Viejo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo terroir" })).toHaveCount(0);

  if (e2eParcel) {
    await test.step(`pesaje inocuo sobre la parcela ${e2eParcel}`, async () => {
      await page.getByRole("link", { name: new RegExp(e2eParcel!) }).click();
      await expect(page.getByRole("heading", { level: 1, name: e2eParcel! })).toBeVisible();
      await expect(page.getByRole("link", { name: /Editar/ })).toHaveCount(0);
      await page.getByRole("link", { name: "Registrar pesaje" }).first().click();
      await expect(page.getByRole("heading", { name: "Registrar ingreso" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Terroir de origen" })).toContainText(e2eParcel!);
      await page.getByLabel("Peso bruto").fill("120");
      await page.getByLabel("Tara").fill("20");
      await page.getByLabel("Grados Brix").fill("22,5");
      await page.getByLabel("pH").fill("3,5");
      await page.getByLabel("Acidez total").fill("6");
      const [created] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/v1/harvest-batches") && r.request().method() === "POST"),
        page.getByRole("button", { name: "Registrar ingreso" }).click(),
      ]);
      expect(created.status()).toBe(201);
      await expect(page.getByRole("heading", { level: 1, name: /^HARV-2026-/ })).toBeVisible();
    });
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

// ---------- Ola 1 · cuenta, invitaciones y equipo (O1-ERP-1 contra O1-BE-1) ----------

const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name, exact: true }).click();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Contexto nuevo (otra persona en otro navegador) con su página. */
async function actor(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });
}

async function invite(page: Page, email: string, role: string) {
  await nav(page, "Equipo");
  await page.getByRole("button", { name: "Invitar" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Invitar al equipo" });
  await dialog.getByLabel("Correo electrónico").fill(email);
  await dialog.getByRole("combobox", { name: "Rol en la bodega" }).click();
  await page.getByRole("option", { name: role, exact: true }).click();
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/organizations/current/invitations") && r.request().method() === "POST",
    ),
    dialog.getByRole("button", { name: "Enviar invitación" }).click(),
  ]);
  expect(created.status(), `invitación a ${email}`).toBe(201);
  await expect(page.getByText(`Invitación enviada a ${email}`, { exact: true })).toBeVisible();
}

/**
 * Turnstile no entrega token en Chrome sin cabeza ni con la clave de prueba de Cloudflare: se sirve
 * un sustituto del script que devuelve el token ficticio de sus claves de prueba. El backend de
 * desarrollo usa el secreto de prueba (`1x…AA`), que acepta cualquier token sin llamar a Cloudflare.
 */
async function stubTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        render(el, opts) { setTimeout(() => opts.callback("XXXX.DUMMY.TOKEN.XXXX"), 50); return "e2e"; },
        remove() {}, reset() {}, getResponse() { return "XXXX.DUMMY.TOKEN.XXXX"; },
      };`,
    }),
  );
}

/**
 * La sesión revocada en el backend cae en la siguiente petición: se abre el perfil y, si todo sale
 * de la caché, se cambia y guarda una preferencia (siempre va a la red). El backend responde 401
 * `AUTH_SESSION_REVOKED` (a la petición o a la renovación) y la app lleva al login.
 */
async function expectSessionRevoked(page: Page) {
  const revoked = page.waitForResponse((r) => r.url().includes("/api/v1/") && r.status() === 401);
  await shellUser(page).click();
  await page.getByRole("menuitem", { name: "Perfil" }).click();
  const promotions = page.getByRole("switch", { name: /Promociones y novedades/ });
  const loginHeading = page.getByRole("heading", { name: "Iniciar sesión" });
  await expect(promotions.or(loginHeading)).toBeVisible({ timeout: 20_000 });
  if (await promotions.isVisible()) {
    await promotions.click();
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
  }
  expect((await (await revoked).json()).error.code).toBe("AUTH_SESSION_REVOKED");
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Abre el menú de acciones de una fila del equipo y elige una opción. */
async function memberAction(page: Page, fullName: string, item: string) {
  await page.getByRole("button", { name: `Acciones para ${fullName}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("Ola 1: invitación con cuenta nueva, cuenta de la persona, equipo, configuración y bitácora", async ({
  browser,
}) => {
  needsPassword();
  test.skip(!hasMailbox(), "Falta el buzón de Mailpit (E2E_MAILPIT_SSH o E2E_MAILPIT_URL).");
  test.setTimeout(420_000);

  // Datos propios de la ejecución: la persona nueva y una segunda invitación que se anula. Las
  // contraseñas de la persona son de prueba y solo viven en esta ejecución (sin trazas).
  const stamp = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `persona+erp-${stamp}@example.test`;
  const other = `anulada+erp-${stamp}@example.test`;
  const fullName = `Persona E2E ${stamp}`;
  const reason = `Prueba E2E ${stamp}`;
  const secret = () => `Vendimia-${Math.random().toString(36).slice(2, 10)}-${stamp.slice(-4)}`;
  const firstPassword = secret();
  const changedPassword = secret();
  const resetPassword = secret();

  const owner = await actor(browser);
  const persona = await actor(browser);
  const ownerErrors = trackErrors(owner.page);
  // La sesión de la persona cae dos veces a propósito (cambio de rol y bloqueo): 401 AUTH_SESSION_REVOKED;
  // y la contraseña actual equivocada es un 422 buscado.
  const personaErrors = trackErrors(persona.page, [/^401 \/api\/v1\//, /^422 \/api\/v1\/users\/me\/password$/]);

  await test.step("la dirección de Altos invita a una persona nueva como enóloga", async () => {
    await signIn(owner.page, "admin@altos.test", PASSWORD);
    const since = new Date();
    await invite(owner.page, email, "Enología");
    await expect(owner.page.getByRole("row", { name: new RegExp(escapeRe(email)) })).toContainText("Enología");
    const link = await mailLink(email, /\/invitacion\//, since);
    expect(link).toMatch(/^\/invitacion\/[^/?]+$/);

    await persona.page.goto(link);
    await expect(
      persona.page.getByText(/Martín Calamuchita te invita a unirte a Bodega Altos de Calamuchita/),
    ).toBeVisible();
    await expect(persona.page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
    await expect(persona.page.getByLabel("Correo electrónico")).toHaveValue(email);
    await persona.page.getByLabel("Nombre completo").fill(fullName);
    await persona.page
      .getByLabel(/^Contraseña/)
      .first()
      .fill(firstPassword);
    await persona.page.getByLabel(/^Repite la contraseña/).fill(firstPassword);
    const [accepted] = await Promise.all([
      persona.page.waitForResponse((r) => r.url().includes("/api/v1/invitations/") && r.url().endsWith("/accept")),
      persona.page.getByRole("button", { name: "Crear cuenta y entrar" }).click(),
    ]);
    expect(accepted.status()).toBe(200);
    await expect(persona.page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(shellUser(persona.page)).toContainText("Enología · Bodega Altos de Calamuchita");
    const cookie = (await persona.context.cookies()).find((c) => c.name === "doc_rt");
    expect(cookie?.httpOnly, "la aceptación deja la cookie de renovación").toBe(true);
    // El enlace ya se usó.
    await persona.page.goto(link);
    await expect(persona.page.getByText("Esta invitación ya se aceptó")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("la persona cambia sus preferencias y su contraseña", async () => {
    await persona.page.goto("/perfil");
    await expect(persona.page.getByRole("heading", { level: 1, name: fullName })).toBeVisible({ timeout: 20_000 });
    const promotions = persona.page.getByRole("switch", { name: /Promociones y novedades/ });
    await expect(promotions).not.toBeChecked();
    await promotions.click();
    await persona.page.getByRole("switch", { name: /Avisos del lote/ }).click();
    const [saved] = await Promise.all([
      persona.page.waitForResponse((r) => r.url().endsWith("/api/v1/users/me") && r.request().method() === "PATCH"),
      persona.page.getByRole("button", { name: "Guardar preferencias" }).click(),
    ]);
    expect(saved.status()).toBe(200);
    await expect(persona.page.getByText("Preferencias guardadas", { exact: true })).toBeVisible();
    await persona.page.reload();
    await expect(persona.page.getByRole("switch", { name: /Promociones y novedades/ })).toBeChecked({
      timeout: 20_000,
    });
    await expect(persona.page.getByRole("switch", { name: /Avisos del lote/ })).not.toBeChecked();

    await persona.page.getByLabel("Contraseña actual").fill("no-es-la-actual-1");
    await persona.page.getByLabel(/^Contraseña nueva/).fill(changedPassword);
    await persona.page.getByLabel(/^Repite la contraseña/).fill(changedPassword);
    await persona.page.getByRole("button", { name: "Cambiar contraseña" }).click();
    // 422 AUTH_INVALID_CURRENT_PASSWORD con el detalle en `currentPassword` (mensaje del backend).
    await expect(persona.page.getByLabel("Contraseña actual")).toHaveAttribute("aria-invalid", "true");
    await expect(persona.page.getByText("No es correcta", { exact: false })).toBeVisible();
    await persona.page.getByLabel("Contraseña actual").fill(firstPassword);
    const [changed] = await Promise.all([
      persona.page.waitForResponse((r) => r.url().endsWith("/api/v1/users/me/password")),
      persona.page.getByRole("button", { name: "Cambiar contraseña" }).click(),
    ]);
    expect(changed.status()).toBe(204);
    await expect(persona.page.getByText("Contraseña cambiada", { exact: true })).toBeVisible();
  });

  await test.step("la persona recupera la contraseña por correo y entra con la nueva", async () => {
    await shellUser(persona.page).click();
    await persona.page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(persona.page).toHaveURL(/\/login$/);
    const since = new Date();
    await stubTurnstile(persona.page);
    await persona.page.goto("/recuperar");
    await persona.page.getByLabel("Correo electrónico").fill(email);
    const send = persona.page.getByRole("button", { name: "Enviar enlace" });
    await expect(send).toBeEnabled({ timeout: 20_000 });
    const [forgot] = await Promise.all([
      persona.page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/forgot-password")),
      send.click(),
    ]);
    expect(forgot.status()).toBe(202);
    await expect(persona.page.getByText("Revisa tu correo")).toBeVisible();

    const link = await mailLink(email, /\/restablecer-contrasena\?token=/, since);
    await persona.page.goto(link);
    await expect(persona.page).toHaveURL(/\/restablecer\/[^/]+$/);
    await persona.page.getByLabel(/^Contraseña nueva/).fill(resetPassword);
    await persona.page.getByLabel(/^Repite la contraseña/).fill(resetPassword);
    const [reset] = await Promise.all([
      persona.page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/reset-password")),
      persona.page.getByRole("button", { name: "Guardar contraseña" }).click(),
    ]);
    expect(reset.status()).toBe(204);
    await expect(persona.page.getByText("Contraseña cambiada")).toBeVisible();
    await signIn(persona.page, email, resetPassword);
  });

  await test.step("la dirección le cambia el rol: su sesión se cierra y vuelve a entrar como agrónoma", async () => {
    await owner.page.reload();
    await expect(owner.page.getByRole("button", { name: `Acciones para ${fullName}` })).toBeVisible({
      timeout: 20_000,
    });
    await memberAction(owner.page, fullName, "Cambiar rol");
    const dialog = owner.page.getByRole("dialog", { name: `Cambiar el rol de ${fullName}` });
    await dialog.getByRole("combobox", { name: "Rol en la bodega" }).click();
    await owner.page.getByRole("option", { name: "Agronomía", exact: true }).click();
    await dialog.getByRole("button", { name: "Guardar rol" }).click();
    await expect(owner.page.getByText(`${fullName} ahora es Agronomía`, { exact: true })).toBeVisible();

    // El rol viaja en el acceso: el backend revoca la sesión (ROLE_CHANGED).
    await expectSessionRevoked(persona.page);
    await signIn(persona.page, email, resetPassword);
    await expect(shellUser(persona.page)).toContainText("Agronomía · Bodega Altos de Calamuchita");
  });

  await test.step("la dirección la bloquea (su sesión cae con 401) y la desbloquea", async () => {
    await memberAction(owner.page, fullName, "Bloquear acceso");
    const block = owner.page.getByRole("alertdialog", { name: `Bloquear a ${fullName}` });
    await block.getByLabel("Motivo (opcional)").fill(reason);
    await block.getByRole("button", { name: "Bloquear acceso" }).click();
    await expect(owner.page.getByText(`${fullName} ya no tiene acceso`, { exact: true })).toBeVisible();
    const row = owner.page.getByRole("row", { name: new RegExp(escapeRe(fullName)) });
    await expect(row).toContainText("Bloqueado por la dirección");
    await expect(row).toContainText(`Motivo: ${reason}`);

    await expectSessionRevoked(persona.page);

    await memberAction(owner.page, fullName, "Desbloquear");
    await owner.page
      .getByRole("alertdialog", { name: `Desbloquear a ${fullName}` })
      .getByRole("button", { name: "Desbloquear" })
      .click();
    await expect(owner.page.getByText(`${fullName} vuelve a tener acceso`, { exact: true })).toBeVisible();
    await expect(row).not.toContainText("Bloqueado");
  });

  await test.step("la dirección reenvía y anula una invitación", async () => {
    await invite(owner.page, other, "Operario");
    const pending = owner.page.getByRole("row", { name: new RegExp(escapeRe(other)) });
    await expect(pending).toContainText("Operario");
    await owner.page.getByRole("button", { name: `Acciones para la invitación a ${other}` }).click();
    const [resent] = await Promise.all([
      owner.page.waitForResponse((r) => r.url().endsWith("/resend")),
      owner.page.getByRole("menuitem", { name: "Reenviar" }).click(),
    ]);
    expect(resent.status()).toBe(200);
    await expect(owner.page.getByText(`Invitación reenviada a ${other}`, { exact: true })).toBeVisible();

    await owner.page.getByRole("button", { name: `Acciones para la invitación a ${other}` }).click();
    await owner.page.getByRole("menuitem", { name: "Anular" }).click();
    await owner.page
      .getByRole("alertdialog", { name: `Anular la invitación a ${other}` })
      .getByRole("button", { name: "Anular invitación" })
      .click();
    await expect(owner.page.getByText("Invitación anulada", { exact: true })).toBeVisible();
    await expect(pending).toHaveCount(0);
  });

  await test.step("configuración efectiva en Ajustes", async () => {
    await nav(owner.page, "Ajustes");
    await expect(owner.page.getByRole("heading", { level: 1, name: "Ajustes de la bodega" })).toBeVisible();
    const rest = owner.page.getByRole("row", { name: /Reposo mínimo tras la destilación/ });
    await expect(rest).toContainText("180");
    await expect(rest).toContainText("Estándar");
  });

  await test.step("bitácora propia con filtros de acción y fecha", async () => {
    await nav(owner.page, "Bitácora");
    await expect(owner.page.getByRole("heading", { level: 1, name: "Bitácora de la bodega" })).toBeVisible();
    await owner.page.getByRole("combobox", { name: "Acción" }).click();
    await owner.page.getByRole("option", { name: "Equipo · Miembro bloqueado" }).click();
    await expect(owner.page.getByRole("button", { name: "Quitar filtro Acción: Miembro bloqueado" })).toBeVisible();
    const entry = owner.page.getByRole("row", { name: new RegExp(escapeRe(reason)) });
    await expect(entry).toBeVisible();

    // Fechas (UTC): hoy incluye la entrada; ayer, ninguna de las de hoy.
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await owner.page.getByRole("textbox", { name: "Desde" }).fill(today);
    await owner.page.getByRole("textbox", { name: "Hasta" }).fill(today);
    await expect(entry).toBeVisible();
    await owner.page.getByRole("textbox", { name: "Desde" }).fill(yesterday);
    await owner.page.getByRole("textbox", { name: "Hasta" }).fill(yesterday);
    await expect(entry).toHaveCount(0);
  });

  await test.step("cuenta existente: Cinti Viejo la invita como operaria y acepta con su sesión (acceso + refresco)", async () => {
    const cinti = await actor(browser);
    const cintiErrors = trackErrors(cinti.page);
    await signIn(cinti.page, "admin@cintiviejo.test", PASSWORD);
    const since = new Date();
    await invite(cinti.page, email, "Operario");
    const link = await mailLink(email, /\/invitacion\//, since);
    expect(cintiErrors).toEqual([]);
    await cinti.context.close();

    await signIn(persona.page, email, resetPassword);
    await persona.page.goto(link);
    await expect(persona.page.getByText(`Estás como ${fullName}.`, { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    const [accepted] = await Promise.all([
      persona.page.waitForResponse((r) => r.url().endsWith("/accept")),
      persona.page.getByRole("button", { name: "Aceptar y entrar" }).click(),
    ]);
    expect(accepted.status()).toBe(200);
    expect(accepted.request().headers()["authorization"], "acepta con el acceso de su sesión").toMatch(/^Bearer /);
    expect(await accepted.request().headerValue("cookie"), "y con la cookie de renovación").toMatch(/doc_rt=/);
    expect((await accepted.headerValue("set-cookie")) ?? "", "la sesión rota: cookie nueva").toMatch(/doc_rt=/);
    await expect(persona.page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(shellUser(persona.page)).toContainText("Operario · Destilería Cinti Viejo");

    // La recarga renueva con la cookie rotada y conserva Cinti Viejo como activa.
    await persona.page.reload();
    await expect(shellUser(persona.page)).toContainText("Operario · Destilería Cinti Viejo", { timeout: 20_000 });
    await orgSelector(persona.page).click();
    await expect(persona.page.getByRole("option", { name: /Bodega Altos de Calamuchita/ })).toBeVisible();
    await persona.page.keyboard.press("Escape");
  });

  expect(ownerErrors, "respuestas o errores inesperados (dirección)").toEqual([]);
  expect(personaErrors, "respuestas o errores inesperados (persona)").toEqual([]);
  await owner.context.close();
  await persona.context.close();
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
