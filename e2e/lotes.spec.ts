import { expect, test, type Page } from "@playwright/test";
import { axe, login, settled, trackErrors, setDataScenario } from "./support";

// Ola 2 · O2-ERP-1, fase 1: el lote del servidor (lista, ficha, alta) contra los mocks 0.5.
// La trazabilidad de los mocks vive en la memoria de la página: tras crear datos se navega con clics.

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();

// Ids de los fixtures de Cinti Viejo.
const HARVEST_PARRALES = "2a643ce2-9f17-5017-9d6a-b4eb661d4648";
/** Lote «Moscatel de Alejandría 2026» (CVJ-L2026-001): UUID v5 de su pesaje, como la semilla del backend. */
const LOT_RESTING = /\/lotes\/4af50d09-[\w-]+$/;

/** Un enlace antiguo pregunta primero por un lote que no existe con ese id. */
const LEGACY_LOOKUP = /^404 \/api\/v1\/lots\//;

test("Lotes: filtros del servidor y ficha con candado, reglas, registros y línea de tiempo", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await expect(page.getByRole("heading", { name: "Lotes", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Singani Gran Reserva 2026/ })).toContainText("Anclado en la red");

  await page.getByRole("combobox", { name: "Filtrar por etapa" }).click();
  await page.getByRole("option", { name: "Reposo" }).click();
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("CVJ-L2026-001");
  await expect(rows.nth(1)).toContainText("Faltan 18 días");

  // La búsqueda también la resuelve el servidor (nombre, referencia o código de lote).
  await page.getByRole("combobox", { name: "Filtrar por etapa" }).click();
  await page.getByRole("option", { name: "Todas las etapas" }).click();
  await page.getByRole("searchbox", { name: "Buscar lote" }).fill("CVJ-2026-WINE-003");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("Vino");
  await page.getByRole("searchbox", { name: "Buscar lote" }).fill("no existe");
  await expect(page.getByText("Ningún lote coincide")).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();

  await page.getByRole("link", { name: "Moscatel de Alejandría 2026", exact: true }).click();
  await expect(page).toHaveURL(LOT_RESTING);
  await expect(page.getByRole("heading", { name: "Moscatel de Alejandría 2026" })).toBeVisible();
  // Candado evaluado por el servidor con la instantánea del lote: motivo, días y fecha.
  const locks = page.getByRole("list", { name: "Candados del lote" });
  await expect(locks.getByText("Reposo obligatorio").first()).toBeVisible();
  await expect(locks.getByText("Reposo mínimo de 180 días").first()).toBeVisible();
  await expect(locks.getByText(/Faltan 18 días · se libera el 13 oct 2026/)).toBeVisible();
  // Instantánea de reglas (fijada al migrar) y D.O. calculada.
  const rules = page.getByLabel("Instantánea de reglas del lote");
  await expect(rules).toContainText("180 días");
  await expect(rules).toContainText("Moscatel de Alejandría");
  await expect(page.getByText(/Reglas fijadas al migrar el lote/)).toBeVisible();
  await expect(page.getByText("Apto para D.O. Singani")).toBeVisible();
  // Registros del lote con enlace a cada módulo.
  const records = page.getByRole("list", { name: "Registros del lote" });
  await expect(records.getByRole("link", { name: "TK-03" })).toHaveAttribute("href", /^\/vinificacion\//);
  await expect(records.getByRole("link", { name: "HARV-2026-PARRALES-01" })).toHaveAttribute("href", /^\/vendimia\//);

  await page.getByRole("tab", { name: "Línea de tiempo" }).click();
  const timeline = page.getByRole("list", { name: "Línea de tiempo del lote" });
  await expect(timeline.getByText(/Pesaje de 18\.400 kg/)).toBeVisible();
  await expect(page).toHaveURL(/pestana=linea-de-tiempo$/);
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("un enlace antiguo /lotes/{pesaje} lleva a la ficha de su lote", async ({ page }) => {
  const errors = trackErrors(page, [LEGACY_LOOKUP, /^404 \/api\/v1\/harvest-batches\/00000000-/]);
  await login(page, "enologa@cintiviejo.test");
  await page.goto(`/lotes/${HARVEST_PARRALES}`);
  await expect(page).toHaveURL(LOT_RESTING);
  await expect(page.getByRole("heading", { name: "Moscatel de Alejandría 2026" })).toBeVisible();

  await page.goto("/lotes/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("Lote no encontrado")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Nuevo lote en origen: instantánea de reglas a la vista y D.O. comprobada por el servidor", async ({ page }) => {
  // El 422 de la parcela no apta es parte del recorrido.
  const errors = trackErrors(page, [/^422 \/api\/v1\/lots$/]);
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await page.getByRole("link", { name: "Nuevo lote" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo lote" })).toBeVisible();

  // Las reglas vigentes que el servidor fijará en el lote.
  const preview = page.getByLabel("Reglas vigentes de la bodega");
  await expect(preview).toContainText("1.600 m s. n. m.");
  await expect(preview).toContainText("180 días");
  await expect(preview).toContainText("5 %");

  await page.getByRole("button", { name: "Crear lote" }).click();
  await expect(page.getByText("Escribe un nombre de al menos 3 caracteres.")).toBeVisible();

  await page.getByLabel("Nombre del lote").fill("Singani Gran Reserva 2026");
  await page.getByRole("combobox", { name: "Tipo de producto" }).click();
  await page.getByRole("option", { name: "Singani" }).click();
  await page.getByLabel("Botellas estimadas").fill("3.000");
  await page.getByLabel("Formato previsto").fill("75");
  await page.getByLabel("Grado previsto de la botella").fill("40");

  // Una parcela de Vischoqueña no es apta para un lote de singani: lo dice el servidor.
  await page.getByRole("checkbox", { name: /Parcela 3 · Las Carreras/ }).click();
  await page.getByRole("button", { name: "Crear lote" }).click();
  const notice = page.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("La parcela no es apta para la D.O. Singani");
  await expect(notice).toContainText("Cepas admitidas (D.O. Singani)");
  await expect(notice).toContainText("Vischoqueña");
  await expect(notice).toContainText("TRC_DO_TERROIR_NOT_ELIGIBLE");
  await settled(page);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("checkbox", { name: /Parcela 3 · Las Carreras/ }).click();
  await page.getByRole("checkbox", { name: /Parcela 2 · Cañón Viejo/ }).click();
  await page.getByRole("button", { name: "Crear lote" }).click();

  await expect(page.getByRole("heading", { name: "Singani Gran Reserva 2026" })).toBeVisible();
  await expect(page.getByText("CVJ-L2026-007").first()).toBeVisible();
  await expect(page.getByText("Origen", { exact: true }).first()).toBeVisible();
  const rules = page.getByLabel("Instantánea de reglas del lote");
  await expect(rules).toContainText("1.600 m s. n. m.");
  await expect(rules).toContainText("180 días");
  await expect(page.getByText(/Instantánea tomada al crear el lote/)).toBeVisible();
  await expect(page.getByText("Apto para D.O. Singani")).toBeVisible();
  // El siguiente paso de un lote en origen es pesar uva, con el lote ya elegido.
  await page.getByRole("link", { name: "Registrar pesaje" }).click();
  await expect(page.getByRole("combobox", { name: "Lote" })).toContainText("Singani Gran Reserva 2026 · CVJ-L2026-007");
  expect(errors).toEqual([]);
});

test("las incidencias de migración se ven en la lista y en la ficha", async ({ page }) => {
  const errors = trackErrors(page);
  await setDataScenario(page, "lote-con-incidencia");
  await login(page, "enologa@cintiviejo.test");
  await nav(page, "Lotes");
  await page.getByRole("button", { name: "Con incidencias" }).click();
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("CVJ-2026-SINGANI-002");
  await expect(rows.nth(1)).toContainText("1 abierta");

  await rows.nth(1).getByRole("link", { name: "CVJ-2026-SINGANI-002", exact: true }).click();
  const issues = page.getByRole("region", { name: "Incidencias de cumplimiento" });
  await expect(issues.getByRole("heading", { name: "1 incidencia de cumplimiento abierta" })).toBeVisible();
  await expect(issues).toContainText("Detectada al migrar los datos");
  await expect(issues).toContainText("Más botellas que litros disponibles");
  await expect(issues).toContainText("TRC_BOTTLING_EXCEEDS_VOLUME");
  await settled(page);
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("el operario ve los lotes y pesa uva sin lote y sin análisis; el dictamen no va en el alta", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "operario@cintiviejo.test");
  await nav(page, "Lotes");
  await expect(page.getByRole("row", { name: /Singani Gran Reserva 2026/ })).toBeVisible();
  // Crear lotes es de dirección y enología.
  await expect(page.getByRole("link", { name: "Nuevo lote" })).toHaveCount(0);

  await nav(page, "Vendimia y laboratorio");
  await page.getByRole("link", { name: "Registrar ingreso" }).click();
  await expect(page.getByRole("combobox", { name: "Lote" })).toContainText("Sin lote: uva recibida");
  // Ni análisis (lo registran enología o agronomía) ni lote nuevo.
  await expect(page.getByLabel("Grados Brix")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Lote" }).click();
  await expect(page.getByRole("option", { name: "Nuevo lote…" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("combobox", { name: "Terroir de origen" }).click();
  await page.getByRole("option", { name: /Parcela 2 · Cañón Viejo/ }).click();
  await page.getByLabel("Peso bruto").fill("4.350");
  await page.getByLabel("Tara").fill("150");
  await page.getByRole("button", { name: "Registrar ingreso" }).click();

  await expect(page.getByRole("heading", { name: /^HARV-2026-VIEJO-/ })).toBeVisible();
  await expect(page.getByText("Pendiente de inspección").first()).toBeVisible();
  await expect(page.getByText("4.200 kg").first()).toBeVisible();
  expect(errors).toEqual([]);
});
