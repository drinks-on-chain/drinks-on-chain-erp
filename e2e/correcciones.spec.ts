import { expect, test, type Page } from "@playwright/test";
import { login, trackErrors } from "./support";

// Correcciones compensatorias (contrato de la Ola 2 §9, mocks 0.5.0-rc.2): los registros anulados
// siguen a la vista, marcados y fuera de los cálculos; análisis, dictámenes y lecturas se corrigen
// desde su pesaje o su tanque; y lo que el servidor no admite, lo explica el aviso.
// Los mocks viven en la memoria de la página: tras escribir se navega solo con clics.

test.describe.configure({ timeout: 90_000 });

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();
const REASON = "Se transcribió mal el valor en la planilla";

test("un análisis de madurez anulado queda tachado y deja de ser el vigente", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "HARV-2026-ROQUE-05", exact: true }).first().click();

  // Dos análisis: el más reciente es el vigente.
  await page.getByRole("button", { name: "Registrar análisis" }).click();
  const form = page.getByRole("dialog", { name: "Registrar análisis de madurez" });
  await form.getByLabel("Grados Brix").fill("31,5");
  await form.getByLabel("pH").fill("3,5");
  await form.getByLabel("Acidez total").fill("6,1");
  await form.getByRole("button", { name: "Guardar análisis" }).click();
  await expect(form).toBeHidden();
  const table = page.getByRole("table", { name: /Historial de análisis/ });
  const newest = table.getByRole("row").nth(1);
  await expect(newest).toContainText("31,5");
  await expect(newest).toContainText("Vigente");

  // Se anula el recién registrado (un Brix imposible): sigue en el historial, tachado y sin contar.
  await newest.getByRole("button", { name: /^Corregir/ }).click();
  const dialog = page.getByRole("dialog", { name: "Corregir análisis de madurez" });
  await dialog.getByText("Anular el registro", { exact: true }).click();
  await dialog.getByLabel("Motivo").fill(REASON);
  await dialog.getByRole("button", { name: "Anular registro" }).click();
  await expect(page.getByText("Registro anulado", { exact: true })).toBeVisible();
  await expect(newest).toContainText("Anulado");
  await expect(newest).not.toContainText("Vigente");
  await expect(newest.getByRole("button", { name: /^Corregir/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("un dictamen con la uva ya en un tanque no se anula (TRC_PHYTO_DECISION_FINAL)", async ({ page }) => {
  const errors = trackErrors(page, [/^409 \/api\/v1\/lots\/[\w-]+\/corrections$/]);
  await login(page, "agronomo@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "HARV-2026-PARRALES-01", exact: true }).first().click();
  await page
    .getByRole("list", { name: "Historial de dictámenes" })
    .getByRole("button", { name: /^Anular dictamen/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Corregir dictamen fitosanitario" });
  await expect(dialog.getByText(/solo se puede anular/)).toBeVisible();
  await dialog.getByLabel("Motivo").fill("El dictamen se registró sobre el pesaje equivocado");
  await dialog.getByRole("button", { name: "Anular registro" }).click();
  const notice = dialog.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("TRC_PHYTO_DECISION_FINAL");
  await expect(notice).toContainText("El dictamen ya es definitivo");
  expect(errors).toEqual([]);
});

test("una lectura del tanque se anula y otra se corrige, y las dos quedan marcadas", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");
  await nav(page, "Vinificación");
  await page.getByTestId("tank-card").filter({ hasText: "TK-04" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Temperatura alta" })).toBeVisible();
  const logs = page.getByRole("table", { name: "Bitácora de TK-04" });
  const first = logs.getByRole("row").nth(1);
  await expect(first).toContainText("27,5");

  // La lectura era un error de transcripción: se anula y queda tachada, fuera de la cuenta.
  await first.getByRole("button", { name: /^Corregir/ }).click();
  const dialog = page.getByRole("dialog", { name: "Corregir lectura de fermentación" });
  await dialog.getByText("Anular el registro", { exact: true }).click();
  await dialog.getByLabel("Motivo").fill(REASON);
  await dialog.getByRole("button", { name: "Anular registro" }).click();
  await expect(page.getByText("Registro anulado", { exact: true })).toBeVisible();
  await expect(first).toContainText("Anulada");
  await expect(first.getByRole("button", { name: /^Corregir/ })).toHaveCount(0);
  await expect(page.getByText(/la más reciente primero · 1 anulada$/)).toBeVisible();

  // Y la siguiente se corrige: guarda el valor anterior y queda marcada.
  const second = logs.getByRole("row").nth(2);
  await second.getByRole("button", { name: /^Corregir/ }).click();
  await dialog.getByLabel("Temperatura").fill("24,2");
  await dialog.getByLabel("Motivo").fill(REASON);
  await dialog.getByRole("button", { name: "Registrar corrección" }).click();
  await expect(page.getByText("Corrección registrada", { exact: true })).toBeVisible();
  await expect(second).toContainText("24,2");
  await expect(second).toContainText("Corregida");
  expect(errors).toEqual([]);
});

test("en un lote ya embotellado, la corrección que incumple el candado se registra y abre una incidencia", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await page
    .getByRole("row", { name: /CVJ-L2025-003/ })
    .getByRole("link", { name: "Ver" })
    .click();
  await page.getByRole("tab", { name: "Correcciones" }).click();
  await page.getByRole("button", { name: "Registrar corrección" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar corrección" });
  await dialog.getByRole("combobox", { name: "Registro que se corrige" }).click();
  await page.getByRole("option", { name: /^Crianza/ }).click();
  // Con 60 meses de crianza el candado no se habría liberado al embotellar: ya no se puede evitar.
  await dialog.getByLabel("Meses de crianza").fill("60");
  await dialog.getByLabel("Motivo").fill("La crianza prevista se anotó mal al iniciarla");
  await dialog.getByRole("button", { name: "Registrar corrección" }).click();

  await expect(page.getByText("Corrección registrada con una incidencia", { exact: true })).toBeVisible();
  await expect(page.getByText("Una corrección dejó una incidencia abierta")).toBeVisible();
  const issues = page.getByRole("region", { name: "Incidencias de cumplimiento" });
  await expect(issues).toContainText("Surgió de una corrección");
  await expect(issues).toContainText("TRC_LOCK_NOT_RELEASED");
  await expect(page.getByRole("list", { name: "Correcciones del lote" })).toContainText("Meses de crianza");
  expect(errors).toEqual([]);
});
