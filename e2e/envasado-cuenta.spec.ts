import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { trackErrors, setDataScenario } from "./support";
import { unzipSync } from "fflate";

// 1E Envasado y QR, 1F Cuenta Stellar y el resto de 1A (perfil y ajustes) contra los mocks.
// Los lotes (lista y ficha del lote del servidor) están en lotes.spec.ts.
// La base de datos de MSW vive en la página: tras una escritura se navega con enlaces (sin recargar).

// Un embotellado sin certificado responde 404 en su certificado: es el estado "sin certificado".
const NO_LAB = /^404 \/api\/v1\/lab-analyses\/batch\//;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();

test("Altos: ninguna crianza liberada, el embotellado queda bloqueado por el candado", async ({ page }) => {
  const errors = trackErrors(page, [NO_LAB]);
  await login(page, "enologa@altos.test");
  await nav(page, "Envasado y QR");
  await expect(page.getByRole("heading", { name: "Envasado y QR" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ALT-2026-WINE-001", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Nuevo embotellado" }).click();
  await page.getByRole("combobox", { name: "Fuente" }).click();
  await expect(page.getByRole("option", { name: "Ninguna liberada todavía" })).toBeVisible();
  await page.getByRole("option", { name: /BAR-FR-2024-01/ }).click();

  await expect(page.getByText("Embotellado bloqueado por candado")).toBeVisible();
  await expect(page.getByText(/Crianza en curso hasta el 3 nov 2026 \(faltan 39 días\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar producción y generar identidad" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Cinti Viejo: embotella un singani con el reposo cumplido y exporta el lote de códigos QR", async ({ page }) => {
  // Recorrido largo (alta, subida de la etiqueta, detalle y exportación): ~27 s en una tableta
  // emulada; con dos workers en una máquina cargada rozaba los 30 s por defecto.
  test.setTimeout(120_000);
  const errors = trackErrors(page, [NO_LAB]);
  // Escenario de datos «lote listo»: el reposo de «Singani Gran Reserva 2026» ya se cumplió.
  await setDataScenario(page, "lote-listo");
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Envasado y QR");
  await page.getByRole("link", { name: "Nuevo embotellado" }).click();

  await page.getByRole("combobox", { name: "Fuente" }).click();
  await page
    .getByRole("option", { name: "Destilación · Alambique de cobre Charentais AL-01 · HARV-2026-VIEJO-008" })
    .click();
  await expect(page.getByText("Embotellado bloqueado por candado")).toHaveCount(0);

  // Corazón de 1.500 L a 60 % → 2.250 L a 40 %: 750 L de agua (caso del contrato §18).
  await expect(page.getByLabel("Grado alcohólico final")).toHaveValue("40");
  await expect(page.getByText(/Ajuste de 60 % a 40 % vol: ≈ 750 L/)).toBeVisible();
  await page.getByRole("button", { name: "Usar esta cifra" }).click();
  await expect(page.getByLabel("Adición de agua")).toHaveValue("750");
  await page.getByLabel(/Botellas llenadas/).fill("2950");
  await page.getByLabel("Tipo de botella").fill("Vidrio flint 750 ml");
  // 2.950 × 0,75 L = 2.212,5 L envasados de 2.250 L disponibles.
  await expect(page.getByText("Merma de envasado 1,7 %")).toBeVisible();

  await page.getByRole("button", { name: "Cerrar producción y generar identidad" }).click();
  const dialog = page.getByRole("dialog", { name: "¿Cerrar la producción?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sí, cerrar y sellar" }).click();

  await expect(page).toHaveURL(/\/envasado\/[\w-]+\?creado=1$/);
  await expect(page.getByRole("heading", { name: "Singani 2026 · sellado" })).toBeVisible();
  // El correlativo lo asigna el backend ({BODEGA}-{AÑO}-{TIPO}-{SEQ}); los mocks lo comparten entre tipos.
  const lot = (await page
    .getByText(/^CVJ-2026-SINGANI-\d{3}$/)
    .first()
    .textContent())!.trim();
  await expect(page.getByText("Pendiente de anclaje").first()).toBeVisible();
  await expect(page.getByText("Sin certificado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar certificado" })).toBeVisible();
  await expect(page.getByText("Códigos provisionales")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`qr-${lot}.csv`);
  const csv = (await readFile((await download.path())!, "utf8")).replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(csv).toHaveLength(2951);
  expect(csv[0]).toBe("codigo,lote,botella,url,estado");
  const [code, lotCol, serial, url, state] = csv[1]!.split(",");
  expect([code, lotCol, serial, state]).toEqual([`${lot}-0001`, lot, "0001", "provisional"]);
  expect(url).toMatch(/^https:\/\/[^/]+\/b\/CVJ-2026-SINGANI-\d{3}\?n=0001$/);

  // ZIP: LEEME, CSV, QR del lote y un SVG por botella.
  const [zipDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar lote de códigos QR" }).click(),
  ]);
  expect(zipDownload.suggestedFilename()).toBe(`qr-${lot}.zip`);
  const entries = Object.keys(unzipSync(new Uint8Array(await readFile((await zipDownload.path())!))));
  expect(entries.filter((e) => e.includes("/botellas/"))).toHaveLength(2950);
  expect(entries).toContain(`${lot}/codigos.csv`);
  expect(entries).toContain(`${lot}/lote-${lot}.svg`);

  // Certificado de laboratorio con su PDF.
  await page.getByRole("button", { name: "Registrar certificado" }).click();
  const lab = page.getByRole("dialog");
  await lab.getByRole("textbox", { name: "Laboratorio", exact: true }).fill("Laboratorio Enológico de Tarija");
  await lab.getByLabel("Código de acreditación").fill("IBMETRO-LE-042");
  await lab.getByLabel("Fecha del análisis").fill("2026-09-25");
  await lab.getByLabel("Grado alcohólico real").fill("40,1");
  await lab.getByLabel("Acidez total (tartárico)").fill("0,3");
  await lab.getByLabel("Acidez volátil (acético)").fill("0,1");
  await lab.getByLabel("Informe en PDF").setInputFiles({
    name: "informe.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%prueba\n"),
  });
  await lab.getByRole("button", { name: "Guardar certificado" }).click();
  await expect(page.getByText(`Certificado registrado para ${lot}`, { exact: true })).toBeVisible();
  // La conformidad la calcula el servidor con los límites del lote: sin metanol ni cobre queda incompleta.
  await expect(page.getByText("SENASAG: sin dictamen")).toBeVisible();

  // El nuevo lote aparece en el listado.
  await page.getByRole("link", { name: "Envasado y QR" }).first().click();
  await expect(page.getByRole("link", { name: lot, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cuenta Stellar: dirección institucional y anclaje de los lotes", async ({ page }) => {
  const errors = trackErrors(page, []);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Cuenta Stellar");
  await expect(page.getByText("GIV5C3L3OJBINOKVC6SMLGDVQAQ5OKCXUHTQKC5WKD2WDEP53V7BFZMM")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver en stellar.expert/ })).toHaveAttribute(
    "href",
    "https://stellar.expert/explorer/testnet/account/GIV5C3L3OJBINOKVC6SMLGDVQAQ5OKCXUHTQKC5WKD2WDEP53V7BFZMM",
  );
  await expect(page.getByText("PROD_BO_2087654031")).toBeVisible();
  await expect(page.getByText("Disponible cuando el backend exponga los activos").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "CVJ-2026-WINE-003", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ajustes: solo lectura para la enóloga; perfil editable", async ({ page }) => {
  const errors = trackErrors(page, []);
  await login(page, "enologa@altos.test");
  await nav(page, "Ajustes");
  await expect(page.getByText("Modo consulta")).toBeVisible();
  await expect(page.getByText("Bodega Altos de Calamuchita").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar datos" })).toHaveCount(0);
  // Equipo: ve nombres y roles, sin correos ni acciones de gestión.
  await nav(page, "Equipo");
  await expect(page.getByRole("cell", { name: "Ing. Diego Paredes" })).toBeVisible();
  await expect(page.getByText("agronomo@altos.test")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invitar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Acciones para/ })).toHaveCount(0);

  await page.goto("/perfil");
  await page.getByLabel("Teléfono").fill("+591 71000999");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Perfil actualizado", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Ajustes: la administración edita la bodega y ve la configuración efectiva", async ({ page }) => {
  const errors = trackErrors(page, []);
  await login(page, "admin@cintiviejo.test");
  await nav(page, "Ajustes");
  await expect(page.getByText("Modo consulta")).toHaveCount(0);

  await page.getByRole("button", { name: "Editar datos" }).click();
  await page.getByLabel("Teléfono de contacto").fill("+591 4 6660000");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Datos de la bodega guardados", { exact: true })).toBeVisible();
  await expect(page.getByText("+591 4 6660000")).toBeVisible();

  // Configuración efectiva: valores de la plataforma, solo lectura.
  await expect(page.getByText("Configuración efectiva", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Reposo mínimo tras la destilación.*180 días/ })).toBeVisible();
  expect(errors).toEqual([]);
});
