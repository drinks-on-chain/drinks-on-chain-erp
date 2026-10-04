import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { login, logout, setDataScenario, trackErrors } from "./support";

// Fase 3 de O2-ERP-1: embotellado del lote con la vista previa del servidor, balance kilos → litros
// → botellas y códigos por botella (contrato de la Ola 2 §6, §7 y §11.3), contra los mocks 0.5.
// Los mocks viven en la memoria de la página: tras crear datos se navega solo con clics.

test.describe.configure({ timeout: 120_000 });

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();
const preview = (page: Page) => page.getByLabel("Vista previa del servidor");
const submit = (page: Page) => page.getByRole("button", { name: "Embotellar y generar códigos" });

test("Altos: la crianza sin cumplir bloquea el embotellado y el aviso explica el candado", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");
  await nav(page, "Envasado y QR");
  await page.getByRole("link", { name: "Nuevo embotellado" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo embotellado" })).toBeVisible();

  // Los lotes en crianza, con el candado que evalúa el servidor.
  const row = page.getByRole("row", { name: /Tannat 2025/ });
  await expect(row).toContainText("Faltan 39 días · se libera el 3 nov 2026");
  await row.getByRole("link", { name: "Embotellar Tannat 2025" }).click();

  await expect(page.getByRole("heading", { name: "Embotellar Tannat 2025" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Fuentes del embotellado" })).toContainText("BAR-FR-2024-01");
  await page.getByLabel("Botellas llenadas").fill("4.000");
  await page.getByLabel("Grado alcohólico final").fill("13,5");

  const notice = preview(page).getByTestId("rule-violation-notice");
  await expect(notice).toContainText("TRC_LOCK_NOT_RELEASED");
  await expect(notice).toContainText("3 nov 2026");
  await expect(notice).toContainText("39 días");
  await expect(preview(page)).toContainText("El servidor no lo admitiría");
  await expect(submit(page)).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Cinti Viejo: embotella el singani con el reposo cumplido, exporta sus códigos y anula uno", async ({ page }) => {
  test.setTimeout(180_000);
  // La lista de embotellados consulta el certificado de cada uno: 404 = sin certificado.
  const errors = trackErrors(page, [/^404 \/api\/v1\/lab-analyses\/batch\//]);
  // Escenario «lote listo»: el reposo de «Singani Gran Reserva 2026» ya se cumplió.
  await setDataScenario(page, "lote-listo");
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Envasado y QR");
  await page.getByRole("link", { name: "Nuevo embotellado" }).click();
  await page.getByRole("link", { name: "Embotellar Singani Gran Reserva 2026" }).click();
  await expect(page.getByRole("heading", { name: "Embotellar Singani Gran Reserva 2026" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Fuentes del embotellado" })).toContainText("Candado liberado");
  await expect(page.getByRole("list", { name: "Fuentes del embotellado" })).toContainText("1.500 L · al 60,0 % vol");

  // Más botellas y más alcohol de los que hay: el servidor lo dice en la vista previa.
  await page.getByLabel("Botellas llenadas").fill("3.100");
  await page.getByLabel("Grado alcohólico final").fill("45");
  await page.getByLabel("Adición de agua").fill("750");
  const notice = preview(page).getByTestId("rule-violation-notice");
  await expect(notice).toContainText("Más botellas que litros disponibles");
  await expect(notice).toContainText("TRC_BOTTLING_EXCEEDS_VOLUME");
  await expect(notice).toContainText("Más alcohol embotellado que el del corazón");
  await expect(notice).toContainText("TRC_ALCOHOL_BALANCE_EXCEEDED");
  await expect(preview(page).locator('[data-meter="volume"]')).toHaveAttribute("data-over", "true");
  await expect(preview(page).locator('[data-meter="alcohol"]')).toHaveAttribute("data-over", "true");
  await expect(submit(page)).toBeDisabled();

  // Corazón de 1.500 L a 60 % → 2.250 L a 40 %: 750 L de agua (caso del contrato §18).
  await page.getByLabel("Grado alcohólico final").fill("40");
  await page.getByLabel("Adición de agua").fill("");
  await expect(page.getByText("Para llegar al grado final harían falta ≈ 750 L.")).toBeVisible();
  await page.getByRole("button", { name: "Usar esta cifra" }).click();
  await expect(page.getByLabel("Adición de agua")).toHaveValue("750");
  await page.getByLabel("Botellas llenadas").fill("2.950");
  await page.getByLabel("Tipo de botella").fill("Vidrio flint 750 ml");

  // 2.950 × 0,75 L = 2.212,5 L de 2.250 L: balance válido, con la merma dentro de la tolerada.
  await expect(preview(page).getByText("Balance válido")).toBeVisible();
  await expect(preview(page).locator('[data-meter="volume"]')).toContainText("2.212,5 L de 2.250 L");
  await expect(preview(page).locator('[data-meter="loss"]')).toContainText("1,67 % (37,5 L)");
  await expect(preview(page).locator('[data-meter="alcohol"]')).toContainText("885 L embotellados de 900 L");
  await expect(notice).toHaveCount(0);

  await submit(page).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Embotellar Singani Gran Reserva 2026?" });
  await dialog.getByRole("button", { name: "Sí, embotellar" }).click();

  // La ficha del lote, en sus códigos: uno por botella.
  await expect(page).toHaveURL(/\/lotes\/[\w-]+\?pestana=codigos$/);
  await expect(page.getByText("Lote embotellado", { exact: true })).toBeVisible();
  const lotCode = (await page
    .getByText(/^CVJ-2026-SINGANI-\d{3}$/)
    .first()
    .textContent())!.trim();
  const table = page.getByRole("table", { name: `Códigos de botella de ${lotCode}` });
  await expect(table.getByRole("row")).toHaveCount(21);
  await expect(page.getByText(`2.950 códigos activos en ${lotCode}`)).toBeVisible();

  // CSV con todas las series.
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar CSV" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe(`codigos-${lotCode}-1-2950.csv`);
  const csv = (await readFile((await csvDownload.path())!, "utf8")).replace(/^﻿/, "").trimEnd().split(/\r?\n/);
  expect(csv).toHaveLength(2951);
  expect(csv[0]).toContain("serial");
  await expect(page.getByText("CSV descargado", { exact: true })).toBeVisible();

  // Un rango mal escrito no sale del navegador; con un rango válido, el ZIP para la imprenta.
  await page.getByLabel("Desde la serie", { exact: true }).fill("200");
  await page.getByLabel("Hasta la serie", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Generar ZIP con los QR" }).click();
  await expect(page.getByText("La serie final no puede ser menor que la inicial.")).toBeVisible();
  await page.getByLabel("Desde la serie", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Generar ZIP con los QR" }).click();
  await expect(page.getByText("Listo para descargar")).toBeVisible();
  await expect(page.getByText("ZIP de 100 códigos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar ZIP" })).toHaveAttribute("href", /\.zip/);

  // Anular un código dañado, con sustituto de la misma serie.
  const first = table.getByRole("row").nth(1);
  const code = (await first.getByRole("cell").nth(1).innerText()).split("\n")[0]!.trim();
  await first.getByRole("button", { name: /^Anular/ }).click();
  const voidDialog = page.getByRole("alertdialog", { name: `¿Anular el código ${code}?` });
  await voidDialog.getByRole("checkbox", { name: "Emitir un código de sustitución" }).click();
  await voidDialog.getByRole("textbox").fill("Etiqueta dañada en la línea de embotellado");
  await voidDialog.getByRole("button", { name: "Sí, anular" }).click();
  await expect(page.getByText("Código anulado", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Anulados" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Etiqueta dañada en la línea de embotellado");
  await expect(table).toContainText("Sustituido por");

  // El balance del lote ya incluye el embotellado.
  await page.getByRole("tab", { name: "Balance" }).click();
  const steps = page.getByRole("list", { name: "Conciliación del lote" });
  await expect(steps).toContainText("2.212,5 L");
  await expect(steps).toContainText("2.950 botellas");
  await expect(page.getByRole("list", { name: "Balance del embotellado" })).toContainText("1,67 %");

  // Y el lote figura embotellado, con su código de lote.
  await nav(page, "Lotes");
  const row = page.getByRole("row", { name: /CVJ-L2026-005/ });
  await expect(row).toContainText("Embotellado");
  await expect(row).toContainText(lotCode);
  expect(errors).toEqual([]);
});

test("Cinti Viejo: un lote ya embotellado no admite un segundo embotellado (TRC_LOT_ALREADY_BOTTLED)", async ({
  page,
}) => {
  const errors = trackErrors(page, [/^409 \/api\/v1\/lots\/[\w-]+\/bottling\/preview$/]);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await page
    .getByRole("row", { name: /CVJ-L2025-001/ })
    .getByRole("link", { name: "Ver" })
    .click();
  await expect(page.getByRole("tab", { name: "Códigos" })).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname}/embotellar`);

  await expect(page.getByText("Este lote ya está embotellado")).toBeVisible();
  await page.getByLabel("Botellas llenadas").fill("100");
  await page.getByLabel("Grado alcohólico final").fill("40");
  const notice = preview(page).getByTestId("rule-violation-notice");
  await expect(notice).toContainText("TRC_LOT_ALREADY_BOTTLED");
  await expect(submit(page)).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Cinti Viejo: la ficha de un lote embotellado lista sus códigos y su balance; el operario solo ve el total", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await page
    .getByRole("row", { name: /CVJ-L2025-001/ })
    .getByRole("link", { name: "Ver" })
    .click();
  await page.getByRole("tab", { name: "Códigos" }).click();
  await expect(page).toHaveURL(/pestana=codigos$/);
  await expect(page.getByText("Códigos por botella", { exact: true })).toBeVisible();
  const table = page.getByRole("table", { name: /Códigos de botella de CVJ-2026-SINGANI-001/ });
  await expect(table.getByRole("row")).toHaveCount(21);
  // El rango se filtra en el servidor.
  await page.getByLabel("Desde la serie (filtro)").fill("4.079");
  await expect(table.getByRole("row")).toHaveCount(3);

  await page.getByRole("tab", { name: "Balance" }).click();
  await expect(page.getByRole("list", { name: "Conciliación del lote" })).toContainText("Embotellado");
  await expect(page.getByRole("list", { name: "Balance del embotellado" })).toContainText("Volumen embotellado");
  const lotUrl = new URL(page.url()).pathname;

  // El operario no lee el balance ni la lista de códigos (antifalsificación): solo el total.
  await logout(page);
  await login(page, "operario@cintiviejo.test");
  await page.goto(`${lotUrl}?pestana=codigos`);
  await expect(page.getByText("4.080 códigos de botella activos")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Balance" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Descargar CSV" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
