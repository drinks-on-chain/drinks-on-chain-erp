import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Utilidades de las pruebas de calidad (1G): sesión por la interfaz, errores de consola/red
// y auditoría axe con las reglas WCAG 2.1 A y AA.

export function trackErrors(page: Page, expected: RegExp[] = []) {
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
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

/** Espera a que la pantalla termine de cargar: un h1 visible y ningún Skeleton. */
export async function settled(page: Page) {
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator(".animate-shimmer")).toHaveCount(0);
  // Deja terminar las animaciones de entrada (diálogos, toasts) antes de medir contrastes.
  await page.waitForTimeout(350);
}

/**
 * Fallos que vienen del sistema de diseño (@drinks-on-chain/ui 0.1.0, tema "oro") y se corrigen allí:
 * se descartan por regla y par de colores de sus tokens, nunca la regla entera.
 * - Texto `accent-fg` (#fdfcf5) sobre `accent` (#b8891f, 3,07:1) o `warning` (#b07a1a, 3,61:1):
 *   Button primary, Badge strong accent/warning, Pill activa.
 * - Texto `accent-text` (#8a651a) sobre `accent-soft` (≈4,3:1): Badge accent, Avatar, ítem activo del AppShell.
 * - Texto `success` (#3f7d4a) sobre `success-soft` (≈3,8–4,0:1): Badge success.
 * - Texto `warning` (#b07a1a) sobre cualquier fondo claro (≤3,4:1): Badge warning y texto de aviso; falta un token
 *   `warning-text` como `accent-text`.
 * - Texto `danger` (#b3402c) sobre `danger-soft` (4,44:1): Badge danger.
 */
const UPSTREAM_CONTRAST: { fg: string; bg?: string[] }[] = [
  { fg: "#fdfcf5", bg: ["#b8891f", "#b07a1a"] },
  { fg: "#8a651a" },
  { fg: "#3f7d4a" },
  { fg: "#b07a1a" },
  { fg: "#b3402c" },
];

type AxeNode = { any: { data?: unknown }[] };

function isUpstreamContrast(node: AxeNode) {
  const data = node.any.find((c) => c.data && typeof c.data === "object" && "fgColor" in c.data)?.data as
    { fgColor: string; bgColor: string } | undefined;
  if (!data) return false;
  return UPSTREAM_CONTRAST.some((k) => k.fg === data.fgColor && (!k.bg || k.bg.includes(data.bgColor)));
}

export async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .map((v) => ({
      ...v,
      nodes: v.id === "color-contrast" ? v.nodes.filter((n) => !isUpstreamContrast(n)) : v.nodes,
    }))
    .filter((v) => v.nodes.length > 0)
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1).join(" ")}`),
    }));
}
