import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { logout, trackErrors } from "./support";

// Recorrido H2 del contrato de la Ola 2 (§18) contra los mocks, con las personas de la Destilería
// Cinti Viejo: del lote nuevo al expediente cerrado, pasando por el pesaje, el análisis, el
// dictamen, el tanque, la destilación con cortes, el embotellado con su vista previa, los códigos
// de botella y el laboratorio. El «hoy» de los mocks es el 25-09-2026: las fechas del proceso se
// declaran en marzo para que el reposo de 180 días ya esté cumplido.
// Los mocks viven en la memoria de la página: se navega solo con clics (sin recargar).

const LOT = "Singani Recorrido H2 2026";

async function signIn(page: Page, email: string) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
}

async function switchTo(page: Page, email: string) {
  await logout(page);
  await signIn(page, email);
}

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();
const notice = (page: Page) => page.getByTestId("rule-violation-notice");

/** Abre la ficha del lote del recorrido desde la lista. */
async function openLot(page: Page) {
  await nav(page, "Lotes");
  await page.getByRole("link", { name: LOT, exact: true }).click();
  await expect(page.getByRole("heading", { name: LOT })).toBeVisible();
}

test("recorrido H2: del lote nuevo al expediente cerrado, con las reglas a la vista", async ({ page }) => {
  test.setTimeout(420_000);
  const errors = trackErrors(page, [
    // Intentos que el servidor rechaza y la pantalla explica (pruebas de elusión de §18).
    /^422 \/api\/v1\/lots\/[\w-]+\/dossier\/close$/,
    /^409 \/api\/v1\/lots\/[\w-]+\/corrections$/,
    // La lista de embotellados no pide certificados; el JSON canónico se descarga con la sesión.
  ]);
  await page.goto("/login");

  // 1. La enóloga crea el lote: la instantánea fija 1.600 m, Moscatel de Alejandría, 180 días y merma del 5 %.
  await signIn(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await page.getByRole("link", { name: "Nuevo lote" }).click();
  await page.getByLabel("Nombre del lote").fill(LOT);
  await page.getByRole("combobox", { name: "Tipo de producto" }).click();
  await page.getByRole("option", { name: "Singani" }).click();
  await page.getByLabel("Botellas estimadas").fill("3.000");
  await page.getByLabel("Formato previsto").fill("75");
  await page.getByLabel("Grado previsto de la botella").fill("40");
  await page.getByRole("button", { name: "Crear lote" }).click();
  await expect(page.getByRole("heading", { name: LOT })).toBeVisible();
  const rules = page.getByLabel("Instantánea de reglas del lote");
  await expect(rules).toContainText("1.600 m s. n. m.");
  await expect(rules).toContainText("Moscatel de Alejandría");
  await expect(rules).toContainText("180 días");
  await expect(rules).toContainText("5 %");

  // 2. El operario pesa la uva (18.400 kg netos, en marzo) desde una parcela apta, sin análisis ni dictamen.
  await switchTo(page, "operario@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "Registrar ingreso" }).click();
  await page.getByRole("combobox", { name: "Lote" }).click();
  await page.getByRole("option", { name: new RegExp(LOT) }).click();
  await page.getByRole("combobox", { name: "Terroir de origen" }).click();
  await page.getByRole("option", { name: /Parcela 2 · Cañón Viejo/ }).click();
  await page.getByLabel("Fecha y hora de ingreso").fill("2026-03-09T08:00");
  await page.getByLabel("Peso bruto").fill("18.550");
  await page.getByLabel("Tara").fill("150");
  await page.getByRole("button", { name: "Registrar ingreso" }).click();
  const harvestHeading = page.getByRole("heading", { name: /^HARV-2026-/ });
  await expect(harvestHeading).toBeVisible();
  const harvestCode = (await harvestHeading.textContent())!.trim();
  await expect(page.getByText("18.400 kg").first()).toBeVisible();
  await expect(page.getByText("Pendiente de inspección").first()).toBeVisible();
  await expect(page.getByText("Sin análisis de madurez")).toBeVisible();

  // La enóloga registra el análisis de madurez, aparte del pesaje.
  await switchTo(page, "enologa@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
  await page.getByRole("button", { name: "Registrar análisis" }).click();
  const maturity = page.getByRole("dialog", { name: "Registrar análisis de madurez" });
  await maturity.getByLabel("Grados Brix").fill("23,4");
  await maturity.getByLabel("pH").fill("3,4");
  await maturity.getByLabel("Acidez total").fill("5,9");
  await maturity.getByLabel("Fecha y hora de la medición").fill("2026-03-09T10:00");
  await maturity.getByRole("button", { name: "Guardar análisis" }).click();
  await expect(page.getByText("Análisis registrado", { exact: true })).toBeVisible();

  // El agrónomo aprueba el dictamen fitosanitario.
  await switchTo(page, "agronomo@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
  await page.getByRole("button", { name: "Aprobar lote" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, aprobar" }).click();
  await expect(page.getByText("Lote aprobado").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Historial de dictámenes" })).toContainText("Agronomía");

  // 3. La enóloga llena el tanque (12.100 L), registra una lectura y completa la fermentación con destino singani.
  await switchTo(page, "enologa@cintiviejo.test");
  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: harvestCode, exact: true }).first().click();
  await page.getByRole("link", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("checkbox", { name: harvestCode })).toBeChecked();
  // La uva ya pertenece al lote: el tanque hereda el lote del pesaje.
  await expect(page.getByRole("group", { name: "Pesajes que entran al tanque" })).toContainText(LOT);
  await page.getByLabel("Capacidad").fill("15000");
  await page.getByLabel("Volumen llenado").fill("12.100");
  await page.getByLabel("Fecha de inicio").fill("2026-03-10");
  await page.getByRole("button", { name: "Llenar tanque" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: /^TK-\d+$/ })).toBeVisible();

  await page.getByRole("button", { name: "Añadir registro diario" }).first().click();
  const log = page.getByRole("dialog", { name: "Añadir registro diario" });
  await log.getByLabel("Temperatura").fill("22,4");
  await log.getByLabel("Densidad").fill("1,012");
  await log.getByLabel("Fecha y hora").fill("2026-03-12T09:00");
  await log.getByRole("button", { name: "Guardar lectura" }).click();
  await expect(log).toBeHidden();

  await page.getByRole("button", { name: "Completar fermentación" }).click();
  const decision = page.getByRole("dialog", { name: /Completar la fermentación de TK-/ });
  await decision.getByLabel("Fin de la fermentación").fill("2026-03-18");
  await decision.getByRole("button", { name: /A destilación/ }).click();
  await decision.getByRole("checkbox").click();
  await decision.getByRole("button", { name: "Confirmar destino y completar" }).click();
  await expect(page.getByText("Destino: Destilación (singani)", { exact: true })).toBeVisible();

  // 4. Destilación de los 12.100 L, cerrada con sus cortes en marzo: el reposo de 180 días ya se cumplió.
  await page.getByRole("link", { name: "Pasar a destilación" }).click();
  await page.getByLabel("Alambique").fill("Alambique de cobre AL-01");
  await page.getByLabel("Volumen de entrada").fill("12.100");
  await page.getByLabel("Inicio").fill("2026-03-22");
  await page.getByRole("button", { name: "Abrir destilación" }).first().click();
  const close = page.getByRole("form", { name: "Cerrar destilación" });
  await close.getByLabel("Cabezas").fill("120");
  await close.getByRole("textbox", { name: "Corazón", exact: true }).fill("1.500");
  await close.getByLabel("Colas").fill("210");
  await close.getByLabel("Grado del corazón").fill("60");
  await close.getByLabel("Fin de la destilación").fill("2026-03-24");
  await close.getByRole("button", { name: "Cerrar destilación" }).click();
  await expect(page.getByText("Destilación cerrada", { exact: true })).toBeVisible();
  await expect(page.getByText("Candado liberado")).toBeVisible();

  // 5. Vista previa y embotellado: 2.950 botellas de 75 cL al 40 % con 750 L de agua.
  await page.getByRole("link", { name: "Pasar a embotellado" }).click();
  await expect(page.getByRole("heading", { name: `Embotellar ${LOT}` })).toBeVisible();
  await expect(page.getByLabel("Grado alcohólico final")).toHaveValue("40");
  await page.getByRole("button", { name: "Usar esta cifra" }).click();
  await expect(page.getByLabel("Adición de agua")).toHaveValue("750");
  await page.getByLabel("Botellas llenadas").fill("2.950");
  const preview = page.getByLabel("Vista previa del servidor");
  await expect(preview.getByText("Balance válido")).toBeVisible();
  await expect(preview.locator('[data-meter="volume"]')).toContainText("2.212,5 L de 2.250 L");
  await expect(preview.locator('[data-meter="loss"]')).toContainText("1,67 %");
  await expect(preview.locator('[data-meter="alcohol"]')).toContainText("885 L embotellados de 900 L");
  await page.getByRole("button", { name: "Embotellar y generar códigos" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, embotellar" }).click();
  await expect(page).toHaveURL(/\?pestana=codigos$/);
  const lotCode = (await page
    .getByText(/^CVJ-2026-SINGANI-\d{3}$/)
    .first()
    .textContent())!.trim();
  await expect(page.getByText(`2.950 códigos activos en ${lotCode}`)).toBeVisible();

  // 6. Exportación de los 2.950 códigos: CSV y ZIP para la imprenta.
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar CSV" }).click(),
  ]);
  const csv = (await readFile((await csvDownload.path())!, "utf8")).trimEnd().split(/\r?\n/);
  expect(csv).toHaveLength(2951);
  await page.getByRole("button", { name: "Generar ZIP con los QR" }).click();
  await expect(page.getByText("Listo para descargar")).toBeVisible();
  await expect(page.getByText("ZIP de 2.950 códigos")).toBeVisible();

  // Sin laboratorio el expediente no se puede cerrar: el servidor dice qué falta.
  await page.getByRole("tab", { name: "Expediente" }).click();
  const requirements = page.getByRole("list", { name: "Requisitos del expediente" });
  await expect(requirements.locator('[data-requirement="BOTTLED"]')).toHaveAttribute("data-met", "true");
  await expect(requirements.locator('[data-requirement="LAB_CONFORMING"]')).toHaveAttribute("data-met", "false");
  await expect(requirements).toContainText("Falta el análisis de laboratorio del lote");
  await page.getByRole("button", { name: "Cerrar el expediente" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, cerrar el expediente" }).click();
  await expect(notice(page)).toContainText("TRC_DOSSIER_NOT_READY");
  await expect(notice(page)).toContainText("Falta el análisis de laboratorio del lote");

  // Laboratorio sin cobre: la conformidad la calcula el servidor y queda incompleta (nunca conforme por omisión).
  await page.getByRole("tab", { name: "Laboratorio" }).click();
  await page.getByRole("button", { name: "Registrar análisis" }).click();
  const lab = page.getByRole("dialog", { name: "Registrar análisis de laboratorio" });
  await lab.getByRole("textbox", { name: "Laboratorio", exact: true }).fill("Laboratorio Enológico de Tarija");
  await lab.getByLabel("Código de acreditación").fill("IBMETRO-LE-042");
  await lab.getByLabel("Grado alcohólico real").fill("40,1");
  await lab.getByRole("textbox", { name: "Acidez total", exact: true }).fill("0,3");
  await lab.getByLabel("Acidez volátil").fill("0,1");
  await lab.getByLabel("Metanol (alcohol anhidro)").fill("85");
  await lab.getByLabel("Informe firmado del laboratorio").setInputFiles({
    name: "informe.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%recorrido H2\n"),
  });
  await expect(lab.getByRole("button", { name: "Quitar" })).toBeVisible();
  await lab.getByRole("button", { name: "Guardar análisis" }).click();
  await expect(lab).toBeHidden();
  await expect(page.getByTestId("lab-conformity")).toContainText("Incompleto");
  const checks = page.getByRole("table", { name: "Comprobaciones de la conformidad" });
  await expect(checks.getByRole("row", { name: /Cobre/ })).toContainText("No registrado");
  await expect(checks.getByRole("row", { name: /Cobre/ })).toContainText("No medido");
  await expect(checks.getByRole("row", { name: /Metanol/ })).toContainText("Cumple");

  // El reanálisis completo (metanol en mg/100 mL a.a., cobre y grado) sustituye al anterior: conforme.
  await page.getByRole("button", { name: "Registrar reanálisis" }).click();
  await lab.getByRole("textbox", { name: "Laboratorio", exact: true }).fill("Laboratorio Enológico de Tarija");
  await lab.getByLabel("Código de acreditación").fill("IBMETRO-LE-042");
  await lab.getByLabel("Grado alcohólico real").fill("40,1");
  await lab.getByRole("textbox", { name: "Acidez total", exact: true }).fill("0,3");
  await lab.getByLabel("Acidez volátil").fill("0,1");
  await lab.getByLabel("Metanol (alcohol anhidro)").fill("85");
  await lab.getByLabel("Cobre").fill("2,1");
  await lab.getByLabel("Informe firmado del laboratorio").setInputFiles({
    name: "reanalisis.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%recorrido H2, reanalisis\n"),
  });
  await expect(lab.getByRole("button", { name: "Quitar" })).toBeVisible();
  await lab.getByRole("button", { name: "Guardar análisis" }).click();
  await expect(lab).toBeHidden();
  await expect(page.getByTestId("lab-conformity")).toContainText("Conforme");
  await expect(page.getByRole("table", { name: /Análisis anteriores/ }).getByRole("row")).toHaveCount(2);

  // Cierre del expediente: todos los requisitos cumplidos, huella fijada y JSON canónico descargable.
  await page.getByRole("tab", { name: "Expediente" }).click();
  await expect(page.getByText("5 de 5 requisitos cumplidos")).toBeVisible();
  const provisional = (await page
    .getByTitle(/^[0-9a-f]{64}$/)
    .first()
    .textContent())!.trim();
  await page.getByRole("button", { name: "Cerrar el expediente" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, cerrar el expediente" }).click();
  await expect(page.getByText("Expediente cerrado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Huella (SHA-256)")).toBeVisible();
  await expect(page.getByText(/Raíz Merkle de los 2\.950 códigos de botella/)).toBeVisible();
  const hash = (await page
    .getByTitle(/^[0-9a-f]{64}$/)
    .first()
    .textContent())!.trim();
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(provisional).toMatch(/^[0-9a-f]{64}$/);
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar JSON canónico" }).click(),
  ]);
  const canonical = JSON.parse(await readFile((await jsonDownload.path())!, "utf8")) as Record<string, unknown>;
  expect(JSON.stringify(canonical)).toContain(lotCode);

  // Tras el cierre, una corrección ya no entra: el servidor la rechaza y el aviso lo explica.
  await page.getByRole("tab", { name: "Correcciones" }).click();
  await expect(page.getByText("El expediente está cerrado")).toBeVisible();
  await page.getByRole("button", { name: "Registrar corrección" }).click();
  const correction = page.getByRole("dialog", { name: "Registrar corrección" });
  await correction.getByRole("combobox", { name: "Registro que se corrige" }).click();
  await page.getByRole("option", { name: new RegExp(`Pesaje · ${harvestCode}`) }).click();
  await correction.getByLabel("Peso bruto").fill("18.600");
  await correction.getByLabel("Motivo").fill("La báscula marcó de menos al pesar el camión");
  await correction.getByRole("button", { name: "Registrar corrección" }).click();
  await expect(correction.getByTestId("rule-violation-notice")).toContainText("TRC_DOSSIER_CLOSED");
  await correction.getByRole("button", { name: "Cancelar" }).click();

  // La línea de tiempo y el grafo cuentan el lote entero, con datos reales.
  await page.getByRole("tab", { name: "Línea de tiempo" }).click();
  const timeline = page.getByRole("list", { name: "Línea de tiempo del lote" });
  await expect(timeline).toContainText("Expediente cerrado");
  await expect(timeline).toContainText("Registro tardío");
  await page.getByRole("tab", { name: "Trazabilidad" }).click();
  const graph = page.getByRole("list", { name: `Trazabilidad de ${LOT}` });
  await expect(graph.locator('[data-stage="HARVEST_BATCH"]')).toContainText("18.400 kg");
  await expect(graph.locator('[data-stage="DISTILLATION"]')).toContainText("1.500 L");
  await expect(graph.locator('[data-stage="BOTTLING"]')).toContainText("2.950 botellas");
  await expect(graph.locator('[data-stage="LAB_ANALYSIS"]')).toContainText("Conforme");

  // Y el lote figura con el expediente cerrado.
  await openLot(page);
  await expect(page.getByText("Expediente cerrado").first()).toBeVisible();
  expect(errors).toEqual([]);
});
