import { expect, test, type Page } from "@playwright/test";
import { login, settled, trackErrors } from "./support";

// 1G · Teclado: pesaje, dictamen y bitácora del tanque solo con Tab, Mayús+Tab, Intro, Espacio y Esc.
// Se comprueba el orden de foco, que el foco es visible y que Esc cierra y devuelve el foco al disparador.

const ALTOS_FERMENTING_TANK = "f87af6c0-197d-5fa3-b85e-29d7b27f00d9";

/** Nombre accesible aproximado del elemento con foco (etiqueta del campo, aria-label o texto). */
function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "";
    const byId = (ids: string | null) =>
      (ids ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
    const input = el as HTMLInputElement;
    const name =
      el.getAttribute("aria-label") ??
      (el.getAttribute("aria-labelledby") ? byId(el.getAttribute("aria-labelledby")) : null) ??
      (input.labels?.[0]?.textContent || null) ??
      el.textContent ??
      "";
    return name.replace("*", "").replace(/\s+/g, " ").trim();
  });
}

/** El elemento con foco tiene un anillo visible (outline de 2 px o sombra). */
function hasVisibleFocus(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
    return outline || s.boxShadow !== "none";
  });
}

/** Pulsa Tab (o Mayús+Tab) hasta que el foco llega a `name`; devuelve los nombres recorridos. */
async function tabTo(page: Page, name: string | RegExp, { max = 60, back = false } = {}) {
  const seen: string[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    const current = await focused(page);
    if (seen.at(-1) !== current) seen.push(current);
    if (typeof name === "string" ? current === name : name.test(current)) {
      expect(await hasVisibleFocus(page), `foco visible en «${current}»`).toBe(true);
      return seen;
    }
  }
  throw new Error(`El foco no llegó a «${String(name)}» tras ${max} pulsaciones: ${seen.join(" → ")}`);
}

async function expectFocus(page: Page, name: string | RegExp) {
  await expect.poll(() => focused(page)).toMatch(typeof name === "string" ? new RegExp(`^${name}$`) : name);
  expect(await hasVisibleFocus(page)).toBe(true);
}

test("pesaje y dictamen completos solo con teclado", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await page.goto("/vendimia/pesaje");
  await settled(page);

  // El primer Tab muestra el salto al contenido; Intro lleva al formulario sin pasar por el menú.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await tabTo(page, "Terroir de origen", { max: 3 });

  // Select de Radix: Espacio abre, flechas eligen, Intro confirma y el foco vuelve al combobox.
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expectFocus(page, "Terroir de origen");
  await expect(page.getByRole("combobox", { name: "Terroir de origen" })).not.toContainText("Elige la parcela");

  const order = ["Terroir de origen"];
  const step = async (name: string, text?: string) => {
    const seen = await tabTo(page, name, { max: 8 });
    order.push(...seen.filter((n) => n !== order.at(-1)));
    if (text !== undefined) await page.keyboard.type(text);
  };
  await step("Año de cosecha");
  await step("Peso bruto", "12600");
  await step("Tara", "200");
  await expect(page.locator("output")).toContainText("12.400");
  // Mayús+Tab vuelve al bruto y Tab regresa a la tara.
  await page.keyboard.press("Shift+Tab");
  await expectFocus(page, "Peso bruto");
  await page.keyboard.press("Tab");
  await expectFocus(page, "Tara");
  await step("Grados Brix", "23,8");
  await step("pH", "3,45");
  await step("Acidez total", "6,1");
  await step("Temperatura de la uva al ingreso", "16,2");
  await step("Notas", "Pesaje con teclado.");
  await step("Cancelar");
  await step("Registrar ingreso");

  // Orden lógico: báscula de arriba abajo y después el laboratorio, sin saltos fuera del formulario.
  expect(order.filter((n) => !n.startsWith("Fecha y hora"))).toEqual([
    "Terroir de origen",
    "Año de cosecha",
    "Peso bruto",
    "Tara",
    "Grados Brix",
    "pH",
    "Acidez total",
    "Temperatura de la uva al ingreso",
    "Notas",
    "Cancelar",
    "Registrar ingreso",
  ]);
  expect(order).toContain("Fecha y hora de ingreso");

  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: /^HARV-2026-/ })).toBeVisible();

  // Dictamen: Intro abre el modal con el foco dentro; Esc lo cierra y el foco vuelve al botón.
  await tabTo(page, "Aprobar lote");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Esta decisión es definitiva");
  await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  // El foco queda atrapado en el modal.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocus(page, "Aprobar lote");

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await tabTo(page, "Notas", { max: 10 });
  await page.keyboard.type("Inspección visual sin botritis.");
  await tabTo(page, "Sí, aprobar", { max: 5 });
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Lote aprobado").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("bitácora diaria del tanque solo con teclado", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");
  await page.goto(`/vinificacion/${ALTOS_FERMENTING_TANK}`);
  await settled(page);

  // La acción principal está en la barra superior, después del menú lateral y las migas.
  await tabTo(page, "Añadir registro diario");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Añadir registro diario" });
  await expect(dialog).toBeVisible();
  // El foco empieza en la temperatura (campo obligatorio, táctil).
  await expectFocus(page, "Temperatura");

  await page.keyboard.type("24,5");
  await tabTo(page, "Densidad", { max: 1 });
  await page.keyboard.type("1,040");
  await tabTo(page, "pH", { max: 1 });
  await page.keyboard.press("Shift+Tab");
  await expectFocus(page, "Densidad");
  await page.keyboard.press("Tab");
  await page.keyboard.type("3,5");
  await tabTo(page, "Observaciones de CO₂", { max: 1 });
  await page.keyboard.type("Burbujeo constante");
  await tabTo(page, "Notas", { max: 8 });
  await tabTo(page, "Cancelar", { max: 2 });
  await tabTo(page, "Guardar lectura", { max: 1 });
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Lectura registrada").first()).toBeVisible();
  await expectFocus(page, "Añadir registro diario");
  await expect(page.getByRole("table", { name: /Bitácora de TK-04/ })).toContainText("24,5");

  // Esc cierra sin guardar y devuelve el foco al disparador.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocus(page, "Añadir registro diario");
  expect(errors).toEqual([]);
});

test("Esc cierra el alta de miembro y el foco vuelve al botón", async ({ page }) => {
  await login(page, "admin@cintiviejo.test");
  await page.goto("/ajustes");
  await settled(page);
  await tabTo(page, "Añadir miembro");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Añadir miembro" });
  await expect(dialog).toBeVisible();
  await tabTo(page, "Nombre completo", { max: 3 });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocus(page, "Añadir miembro");
});
