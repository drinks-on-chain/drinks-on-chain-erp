import { expect, test, type Page } from "@playwright/test";
import { advanceChain, axe, login, logout, setDataScenario, settleChain, settled, trackErrors } from "./support";

// 1K · «Autorizar tokenización» (contrato de la Ola 3 §5, §6 y §14) contra los mocks 0.6. El back
// office no es del ERP: sus pasos (tomar, pedir cambios, aprobar) se hacen por la API de los mocks
// desde la misma página, porque su base de datos vive ahí. Tras una escritura no se recarga.

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();

/** Lote «Singani Preventa 2026» de los fixtures: en origen, estimación 3.000, colección publicada de 100. */
const PREVENTA = "aa3d8614-2fc6-5f53-94f9-e8cdb76f6986";
const tab = (lotId: string) => `/lotes/${lotId}?pestana=tokenizacion`;

/** PNG mínimo válido (los mocks comprueban la firma del archivo). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type ApiCall = { method?: string; path: string; body?: unknown; idempotent?: boolean };

/**
 * Sesión aparte contra la API de los mocks (otra persona u otra pestaña): entra con el correo dado,
 * resuelve el segundo factor de demostración si lo pide y devuelve una función para llamar a la API.
 */
async function apiSession(page: Page, email: string) {
  const token = await page.evaluate(async (mail) => {
    const post = async (path: string, body: unknown) => {
      const res = await fetch(`/api/v1${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-App": "BACKOFFICE" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as { data?: { tokens?: { accessToken: string }; mfa?: { mfaToken: string } } };
    };
    let session = await post("/auth/login", { email: mail, password: "demo1234" });
    if (session.data?.mfa) {
      session = await post("/auth/mfa/verify", { mfaToken: session.data.mfa.mfaToken, code: "000000" });
    }
    return session.data?.tokens?.accessToken ?? null;
  }, email);
  expect(token, `sesión de ${email}`).toBeTruthy();

  return async <T = unknown>(call: ApiCall): Promise<{ status: number; data: T }> =>
    page.evaluate(
      async ({ call, token }) => {
        const res = await fetch(`/api/v1${call.path}`, {
          method: call.method ?? "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Client-App": "BACKOFFICE",
            ...(call.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(call.idempotent ? { "Idempotency-Key": crypto.randomUUID() } : {}),
          },
          body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
        });
        const json = (await res.json().catch(() => ({}))) as { data?: unknown };
        return { status: res.status, data: json.data as never };
      },
      { call, token },
    );
}

type Api = Awaited<ReturnType<typeof apiSession>>;
type RequestRow = { id: string; status: string; lot: { name: string } };

/** La solicitud abierta de un lote, vista por operaciones. */
async function openRequestOf(ops: Api, lotName: string): Promise<RequestRow> {
  const list = await ops<{ items: RequestRow[] }>({ path: "/platform/tokenization-requests?limit=100" });
  const found = list.data.items.find((r) => r.lot.name === lotName);
  expect(found, `solicitud abierta de ${lotName}`).toBeTruthy();
  return found!;
}

const requestPanel = (page: Page) => page.getByRole("group", { name: "Solicitud de tokenización" });
const collectionPanel = (page: Page) => page.getByRole("group", { name: "Colección y emisión" });
const refreshTab = (page: Page) => page.getByRole("button", { name: "Actualizar" }).click();

test("recorrido: autorizar 100, cambios pedidos, reenviar, emisión, ampliar a 150 y cuenta de la bodega", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const LOT = "Singani Reserva Familiar 2026";
  // La cuota mayor que la estimación la rechaza el servidor (422): es parte del recorrido.
  const errors = trackErrors(page, [/^422 \/api\/v1\/lots\/[\w-]+\/tokenization-requests$/]);
  await login(page, "admin@cintiviejo.test", { manualChain: true });

  // Lote nuevo en origen, con estimación: tokenizable desde el primer día (preventa).
  await nav(page, "Lotes");
  await page.getByRole("link", { name: "Nuevo lote" }).click();
  await page.getByLabel("Nombre del lote").fill(LOT);
  await page.getByRole("combobox", { name: "Tipo de producto" }).click();
  await page.getByRole("option", { name: "Singani" }).click();
  await page.getByLabel("Botellas estimadas").fill("3.000");
  await page.getByRole("button", { name: "Crear lote" }).click();
  await expect(page.getByRole("heading", { level: 1, name: LOT })).toBeVisible();

  await page.getByRole("tab", { name: "Tokenización" }).click();
  const state = page.getByRole("group", { name: "Tokenización del lote" });
  await expect(state.getByTestId("limits-summary")).toHaveText(
    "Puedes autorizar hasta 3.000 botellas: la estimación del lote es 3.000.",
  );
  await expect(state).toContainText("estimación");
  await expect(page.getByRole("heading", { name: "Este lote aún no tiene solicitudes" })).toBeVisible();
  await settled(page);
  expect(await axe(page)).toEqual([]);

  // Formulario: el máximo a la vista; una cuota mayor que la estimación la explica el servidor.
  await state.getByRole("link", { name: "Autorizar tokenización" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Autorizar la tokenización de ${LOT}` })).toBeVisible();
  await expect(page.getByTestId("limits-summary")).toContainText("hasta 3.000 botellas");
  await page.getByLabel("Botellas a tokenizar").fill("3.100");
  await page
    .locator('textarea[name="description"]')
    .fill("Singani de altura de Cinti, de producción limitada, en preventa.");
  await page.getByRole("button", { name: "Autorizar tokenización" }).click();
  let confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Se emitirán 3.100 NFT a nombre de tu bodega en la red Stellar");
  await confirm.getByRole("button", { name: "Sí, autorizar 3.100 botellas" }).click();
  const notice = page.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("La cuota supera la estimación del lote");
  await expect(notice).toContainText("3.000 botellas");
  await expect(notice).toContainText("TOK_QUOTA_EXCEEDS_ESTIMATE");
  await settled(page);
  expect(await axe(page)).toEqual([]);

  // 100 botellas, con una foto de portada y su descripción; confirmación explícita.
  await page.getByLabel("Botellas a tokenizar").fill("100");
  await page
    .getByLabel("Fotos de la colección")
    .setInputFiles({ name: "botella.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Descripción de la foto 1").fill("Botella de singani sobre una mesa de madera");
  await expect(page.getByRole("list", { name: "Fotos subidas" })).toContainText("Portada");
  await page.getByLabel("Notas para Drinks on Chain").fill("Primera preventa de este lote.");
  await page.getByRole("button", { name: "Autorizar tokenización" }).click();
  confirm = page.getByRole("alertdialog", { name: `¿Autorizar la tokenización de ${LOT}?` });
  await expect(confirm).toContainText(
    "Se emitirán 100 NFT a nombre de tu bodega en la red Stellar cuando Drinks on Chain apruebe la solicitud.",
  );
  await settled(page);
  expect(await axe(page)).toEqual([]);
  // Con teclado: el foco empieza en Cancelar y Escape cierra sin enviar nada.
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await page.getByRole("button", { name: "Autorizar tokenización" }).click();
  await confirm.getByRole("button", { name: "Sí, autorizar 100 botellas" }).click();

  await expect(page).toHaveURL(/pestana=tokenizacion$/);
  await expect(requestPanel(page)).toHaveAttribute("data-status", "SUBMITTED");
  await expect(requestPanel(page)).toContainText("Autorización · 100 botellas");
  await expect(requestPanel(page)).toContainText("Enviada");
  // Con una solicitud abierta no se ofrece otra.
  await expect(page.getByRole("link", { name: "Autorizar tokenización" })).toHaveCount(0);
  await expect(state).toContainText("Hay una solicitud abierta");

  // Operaciones la toma y pide cambios; la dueña ve el mensaje, edita y reenvía.
  const ops = await apiSession(page, "operaciones@drinksonchain.test");
  let request = await openRequestOf(ops, LOT);
  expect(
    (await ops({ method: "POST", path: `/platform/tokenization-requests/${request.id}/take`, body: {} })).status,
  ).toBe(200);
  expect(
    (
      await ops({
        method: "POST",
        path: `/platform/tokenization-requests/${request.id}/request-changes`,
        body: { message: "Falta la nota de cata para la ficha de la colección.", fields: ["commercial.tastingNotes"] },
      })
    ).status,
  ).toBe(200);
  await refreshTab(page);
  await expect(requestPanel(page)).toHaveAttribute("data-status", "CHANGES_REQUESTED");
  const change = requestPanel(page).getByTestId("change-request");
  await expect(change).toContainText("Falta la nota de cata para la ficha de la colección.");
  await expect(change).toContainText("Notas de cata");

  await requestPanel(page).getByRole("link", { name: "Editar y reenviar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Editar la solicitud de ${LOT}` })).toBeVisible();
  await expect(page.getByTestId("change-request")).toContainText("Falta la nota de cata");
  await expect(page.getByLabel("Botellas a tokenizar")).toHaveValue("100");
  await page.getByLabel("Notas de cata").fill("Nariz floral de moscatel; boca limpia y sedosa, de final largo.");
  await page.getByLabel("Qué cambiaste").fill("Añadida la nota de cata.");
  await page.getByRole("button", { name: "Guardar y reenviar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, reenviar 100 botellas" }).click();
  await expect(requestPanel(page)).toHaveAttribute("data-status", "SUBMITTED");
  await expect(requestPanel(page).getByTestId("change-request")).toHaveCount(0);

  // Operaciones aprueba: se crea la colección y la emisión queda en cola en la red.
  request = await openRequestOf(ops, LOT);
  await ops({ method: "POST", path: `/platform/tokenization-requests/${request.id}/take`, body: {} });
  const approved = await ops({
    method: "POST",
    path: `/platform/tokenization-requests/${request.id}/approve`,
    body: {},
    idempotent: true,
  });
  expect(approved.status).toBe(201);
  await refreshTab(page);
  await expect(requestPanel(page)).toHaveAttribute("data-status", "APPROVED");
  const collection = collectionPanel(page);
  await expect(collection).toHaveAttribute("data-collection", "MINTING");
  await expect(collection).toContainText("Emisión en curso");
  const mints = collection.getByRole("list", { name: "Emisiones", exact: true });
  await expect(mints.locator("[data-mint]").first()).toContainText("En cola");

  // La red confirma: la pantalla, que consulta cada 5 s mientras hay algo en vuelo, lo refleja sola.
  await settleChain(page);
  await expect(mints.locator('[data-mint="CONFIRMED"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(mints).toContainText("Emisión inicial · 100 NFT · botellas 1–100");
  await expect(mints).toContainText("Confirmada");
  await expect(mints.getByRole("link", { name: /Ver en el explorador/ })).toHaveAttribute(
    "href",
    /^https:\/\/[^/]+\/.*\/tx\/[0-9a-f]{64}$/,
  );
  await expect(collection).toHaveAttribute("data-collection", "READY");
  await expect(collection).not.toContainText("Emisión en curso");
  await expect(state.getByTestId("limits-summary")).toHaveText(
    "Puedes autorizar hasta 2.900 botellas: la estimación del lote es 3.000 y ya hay 100 autorizadas.",
  );
  await settled(page);
  expect(await axe(page)).toEqual([]);

  // Sin transacciones en curso ya no se consulta: ninguna petición en más de un intervalo.
  let polls = 0;
  page.on("request", (r) => {
    if (/\/api\/v1\/(collections|lots\/[\w-]+\/tokenization)/.test(r.url())) polls += 1;
  });
  await page.waitForTimeout(6_500);
  expect(polls).toBe(0);

  // Ampliar la cuota a 150: una solicitud nueva, solo con la cantidad adicional.
  await state.getByRole("link", { name: "Ampliar cuota" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Ampliar la cuota de ${LOT}` })).toBeVisible();
  await expect(page.getByLabel("Nombre de la colección")).toHaveCount(0);
  await page.getByLabel("Botellas adicionales").fill("50");
  await page.getByRole("button", { name: "Ampliar cuota" }).click();
  confirm = page.getByRole("alertdialog", { name: `¿Ampliar la cuota de ${LOT}?` });
  await expect(confirm).toContainText("Se emitirán 50 NFT a nombre de tu bodega");
  await confirm.getByRole("button", { name: "Sí, ampliar en 50 botellas" }).click();
  await expect(requestPanel(page)).toContainText("Ampliación de cuota · 50 botellas más (150 en total)");
  await expect(requestPanel(page)).toHaveAttribute("data-status", "SUBMITTED");
  await expect(page.getByRole("table", { name: "Solicitudes de tokenización del lote" }).getByRole("row")).toHaveCount(
    3,
  );

  request = await openRequestOf(ops, LOT);
  await ops({ method: "POST", path: `/platform/tokenization-requests/${request.id}/take`, body: {} });
  expect(
    (
      await ops({
        method: "POST",
        path: `/platform/tokenization-requests/${request.id}/approve`,
        body: {},
        idempotent: true,
      })
    ).status,
  ).toBe(201);
  await refreshTab(page);
  await expect(collection).toContainText("Emisión en curso");
  await settleChain(page);
  await expect(mints.locator('[data-mint="CONFIRMED"]')).toHaveCount(2, { timeout: 15_000 });
  await expect(mints).toContainText("Ampliación 1 · 50 NFT · botellas 101–150");
  await expect(collection).toContainText("150 botellas");

  // La lista de lotes lleva la marca y la cuenta de la bodega suma los NFT nuevos.
  await nav(page, "Lotes");
  const row = page.getByRole("row", { name: new RegExp(LOT) });
  await expect(row).toContainText("NFT emitidos");
  await expect(row).toContainText("150 de 150 NFT");
  await nav(page, "Cuenta de la bodega");
  const account = page.getByRole("table", { name: "NFT por lote" }).getByRole("row", { name: new RegExp(LOT) });
  await expect(account.getByRole("cell").nth(3)).toHaveText("150");
  await expect(account.getByRole("cell").nth(4)).toHaveText("150");
  await expect(page.getByRole("region", { name: "NFT de la bodega" })).toContainText("310");
  await expect(
    page
      .getByRole("table", { name: "Últimas transacciones de la bodega" })
      .getByRole("row", { name: /Emisión de NFT/ }),
  ).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("segunda solicitud abierta: el servidor la rechaza y el formulario lo explica", async ({ page }) => {
  const errors = trackErrors(page, [/^409 \/api\/v1\/lots\/[\w-]+\/tokenization-requests$/]);
  await login(page, "admin@cintiviejo.test", { manualChain: true });
  await page.goto(tab(PREVENTA));
  await page.getByRole("link", { name: "Ampliar cuota" }).click();
  await page.getByLabel("Botellas adicionales").fill("50");

  // Mientras tanto, la misma dueña envía otra ampliación desde otra sesión.
  const other = await apiSession(page, "admin@cintiviejo.test");
  const first = await other({
    method: "POST",
    path: `/lots/${PREVENTA}/tokenization-requests`,
    body: { quantity: 10, confirm: true },
    idempotent: true,
  });
  expect(first.status).toBe(201);

  await page.getByRole("button", { name: "Ampliar cuota" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, ampliar en 50 botellas" }).click();
  const notice = page.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("El lote ya tiene una solicitud abierta");
  await expect(notice).toContainText("TOK_REQUEST_ALREADY_OPEN");

  // De vuelta en la ficha, la solicitud abierta está a la vista y se puede retirar con motivo.
  await page.getByRole("link", { name: "Cancelar" }).click();
  await expect(requestPanel(page)).toContainText("Ampliación de cuota · 10 botellas más (110 en total)");
  await requestPanel(page).getByRole("button", { name: "Retirar solicitud" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Motivo").fill("Se envió por error desde otra sesión");
  await dialog.getByRole("button", { name: "Sí, retirar" }).click();
  await expect(requestPanel(page)).toHaveAttribute("data-status", "WITHDRAWN");
  await expect(requestPanel(page)).toContainText("Se envió por error desde otra sesión");
  await expect(page.getByRole("link", { name: "Ampliar cuota" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("enóloga: consulta la tokenización sin botón para autorizar; agronomía solo ve la marca", async ({ page }) => {
  // Dos sesiones seguidas (enóloga y agrónomo): más margen que una prueba normal.
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await login(page, "enologa@cintiviejo.test");
  await page.goto(tab(PREVENTA));
  const state = page.getByRole("group", { name: "Tokenización del lote" });
  await expect(state.getByTestId("limits-summary")).toContainText("hasta 2.900 botellas");
  await expect(state).toContainText("Solo la dirección de la bodega autoriza la tokenización");
  await expect(page.getByRole("link", { name: /Autorizar tokenización|Ampliar cuota/ })).toHaveCount(0);
  await expect(requestPanel(page)).toHaveAttribute("data-status", "APPROVED");
  await expect(requestPanel(page).getByRole("button", { name: "Retirar solicitud" })).toHaveCount(0);
  await expect(collectionPanel(page)).toContainText("Publicada");
  // El formulario tampoco se abre por su dirección.
  await page.goto(`/lotes/${PREVENTA}/tokenizar`);
  await expect(
    page.getByRole("heading", { name: "Solo la dirección de la bodega autoriza la tokenización" }),
  ).toBeVisible();

  await logout(page);
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await login(page, "agronomo@cintiviejo.test");
  await nav(page, "Lotes");
  await expect(page.getByRole("row", { name: /Singani Preventa 2026/ })).toContainText("100 de 100 NFT");
  await expect(page.getByRole("link", { name: "Tokenización", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Singani Preventa 2026", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Resumen" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tokenización" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("emisión fallida: la colección lo dice con su error y la lista lo marca", async ({ page }) => {
  const errors = trackErrors(page);
  await setDataScenario(page, "emision-fallida");
  await login(page, "admin@cintiviejo.test", { manualChain: true });
  await nav(page, "Lotes");
  const row = page.getByRole("row", { name: /Singani Preventa 2026/ });
  await expect(row).toContainText("Emisión fallida");
  await row.getByRole("link", { name: "Singani Preventa 2026", exact: true }).click();
  await page.getByRole("tab", { name: "Tokenización" }).click();

  const collection = collectionPanel(page);
  await expect(collection).toContainText("La emisión falló en la red");
  await expect(collection).toContainText("no tienes que volver a enviarla");
  const mint = collection.locator('[data-mint="FAILED"]');
  await expect(mint).toContainText("Fallida");
  await expect(mint).toContainText("CHN_AUTH_FAILED");
  await expect(collection).toContainText("NFT emitidos");
  await settled(page);
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("la estimación no baja de los NFT emitidos: el aviso lo explica al editarla", async ({ page }) => {
  const errors = trackErrors(page, [/^422 \/api\/v1\/lots\/[\w-]+$/]);
  await login(page, "admin@cintiviejo.test");
  await page.goto(`/lotes/${PREVENTA}`);
  await page.getByRole("button", { name: "Editar estimación" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar la estimación de botellas" });
  await expect(dialog).toContainText("Ya hay 100 NFT emitidos de este lote");
  await expect(dialog.getByLabel("Botellas estimadas")).toHaveValue("3.000");
  await dialog.getByLabel("Botellas estimadas").fill("80");
  await dialog.getByLabel("Motivo del cambio").fill("La cosecha rindió menos de lo previsto");
  await dialog.getByRole("button", { name: "Guardar estimación" }).click();
  const notice = dialog.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("La estimación no puede bajar de los NFT ya emitidos");
  await expect(notice).toContainText("100 botellas");
  await expect(notice).toContainText("TOK_ESTIMATE_BELOW_MINTED");
  await settled(page);
  expect(await axe(page)).toEqual([]);

  // Por encima de lo emitido sí entra, y el límite de la cuota baja con ella.
  await dialog.getByLabel("Botellas estimadas").fill("2.000");
  await dialog.getByRole("button", { name: "Guardar estimación" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Estimación actualizada", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Tokenización" }).click();
  await expect(page.getByTestId("limits-summary")).toHaveText(
    "Puedes autorizar hasta 1.900 botellas: la estimación del lote es 2.000 y ya hay 100 autorizadas.",
  );
  expect(errors).toEqual([]);
});

test("cierre con faltante en solo lectura, con el límite sobre las botellas del lote", async ({ page }) => {
  const errors = trackErrors(page);
  await setDataScenario(page, "faltante-botellas");
  await login(page, "admin@altos.test", { manualChain: true });
  await nav(page, "Lotes");
  await page.getByRole("link", { name: "Singani El Portillo 2025", exact: true }).click();
  await page.getByRole("tab", { name: "Tokenización" }).click();

  const state = page.getByRole("group", { name: "Tokenización del lote" });
  await expect(state).toContainText("botellas");
  await expect(state).toContainText("Botellas embotelladas con código activo");
  const closure = page.getByRole("group", { name: "Cierre del lote" });
  await expect(closure).toHaveAttribute("data-closure", "SHORTFALL_OPEN");
  await expect(closure).toContainText("20 NFT se quedaron sin botella (1.060 emitidos, 1.040 botellas)");
  await expect(closure).toContainText("Drinks on Chain decide cómo resolverlo");
  await expect(closure.getByRole("button")).toHaveCount(0);
  await settled(page);
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("solicitudes de la bodega, su ficha y el bloque del panel", async ({ page }) => {
  const errors = trackErrors(page);
  await setDataScenario(page, "cambios-pedidos");
  await login(page, "admin@cintiviejo.test", { manualChain: true });

  // Panel: bloque de tokenización y la tarea de la dueña.
  const block = page.getByRole("list", { name: "Tokenización de la bodega" });
  await expect(block).toContainText("Solicitudes abiertas");
  await expect(block.getByRole("listitem").filter({ hasText: "Con cambios pedidos" })).toContainText("1");
  const task = page.getByRole("row", { name: /Atender los cambios pedidos en la tokenización/ });
  await expect(task).toContainText("1 solicitud con cambios pedidos");
  await task.getByRole("link", { name: /Atender/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Solicitudes de tokenización" })).toBeVisible();
  const table = page.getByRole("table", { name: "Solicitudes de tokenización" });
  await expect(table.getByRole("row", { name: /Singani Preventa 2026/ })).toContainText("Cambios pedidos");
  await settled(page);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Retiradas" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("row", { name: /Singani El Molino 2026/ })).toContainText("Retirada");
  await table.getByRole("link", { name: /Ver la solicitud de Singani El Molino 2026/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Solicitud de tokenización" })).toBeVisible();
  await expect(requestPanel(page)).toHaveAttribute("data-status", "WITHDRAWN");
  await expect(requestPanel(page)).toContainText("Solicitud retirada por la bodega");
  await expect(requestPanel(page).getByRole("list", { name: "Pasos de la solicitud" })).toContainText("Retirada");
  await settled(page);
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("emisión en espera: aprobada pero sin emitir todavía, explicado sin alarmar", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await login(page, "admin@cintiviejo.test", { manualChain: true });
  // La plataforma aún no tiene habilitada la emisión (ADR-011) cuando operaciones aprueba.
  await page.evaluate(() =>
    (
      window as unknown as { __docMocks: { chain: { setMintEnabled: (on: boolean) => void } } }
    ).__docMocks.chain.setMintEnabled(false),
  );
  const ops = await apiSession(page, "operaciones@drinksonchain.test");
  const request = await openRequestOf(ops, "Singani El Molino 2026");
  expect(request.status).toBe("IN_REVIEW");
  const approved = await ops({
    method: "POST",
    path: `/platform/tokenization-requests/${request.id}/approve`,
    body: {},
    idempotent: true,
  });
  expect(approved.status).toBe(201);
  await advanceChain(page, 3);

  await nav(page, "Lotes");
  await page.getByRole("link", { name: "Singani El Molino 2026", exact: true }).click();
  await page.getByRole("tab", { name: "Tokenización" }).click();

  const collection = collectionPanel(page);
  const hold = collection.getByTestId("mint-hold");
  await expect(hold).toContainText("Emisión en espera");
  await expect(hold).toContainText("no tienes que hacer nada");
  await expect(collection.locator("[data-mint]").first()).toContainText("En espera");
  await expect(collection).not.toContainText("falló");
  await expect(collection.getByRole("alert")).toHaveCount(0);
  await settled(page);
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});
