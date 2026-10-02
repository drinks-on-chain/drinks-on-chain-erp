import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page, type Response } from "@playwright/test";
import { hasMailbox, mailLink } from "./mailpit";
import { trackErrors } from "./support";

// Integración con el backend real de desarrollo (03 §4 1G; O0-ERP-2, O1-ERP-2 y O2-ERP-1). Excluida por defecto: solo
// corre con E2E_REAL_API=1, y el build usa E2E_API_ORIGIN como API_ORIGIN (Next reescribe
// /api/v1/* al backend). Ver "Prueba contra el backend real" en el README:
//
//   E2E_REAL_API=1 E2E_API_ORIGIN=https://136.243.223.39.sslip.io E2E_PASSWORD=… \
//     E2E_PORT=3150 pnpm e2e --project=escritorio
//
// Personas de la semilla del backend (README del backend, "Datos de demostración"); su
// contraseña es la de SEED_DEMO_PASSWORD y solo llega por E2E_PASSWORD (nunca en el repo).
// Lecturas y altas con el sufijo de la ejecución (`E2E-<fecha>-<azar>`: una parcela, un pesaje y el
// lote del recorrido de la Ola 2), con un solo worker para no rozar los límites del backend (login
// 10/min y renovación 30/min por IP): se navega con los enlaces del shell, sin recargar, salvo
// donde la recarga es lo que se prueba.

const PASSWORD = process.env.E2E_PASSWORD ?? "";
/** Parcela `E2E-…` que da de alta la dueña de Cinti Viejo: el operario pesa sobre ella. */
let e2eParcel: string | null = null;
const needsPassword = () => test.skip(!PASSWORD, "Falta E2E_PASSWORD (contraseña de las personas de demostración).");

const shellUser = (page: Page) => page.getByRole("button", { name: /Menú de usuario/ });
const orgSelector = (page: Page) => page.getByRole("combobox", { name: "Organización activa" });

/**
 * El backend limita el login a 10 por minuto y por IP. Un corredor rápido (la CI) los supera con
 * los cambios de persona del recorrido: se espera lo justo para no pasar de 8 en 65 segundos.
 */
const recentLogins: number[] = [];
async function paceLogin() {
  const WINDOW_MS = 65_000;
  const MAX = 8;
  const now = Date.now();
  while (recentLogins.length > 0 && now - recentLogins[0]! > WINDOW_MS) recentLogins.shift();
  if (recentLogins.length >= MAX) {
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS - (now - recentLogins[0]!) + 500));
    recentLogins.shift();
  }
  recentLogins.push(Date.now());
}

async function login(page: Page, email: string) {
  await paceLogin();
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
  await paceLogin();
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
  const errors = trackErrors(page, [/^422 \/api\/v1\/users\/me$/]);

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
    await settled(page);
    // Desde la Ola 2 el laboratorio, el expediente y el grafo son del lote: la ficha del embotellado
    // lleva a ellos y muestra su balance y sus códigos.
    await expect(page.getByText("Códigos de botella", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Trazabilidad", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Trazabilidad" })).toHaveAttribute("aria-selected", "true");
    await settled(page);
    await expect(page.locator('[data-stage="TERROIR"]')).toContainText("Parcela 2 · Cañón Viejo");
    await expect(page.locator('[data-stage="DISTILLATION"]')).toContainText("Alambique de cobre Charentais AL-01");
    for (const tab of [
      "Balance",
      "Códigos",
      "Laboratorio",
      "Expediente",
      "Línea de tiempo",
      "Correcciones",
      "Archivos",
    ]) {
      await page.getByRole("tab", { name: tab }).click();
      await settled(page);
      await expect(page.getByText("No se pudo cargar"), `pestaña ${tab} de la ficha del lote`).toHaveCount(0);
      await expect(page.getByText(/datos inesperados/), `pestaña ${tab}: contrato`).toHaveCount(0);
    }
    await openModule(page, "Reportes", "Reportes de producción");
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
      // El operario pesa sin análisis: el de madurez lo registran enología o agronomía (Ola 2 §3.3).
      await expect(page.getByLabel("Grados Brix")).toHaveCount(0);
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

// ---------- Ola 2 · ERP confiable (O2-ERP-1 contra la Etapa 2 del backend) ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fecha `AAAA-MM-DD` de hace `days` días (UTC): el proceso se declara en el pasado para que el reposo ya esté cumplido. */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const ruleNotice = (page: Page) => page.getByTestId("rule-violation-notice");

/** Respuesta al alta de una corrección del lote. */
const isCorrection = (r: Response) =>
  /\/api\/v1\/lots\/[\w-]+\/corrections$/.test(r.url()) && r.request().method() === "POST";

async function signOut(page: Page) {
  await shellUser(page).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
}

async function switchTo(page: Page, email: string) {
  await signOut(page);
  await login(page, email);
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });
  await settled(page);
}

const side = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name, exact: true }).click();

/**
 * Añade campos al cuerpo de la siguiente escritura a `path`, como quien manipula la petición desde
 * las herramientas del navegador: la interfaz no ofrece esos campos.
 */
async function tamperNextPost(page: Page, path: string, extra: Record<string, unknown>) {
  await page.evaluate(
    ({ path, extra }) => {
      const original = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (init?.method === "POST" && new URL(url, location.href).pathname === path && typeof init.body === "string") {
          window.fetch = original;
          init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), ...extra }) };
        }
        return original(input, init);
      };
    },
    { path, extra },
  );
}

test("Ola 2: el panel de la bodega carga con datos reales (Altos y Cinti Viejo)", async ({ page }) => {
  needsPassword();
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  for (const email of ["admin@altos.test", "admin@cintiviejo.test"]) {
    const [dashboard] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/traceability/dashboard")),
      login(page, email),
    ]);
    expect(dashboard.status()).toBe(200);
    // Formas reales que el ERP admite aunque los mocks pidan un instante ISO: se anota la del backend.
    const data = (await dashboard.json()).data as {
      pendingPhyto: { intakeDate: string }[];
      fermentationAlerts: { lastReadingAt: string | null }[];
    };
    const shape = (v: string | null | undefined) =>
      v == null
        ? "null"
        : /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? "AAAA-MM-DD"
          : /^\d{4}-\d{2}-\d{2}T/.test(v)
            ? "instante ISO"
            : "otro";
    console.log(
      `[panel] ${email}: pendingPhyto=${data.pendingPhyto.length} intakeDate=${shape(data.pendingPhyto[0]?.intakeDate)} · fermentationAlerts=${data.fermentationAlerts.length} lastReadingAt=${shape(data.fermentationAlerts[0]?.lastReadingAt)}`,
    );
    await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });
    await settled(page);
    await expect(page.getByText("No se pudo cargar"), `panel de ${email}`).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Resumen" })).toContainText("Lotes en proceso");
    await expect(page.getByRole("list", { name: "Lotes por etapa" })).toBeVisible();
    await signOut(page);
  }
  expect(errors).toEqual([]);
});

test("Ola 2: Altos (vino): módulos, fichas y pestañas del lote cumplen el contrato", async ({ page }) => {
  needsPassword();
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await login(page, "admin@altos.test");
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });

  /** La pantalla abierta cargó sin ErrorState ni respuesta fuera de contrato. */
  const healthy = async (what: string) => {
    await settled(page);
    await expect(page.getByText("No se pudo cargar"), what).toHaveCount(0);
    await expect(page.getByText(/datos inesperados/), `${what}: contrato`).toHaveCount(0);
  };

  await openModule(page, "Vendimia y laboratorio", "Vendimia y laboratorio");
  await page
    .getByRole("link", { name: /^HARV-/ })
    .first()
    .click();
  await healthy("ficha del pesaje");

  await openModule(page, "Vinificación", "Mapa de tanques");
  await page.getByTestId("tank-card").first().click();
  await healthy("ficha del tanque");

  await openModule(page, "Crianza", "Barricas y crianza");
  await page.getByRole("table").getByRole("link").first().click();
  await healthy("ficha de la crianza");

  await openModule(page, "Destilación y reposo", "Destilación y reposo");
  await openModule(page, "Envasado y QR", "Envasado y QR");
  await page.getByRole("link", { name: "Nuevo embotellado" }).click();
  await healthy("lotes por embotellar");
  await openModule(page, "Reportes", "Reportes de producción");

  // Un lote de vino embotellado: todas sus pestañas.
  await openModule(page, "Lotes", "Lotes");
  await page.getByRole("combobox", { name: "Filtrar por etapa" }).click();
  await page.getByRole("option", { name: "Embotellado", exact: true }).click();
  await page.getByRole("link", { name: "Ver" }).first().click();
  await healthy("ficha del lote");
  for (const tab of [
    "Balance",
    "Códigos",
    "Laboratorio",
    "Expediente",
    "Línea de tiempo",
    "Trazabilidad",
    "Correcciones",
    "Archivos",
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    await healthy(`pestaña ${tab}`);
  }
  expect(errors).toEqual([]);
});

test("Ola 2: recorrido de §18 por la interfaz, del lote nuevo al expediente cerrado, con intentos de elusión", async ({
  page,
}) => {
  needsPassword();
  test.setTimeout(900_000);
  const stamp = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
  const LOT = `E2E Singani ${stamp}`;
  // Rechazos que la prueba provoca a propósito (cada uno con su aviso en pantalla).
  const errors = trackErrors(page, [
    /^422 \/api\/v1\/harvest-batches$/,
    /^422 \/api\/v1\/fermentation-tanks$/,
    /^422 \/api\/v1\/production-batches\/[\w-]+\/close$/,
    /^422 \/api\/v1\/lots\/[\w-]+\/dossier\/close$/,
    /^409 \/api\/v1\/lots\/[\w-]+\/corrections$/,
  ]);
  let harvestCode = "";
  let lotCode = "";

  await test.step("la enóloga crea el lote: instantánea de reglas a la vista", async () => {
    await login(page, "enologa@cintiviejo.test");
    await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible({ timeout: 20_000 });
    await side(page, "Lotes");
    await page.getByRole("link", { name: "Nuevo lote" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo lote" })).toBeVisible();
    await page.getByLabel("Nombre del lote").fill(LOT);
    await page.getByRole("combobox", { name: "Tipo de producto" }).click();
    await page.getByRole("option", { name: "Singani" }).click();
    await page.getByLabel("Botellas estimadas").fill("3.000");
    await page.getByLabel("Formato previsto").fill("75");
    await page.getByLabel("Grado previsto de la botella").fill("40");
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/lots") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Crear lote" }).click(),
    ]);
    expect(created.status()).toBe(201);
    await expect(page.getByRole("heading", { name: LOT })).toBeVisible({ timeout: 20_000 });
    const rules = page.getByLabel("Instantánea de reglas del lote");
    await expect(rules).toContainText("1.600 m s. n. m.");
    await expect(rules).toContainText("Moscatel de Alejandría");
    await expect(rules).toContainText("180 días");
    await expect(rules).toContainText("5 %");
    // Los límites de laboratorio se leen por su nombre, no por la clave de la instantánea.
    await expect(rules).not.toContainText("acidezVolatil");
  });

  await test.step("el operario pesa la uva; colar el dictamen en el alta se rechaza (TRC_PHYTO_IN_CREATE)", async () => {
    await switchTo(page, "operario@cintiviejo.test");
    await side(page, "Vendimia y laboratorio");
    await page.getByRole("link", { name: "Registrar ingreso" }).click();
    await page.getByRole("combobox", { name: "Lote" }).click();
    await page.getByRole("option", { name: new RegExp(escapeRe(LOT)) }).click();
    await page.getByRole("combobox", { name: "Terroir de origen" }).click();
    await page.getByRole("option", { name: /Parcela 2 · Cañón Viejo/ }).click();
    await page.getByLabel("Fecha y hora de ingreso").fill(`${daysAgo(200)}T08:00`);
    await page.getByLabel("Peso bruto").fill("18.550");
    await page.getByLabel("Tara").fill("150");

    await tamperNextPost(page, "/api/v1/harvest-batches", { phytosanitaryStatus: "APPROVED" });
    await page.getByRole("button", { name: "Registrar ingreso" }).click();
    await expect(ruleNotice(page)).toContainText("TRC_PHYTO_IN_CREATE", { timeout: 20_000 });

    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/harvest-batches") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Registrar ingreso" }).click(),
    ]);
    expect(created.status()).toBe(201);
    const heading = page.getByRole("heading", { level: 1, name: /^HARV-/ });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    harvestCode = (await heading.textContent())!.trim();
    await expect(page.getByText("18.400 kg").first()).toBeVisible();
    await expect(page.getByText("Pendiente de inspección").first()).toBeVisible();
  });

  await test.step("la enóloga registra el análisis; un tanque con uva sin dictamen se rechaza (TRC_PHYTO_NOT_APPROVED)", async () => {
    await switchTo(page, "enologa@cintiviejo.test");
    await side(page, "Vendimia y laboratorio");
    await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
    await page.getByRole("button", { name: "Registrar análisis" }).click();
    const maturity = page.getByRole("dialog", { name: "Registrar análisis de madurez" });
    await maturity.getByLabel("Grados Brix").fill("23,4");
    await maturity.getByLabel("pH").fill("3,4");
    await maturity.getByLabel("Acidez total").fill("5,9");
    await maturity.getByLabel("Fecha y hora de la medición").fill(`${daysAgo(200)}T10:00`);
    await maturity.getByRole("button", { name: "Guardar análisis" }).click();
    await expect(page.getByText("Análisis registrado", { exact: true })).toBeVisible({ timeout: 20_000 });

    await side(page, "Vinificación");
    await page.getByRole("link", { name: "Llenar tanque" }).click();
    await page.getByRole("checkbox", { name: harvestCode }).click();
    await page.getByLabel("Capacidad").fill("15000");
    await page.getByLabel("Volumen llenado").fill("12.100");
    await page.getByLabel("Fecha de inicio").fill(daysAgo(199));
    await page.getByRole("button", { name: "Llenar tanque" }).first().click();
    await expect(ruleNotice(page)).toContainText("TRC_PHYTO_NOT_APPROVED", { timeout: 20_000 });
  });

  await test.step("el agrónomo aprueba el dictamen", async () => {
    await switchTo(page, "agronomo@cintiviejo.test");
    await side(page, "Vendimia y laboratorio");
    await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
    await page.getByRole("button", { name: "Aprobar lote" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, aprobar" }).click();
    await expect(page.getByText("Lote aprobado").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("list", { name: "Historial de dictámenes" })).toContainText("Agronomía");
  });

  await test.step("tanque de 12.100 L, lectura y fermentación completada con destino singani", async () => {
    await switchTo(page, "enologa@cintiviejo.test");
    await side(page, "Vendimia y laboratorio");
    await page.getByRole("link", { name: harvestCode, exact: true }).first().click();

    // Corrección compensatoria de un sub-registro: el pH del análisis, con el valor anterior a la vista.
    const analyses = page.getByRole("table", { name: /Historial de análisis/ });
    await analyses
      .getByRole("row")
      .nth(1)
      .getByRole("button", { name: /^Corregir/ })
      .click();
    const fix = page.getByRole("dialog", { name: "Corregir análisis de madurez" });
    await fix.getByLabel("pH").fill("3,5");
    await fix.getByLabel("Motivo").fill(`Prueba E2E ${stamp}: pH mal transcrito`);
    const [corrected] = await Promise.all([
      page.waitForResponse(isCorrection),
      fix.getByRole("button", { name: "Registrar corrección" }).click(),
    ]);
    expect(corrected.status()).toBe(201);
    await expect(analyses.getByRole("row").nth(1)).toContainText("Corregido", { timeout: 20_000 });
    await expect(analyses.getByRole("row").nth(1)).toContainText("3,50");

    await page.getByRole("link", { name: "Llenar tanque" }).first().click();
    await expect(page.getByRole("checkbox", { name: harvestCode })).toBeChecked({ timeout: 20_000 });
    await page.getByLabel("Capacidad").fill("15000");
    await page.getByLabel("Volumen llenado").fill("12.100");
    await page.getByLabel("Fecha de inicio").fill(daysAgo(199));
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/fermentation-tanks") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Llenar tanque" }).first().click(),
    ]);
    expect(created.status()).toBe(201);
    await expect(page.getByRole("heading", { level: 1, name: /^TK-/ })).toBeVisible({ timeout: 20_000 });
    await settled(page);

    await page.getByRole("button", { name: "Añadir registro diario" }).first().click();
    const log = page.getByRole("dialog", { name: "Añadir registro diario" });
    await log.getByLabel("Temperatura").fill("22,4");
    await log.getByLabel("Densidad").fill("1,012");
    await log.getByLabel("Fecha y hora").fill(`${daysAgo(197)}T09:00`);
    await log.getByRole("button", { name: "Guardar lectura" }).click();
    await expect(log).toBeHidden({ timeout: 20_000 });

    // Una lectura errónea se anula: sigue en la bitácora, marcada, y no cuenta.
    await page.getByRole("button", { name: "Añadir registro diario" }).first().click();
    await log.getByLabel("Temperatura").fill("41");
    await log.getByLabel("Fecha y hora").fill(`${daysAgo(196)}T09:00`);
    await log.getByRole("button", { name: "Guardar lectura" }).click();
    await expect(log).toBeHidden({ timeout: 20_000 });
    const wrong = page
      .getByRole("table", { name: /^Bitácora de TK-/ })
      .getByRole("row")
      .nth(1);
    await expect(wrong).toContainText("41,0");
    await wrong.getByRole("button", { name: /^Corregir/ }).click();
    const voidLog = page.getByRole("dialog", { name: "Corregir lectura de fermentación" });
    await voidLog.getByText("Anular el registro", { exact: true }).click();
    await voidLog.getByLabel("Motivo").fill(`Prueba E2E ${stamp}: lectura de otro tanque`);
    const [voided] = await Promise.all([
      page.waitForResponse(isCorrection),
      voidLog.getByRole("button", { name: "Anular registro" }).click(),
    ]);
    expect(voided.status()).toBe(201);
    await expect(wrong).toContainText("Anulada", { timeout: 20_000 });
    await expect(page.getByText(/la más reciente primero · 1 anulada$/)).toBeVisible();

    await page.getByRole("button", { name: "Completar fermentación" }).click();
    const decision = page.getByRole("dialog", { name: /Completar la fermentación de TK-/ });
    await decision.getByLabel("Fin de la fermentación").fill(daysAgo(195));
    await decision.getByRole("button", { name: /A destilación/ }).click();
    await decision.getByRole("checkbox").click();
    await decision.getByRole("button", { name: "Confirmar destino y completar" }).click();
    await expect(page.getByText("Destino: Destilación (singani)", { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  await test.step("destilación: cortes mayores que la entrada se rechazan (TRC_MASS_BALANCE_EXCEEDED); cerrada, el reposo ya está cumplido", async () => {
    await page.getByRole("link", { name: "Pasar a destilación" }).click();
    await expect(page.getByRole("heading", { name: "Registrar destilación" })).toBeVisible();
    await page.getByLabel("Alambique").fill(`Alambique E2E ${stamp}`);
    await page.getByLabel("Volumen de entrada").fill("12.100");
    await page.getByLabel("Inicio").fill(daysAgo(192));
    await page.getByRole("button", { name: "Abrir destilación" }).first().click();
    const close = page.getByRole("form", { name: "Cerrar destilación" });
    await expect(close).toBeVisible({ timeout: 20_000 });
    await close.getByLabel("Cabezas").fill("120");
    await close.getByRole("textbox", { name: "Corazón", exact: true }).fill("90.000");
    await close.getByLabel("Colas").fill("210");
    await close.getByLabel("Grado del corazón").fill("60");
    await close.getByLabel("Fin de la destilación").fill(daysAgo(190));
    await close.getByRole("button", { name: "Cerrar destilación" }).click();
    await expect(close.getByTestId("rule-violation-notice")).toContainText("TRC_MASS_BALANCE_EXCEEDED", {
      timeout: 20_000,
    });

    await close.getByRole("textbox", { name: "Corazón", exact: true }).fill("1.500");
    await close.getByRole("button", { name: "Cerrar destilación" }).click();
    await expect(page.getByText("Destilación cerrada", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Candado liberado")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("vista previa: más botellas y más alcohol de los que hay; después, embotellado válido", async () => {
    await page.getByRole("link", { name: "Pasar a embotellado" }).click();
    await expect(page.getByRole("heading", { name: `Embotellar ${LOT}` })).toBeVisible({ timeout: 20_000 });
    const preview = page.getByLabel("Vista previa del servidor");
    await page.getByLabel("Botellas llenadas").fill("3.100");
    await page.getByLabel("Grado alcohólico final").fill("45");
    await page.getByLabel("Adición de agua").fill("750");
    const notice = preview.getByTestId("rule-violation-notice");
    await expect(notice).toContainText("TRC_BOTTLING_EXCEEDS_VOLUME", { timeout: 20_000 });
    await expect(notice).toContainText("TRC_ALCOHOL_BALANCE_EXCEEDED");
    await expect(page.getByRole("button", { name: "Embotellar y generar códigos" })).toBeDisabled();

    await page.getByLabel("Grado alcohólico final").fill("40");
    await page.getByLabel("Botellas llenadas").fill("2.950");
    await expect(preview.getByText("Balance válido")).toBeVisible({ timeout: 20_000 });
    await expect(preview.locator('[data-meter="volume"]')).toContainText("2.212,5 L de 2.250 L");
    await expect(preview.locator('[data-meter="loss"]')).toContainText("1,67 %");
    await expect(preview.locator('[data-meter="alcohol"]')).toContainText("885 L embotellados de 900 L");
    const [bottled] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/lots\/[\w-]+\/bottling$/.test(r.url()) && r.request().method() === "POST",
      ),
      (async () => {
        await page.getByRole("button", { name: "Embotellar y generar códigos" }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Sí, embotellar" }).click();
      })(),
    ]);
    expect(bottled.status()).toBe(201);
    expect(bottled.request().headers()["idempotency-key"], "el embotellado viaja con Idempotency-Key").toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await expect(page).toHaveURL(/\?pestana=codigos$/, { timeout: 20_000 });
    lotCode = (await page
      .getByText(/^CVJ-\d{4}-SINGANI-\d{3}$/)
      .first()
      .textContent())!.trim();
    await expect(page.getByText(`2.950 códigos activos en ${lotCode}`)).toBeVisible({ timeout: 20_000 });
  });

  await test.step("códigos: tabla, CSV (Content-Disposition y X-Export-Rows) y ZIP para la imprenta", async () => {
    const table = page.getByRole("table", { name: `Códigos de botella de ${lotCode}` });
    await expect(table.getByRole("row")).toHaveCount(21, { timeout: 20_000 });
    const [csvResponse, download] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/bottle-codes/export?")),
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar CSV" }).click(),
    ]);
    expect(csvResponse.status()).toBe(200);
    const headers = csvResponse.headers();
    expect(headers["content-type"]).toMatch(/^text\/csv/);
    expect(headers["content-disposition"]).toMatch(
      new RegExp(`attachment; filename="codigos-${lotCode}-1-2950\\.csv"`),
    );
    expect(headers["x-export-rows"]).toBe("2950");
    expect(download.suggestedFilename()).toBe(`codigos-${lotCode}-1-2950.csv`);
    const csv = (await readFile((await download.path())!, "utf8"))
      .replace(/^\uFEFF/, "")
      .trimEnd()
      .split(/\r?\n/);
    expect(csv).toHaveLength(2951);

    await page.getByLabel("Desde la serie", { exact: true }).fill("1");
    await page.getByLabel("Hasta la serie", { exact: true }).fill("50");
    await page.getByRole("button", { name: "Generar ZIP con los QR" }).click();
    // El worker genera el ZIP: la pantalla consulta su estado cada 2 s.
    await expect(page.getByText("Listo para descargar")).toBeVisible({ timeout: 90_000 });
    const href = await page.getByRole("link", { name: "Descargar ZIP" }).getAttribute("href");
    expect(href, "URL firmada del ZIP").toBeTruthy();
    // La descarga del ZIP depende de un endpoint público del almacenamiento: se anota lo que responde.
    const zip = await page.request.get(href!, { failOnStatusCode: false }).then(
      (r) => `${r.status()} ${r.headers()["content-type"] ?? ""}`,
      (e: Error) => `sin respuesta: ${e.message.split("\n")[0]}`,
    );
    test.info().annotations.push({
      type: "zip",
      description: `${new URL(href!).origin}${new URL(href!).pathname.replace(/[\w-]{20,}/g, "…")} → ${zip}`,
    });
    console.log(`[zip] ${new URL(href!).host} → ${zip}`);
  });

  await test.step("un código dañado se anula con sustituto; adjunto privado; reporte con CSV", async () => {
    const table = page.getByRole("table", { name: `Códigos de botella de ${lotCode}` });
    const first = table.getByRole("row").nth(1);
    await first.getByRole("button", { name: /^Anular/ }).click();
    const voidDialog = page.getByRole("alertdialog", { name: /^¿Anular el código / });
    await voidDialog.getByRole("checkbox", { name: "Emitir un código de sustitución" }).click();
    await voidDialog.getByRole("textbox").fill(`Prueba E2E ${stamp}: etiqueta dañada`);
    const [voidedCode] = await Promise.all([
      page.waitForResponse((r) => /\/api\/v1\/bottle-codes\/[^/]+\/void$/.test(r.url())),
      voidDialog.getByRole("button", { name: "Sí, anular" }).click(),
    ]);
    expect(voidedCode.status()).toBeLessThan(300);
    await expect(page.getByText("Código anulado", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
    await page.getByRole("option", { name: "Anulados" }).click();
    await expect(table.getByRole("row")).toHaveCount(2, { timeout: 20_000 });
    await expect(table).toContainText("Sustituido por");

    await page.getByRole("tab", { name: "Archivos" }).click();
    await page.getByRole("button", { name: "Adjuntar archivo" }).first().click();
    const attach = page.getByRole("dialog", { name: "Adjuntar archivo" });
    await attach.getByLabel("Título").fill(`Foto E2E ${stamp}`);
    await attach.getByLabel("Archivo", { exact: true }).setInputFiles({
      name: `foto-${stamp}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%E2E adjunto\n"),
    });
    await expect(attach.getByRole("button", { name: "Quitar" })).toBeVisible({ timeout: 30_000 });
    const [attached] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/lots\/[\w-]+\/attachments$/.test(r.url()) && r.request().method() === "POST",
      ),
      attach.getByRole("button", { name: "Adjuntar" }).click(),
    ]);
    expect(attached.status()).toBe(201);
    const files = page.getByRole("table", { name: `Archivos de ${LOT}` });
    await expect(files.getByRole("row", { name: new RegExp(`Foto E2E ${escapeRe(stamp)}`) })).toContainText("Privado", {
      timeout: 20_000,
    });

    await side(page, "Reportes");
    await expect(page.getByRole("heading", { level: 1, name: "Reportes de producción" })).toBeVisible();
    await settled(page);
    await expect(page.getByRole("row", { name: new RegExp(escapeRe(LOT)) })).toContainText("2.950 bot.", {
      timeout: 20_000,
    });
    const [reportCsv, reportFile] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/reports/production") && r.url().includes("format=csv")),
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar CSV" }).click(),
    ]);
    expect(reportCsv.headers()["content-type"]).toMatch(/^text\/csv/);
    expect(reportCsv.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.csv"/);
    console.log(
      `[reporte] content-disposition=${reportCsv.headers()["content-disposition"]} x-export-rows=${reportCsv.headers()["x-export-rows"] ?? "(sin cabecera)"}`,
    );
    const report = (await readFile((await reportFile.path())!, "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/);
    expect(report[0]).toContain("lotId");
    expect(report.some((line) => line.includes(lotCode))).toBe(true);

    // De vuelta en la ficha del lote.
    await side(page, "Lotes");
    await page.getByRole("searchbox", { name: "Buscar lote" }).fill(stamp);
    await page.getByRole("link", { name: LOT, exact: true }).click();
    await expect(page.getByRole("heading", { name: LOT })).toBeVisible({ timeout: 20_000 });
  });

  await test.step("lote ya embotellado: la corrección que incumple el balance se registra con una incidencia, y otra la resuelve", async () => {
    await page.getByRole("tab", { name: "Correcciones" }).click();
    const correct = async (abv: string, reason: string) => {
      await page.getByRole("button", { name: "Registrar corrección" }).click();
      const dialog = page.getByRole("dialog", { name: "Registrar corrección" });
      await dialog.getByRole("combobox", { name: "Registro que se corrige" }).click();
      await page.getByRole("option", { name: /^Destilación/ }).click();
      await dialog.getByLabel("Grado del corazón").fill(abv);
      await dialog.getByLabel("Motivo").fill(`Prueba E2E ${stamp}: ${reason}`);
      const [response] = await Promise.all([
        page.waitForResponse(isCorrection),
        dialog.getByRole("button", { name: "Registrar corrección" }).click(),
      ]);
      return response;
    };
    // Con el corazón al 30 %, las botellas ya llenadas llevarían más alcohol del que había.
    const breaking = await correct("30", "grado del corazón mal medido");
    expect(breaking.status(), "la corrección se registra aunque incumpla una regla del embotellado").toBe(201);
    await expect(page.getByText("Corrección registrada con una incidencia", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Una corrección dejó una incidencia abierta")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Incidencias de cumplimiento" })).toContainText(
      "Surgió de una corrección",
    );

    const fixing = await correct("60", "se restituye el grado medido");
    expect(fixing.status()).toBe(201);
    await expect(page.getByText("Una corrección dejó una incidencia abierta")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Incidencias de cumplimiento" })).toHaveCount(0);
  });

  await test.step("sin laboratorio el expediente no cierra (TRC_DOSSIER_NOT_READY)", async () => {
    await page.getByRole("tab", { name: "Expediente" }).click();
    const requirements = page.getByRole("list", { name: "Requisitos del expediente" });
    await expect(requirements.locator('[data-requirement="BOTTLED"]')).toHaveAttribute("data-met", "true", {
      timeout: 20_000,
    });
    await expect(requirements.locator('[data-requirement="LAB_CONFORMING"]')).toHaveAttribute("data-met", "false");
    await page.getByRole("button", { name: "Cerrar el expediente" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sí, cerrar el expediente" }).click();
    await expect(ruleNotice(page)).toContainText("TRC_DOSSIER_NOT_READY", { timeout: 20_000 });
  });

  await test.step("laboratorio: la conformidad la calcula el servidor (metanol en mg/100 mL a.a., cobre y grado)", async () => {
    await page.getByRole("tab", { name: "Laboratorio" }).click();
    await page.getByRole("button", { name: "Registrar análisis" }).click();
    const lab = page.getByRole("dialog", { name: "Registrar análisis de laboratorio" });
    await lab.getByRole("textbox", { name: "Laboratorio", exact: true }).fill(`Laboratorio E2E ${stamp}`);
    await lab.getByLabel("Código de acreditación").fill("IBMETRO-LE-042");
    await lab.getByLabel("Grado alcohólico real").fill("40,1");
    await lab.getByRole("textbox", { name: "Acidez total", exact: true }).fill("0,3");
    await lab.getByLabel("Acidez volátil").fill("0,1");
    await lab.getByLabel("Metanol (alcohol anhidro)").fill("85");
    await lab.getByLabel("Cobre").fill("2,1");
    await lab.getByLabel("Informe firmado del laboratorio").setInputFiles({
      name: `informe-${stamp}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%E2E\n"),
    });
    await expect(lab.getByRole("button", { name: "Quitar" })).toBeVisible({ timeout: 30_000 });
    await lab.getByRole("button", { name: "Guardar análisis" }).click();
    await expect(lab).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId("lab-conformity")).toContainText("Conforme", { timeout: 20_000 });
    const checks = page.getByRole("table", { name: "Comprobaciones de la conformidad" });
    await expect(checks.getByRole("row", { name: /Metanol/ })).toContainText("Cumple");
    await expect(checks.getByRole("row", { name: /Cobre/ })).toContainText("Cumple");
  });

  await test.step("cierre del expediente con huella, JSON canónico y corrección rechazada después (TRC_DOSSIER_CLOSED)", async () => {
    await page.getByRole("tab", { name: "Expediente" }).click();
    await expect(page.getByText("5 de 5 requisitos cumplidos")).toBeVisible({ timeout: 20_000 });
    const [closed] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/dossier/close")),
      (async () => {
        await page.getByRole("button", { name: "Cerrar el expediente" }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Sí, cerrar el expediente" }).click();
      })(),
    ]);
    expect(closed.status()).toBeLessThan(300);
    await expect(page.getByText("Huella (SHA-256)")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Raíz Merkle de los 2\.950 códigos de botella/)).toBeVisible();
    const hash = (await page
      .getByTitle(/^[0-9a-f]{64}$/)
      .first()
      .textContent())!.trim();
    const [canonicalResponse, json] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/dossier/canonical")),
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar JSON canónico" }).click(),
    ]);
    expect(canonicalResponse.headers()["content-type"]).toMatch(/^application\/json/);
    const bytes = await readFile((await json.path())!);
    expect(createHash("sha256").update(bytes).digest("hex"), "la huella es el SHA-256 de los bytes canónicos").toBe(
      hash,
    );

    await page.getByRole("tab", { name: "Correcciones" }).click();
    await page.getByRole("button", { name: "Registrar corrección" }).click();
    const correction = page.getByRole("dialog", { name: "Registrar corrección" });
    await correction.getByRole("combobox", { name: "Registro que se corrige" }).click();
    await page.getByRole("option", { name: new RegExp(`Pesaje · ${escapeRe(harvestCode)}`) }).click();
    await correction.getByLabel("Peso bruto").fill("18.600");
    await correction.getByLabel("Motivo").fill(`Prueba E2E ${stamp}: corrección tras el cierre`);
    await correction.getByRole("button", { name: "Registrar corrección" }).click();
    await expect(correction.getByTestId("rule-violation-notice")).toContainText("TRC_DOSSIER_CLOSED", {
      timeout: 20_000,
    });
    await correction.getByRole("button", { name: "Cancelar" }).click();
  });

  await test.step("línea de tiempo, grafo y lista con el expediente cerrado", async () => {
    await page.getByRole("tab", { name: "Línea de tiempo" }).click();
    await expect(page.getByRole("list", { name: "Línea de tiempo del lote" })).toContainText("Expediente cerrado", {
      timeout: 20_000,
    });
    await page.getByRole("tab", { name: "Trazabilidad" }).click();
    const graph = page.getByRole("list", { name: `Trazabilidad de ${LOT}` });
    await expect(graph.locator('[data-stage="HARVEST_BATCH"]')).toContainText("18.400 kg", { timeout: 20_000 });
    await expect(graph.locator('[data-stage="BOTTLING"]')).toContainText("2.950 botellas");
    await side(page, "Lotes");
    await page.getByRole("searchbox", { name: "Buscar lote" }).fill(stamp);
    await expect(page.getByRole("row", { name: new RegExp(escapeRe(LOT)) })).toContainText("Expediente cerrado", {
      timeout: 20_000,
    });
  });

  expect(errors, "respuestas o errores inesperados").toEqual([]);
});

// ---------- Ola 1 · cuenta, invitaciones y equipo (O1-ERP-1 contra O1-BE-1) ----------

const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name, exact: true }).click();

/** Contexto nuevo (otra persona en otro navegador) con su página. */
async function actor(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function signIn(page: Page, email: string, password: string) {
  await paceLogin();
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
