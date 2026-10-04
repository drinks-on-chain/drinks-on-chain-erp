import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Utilidades de las pruebas de calidad (1G): sesión por la interfaz, errores de consola/red
// y auditoría axe con las reglas WCAG 2.1 A y AA.

/**
 * Al arrancar, la app intenta recuperar la sesión con la cookie de renovación
 * (`POST /api/v1/auth/refresh`): sin cookie responde 401 y es lo esperado.
 */
const BOOT_REFRESH = /^401 \/api\/v1\/auth\/refresh$/;

export function trackErrors(page: Page, expected: RegExp[] = []) {
  expected = [BOOT_REFRESH, ...expected];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()),
  );
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const line = `${r.status()} ${new URL(r.url()).pathname}`;
    if (!expected.some((re) => re.test(line))) errors.push(line);
  });
  return errors;
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
}

/** Escenarios de datos de los mocks 0.5 (Ola 2): en qué etapa está el lote de demostración. */
export type DataScenario = "lote-en-reposo" | "lote-listo" | "lote-con-incidencia" | "laboratorio-no-conforme";

/**
 * Fija un escenario de datos de los mocks antes de entrar: queda en `localStorage`, así que
 * sobrevive a las recargas de la prueba (cada prueba tiene su propio contexto de navegador).
 */
export async function setDataScenario(page: Page, scenario: DataScenario) {
  await page.goto("/login");
  await page.waitForFunction(() => "__docMocks" in window);
  await page.evaluate(
    (name) => (window as unknown as { __docMocks: { setScenario: (n: string) => void } }).__docMocks.setScenario(name),
    scenario,
  );
}

/** Espera a que la pantalla termine de cargar: un h1 visible y ningún Skeleton. */
export async function settled(page: Page) {
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator(".animate-shimmer")).toHaveCount(0);
  // Deja terminar las animaciones de entrada (diálogos, toasts) antes de medir contrastes.
  await page.waitForTimeout(350);
}

export async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1).join(" ")}`),
  }));
}

type MockMail = { to: string; subject: string; template: string; link: string | null; token: string | null };

/**
 * Último correo del buzón simulado de los mocks (`window.__docMocks.mailbox`, como Mailpit) para
 * `to` y la plantilla. Devuelve la ruta del enlace dentro de la app (sin el origen).
 */
export async function mailLink(page: Page, to: string, template: string): Promise<string> {
  await page.waitForFunction(() => "__docMocks" in window);
  const mail = await page.evaluate(
    ({ to, template }) =>
      (
        window as unknown as { __docMocks: { mailbox: { latest: (f: object) => MockMail | null } } }
      ).__docMocks.mailbox.latest({ to, template }),
    { to, template },
  );
  expect(mail?.link, `correo ${template} para ${to}`).toBeTruthy();
  const url = new URL(mail!.link!);
  return `${url.pathname}${url.search}`;
}

/** Cierra la sesión desde el menú de usuario del shell. */
export async function logout(page: Page) {
  await page.getByRole("button", { name: /Menú de usuario/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
