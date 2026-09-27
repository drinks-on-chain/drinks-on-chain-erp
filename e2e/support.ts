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
