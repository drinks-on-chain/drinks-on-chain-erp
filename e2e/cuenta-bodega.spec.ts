import { expect, test, type Page } from "@playwright/test";
import { login, setDataScenario, settleChain, trackErrors } from "./support";

// 1F · Cuenta de la bodega (contrato de la Ola 3 §3.4) contra los mocks 0.6: identidad en la red,
// NFT por lote, anclajes y últimas transacciones, con los enlaces al explorador que da el servidor.

const nav = (page: Page, name: string) => page.getByRole("link", { name, exact: true }).first().click();

/** Enlace al explorador: lo construye el backend; la app no escribe el host. */
const EXPLORER = (kind: string, id: string) => new RegExp(`^https://[^/]+/.*/${kind}/${id}$`);

const CVJ_ACCOUNT = "GB2RRBVVZLNYRA7GF7UTZ6EUWQI2GD64HXFY3KUKDNELEUI7OQHDTKTM";

test("Cuenta de la bodega: identidad, NFT por lote, anclajes y transacciones", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "admin@cintiviejo.test");
  await nav(page, "Cuenta de la bodega");
  await expect(page.getByRole("heading", { level: 1, name: "Cuenta de la bodega" })).toBeVisible();

  const identity = page.getByRole("group", { name: "Identidad en la red" });
  await expect(identity).toHaveAttribute("data-identity", "ACTIVE");
  await expect(identity).toContainText("Activa");
  await expect(identity).toContainText("Red de pruebas de Stellar (testnet)");
  await expect(identity).toContainText(CVJ_ACCOUNT);
  await expect(identity.getByRole("link", { name: /Ver la cuenta en el explorador/ })).toHaveAttribute(
    "href",
    EXPLORER("account", CVJ_ACCOUNT),
  );
  await expect(identity.getByRole("link", { name: /Ver el contrato en el explorador/ })).toHaveAttribute(
    "href",
    EXPLORER("contract", "C[A-Z2-7]{55}"),
  );
  await expect(identity).toContainText("CVJ");
  // Lo que se retiró: el identificador de productor (sin ProducerRegistry) y los datos simulados.
  await expect(page.getByText("Identificador de productor")).toHaveCount(0);
  await expect(page.getByText(/PROD_BO_/)).toHaveCount(0);

  const totals = page.getByRole("region", { name: "NFT de la bodega" });
  await expect(totals).toContainText("NFT emitidos");
  await expect(totals).toContainText("160");

  const lots = page.getByRole("table", { name: "NFT por lote" });
  const preventa = lots.getByRole("row", { name: /Singani Preventa 2026/ });
  await expect(preventa).toContainText("Publicada");
  await expect(preventa.getByRole("cell").nth(4)).toHaveText("100");
  await expect(lots.getByRole("row", { name: /Singani Gran Reserva 2026/ })).toContainText("60");

  const anchors = page.getByRole("table", { name: "Anclajes de expedientes" });
  const anchored = anchors.getByRole("row", { name: /Singani Gran Reserva 2026/ });
  await expect(anchored).toContainText("Anclado en la red");
  await expect(anchored.getByRole("link", { name: /Ver en el explorador/ })).toHaveAttribute(
    "href",
    EXPLORER("tx", "[0-9a-f]{64}"),
  );

  const txs = page.getByRole("table", { name: "Últimas transacciones de la bodega" });
  await expect(txs.getByRole("row", { name: /Emisión de NFT/ }).first()).toContainText("Confirmada");
  await expect(txs.getByRole("row", { name: /Creación de la cuenta/ })).toContainText("Confirmada");
  await expect(page.getByText(/Las comisiones de la red las paga Drinks on Chain: 0,36093 XLM/)).toBeVisible();

  // Del lote de la cuenta al anclaje en su expediente.
  await anchored.getByRole("link", { name: "Singani Gran Reserva 2026" }).click();
  const anchor = page.getByRole("region", { name: "Anclaje en la red" });
  await expect(anchor).toHaveAttribute("data-anchor", "ANCHORED");
  await expect(anchor.getByRole("link", { name: /Ver en el explorador/ })).toHaveAttribute(
    "href",
    EXPLORER("tx", "[0-9a-f]{64}"),
  );
  expect(errors).toEqual([]);
});

test("el operario consulta la cuenta de la bodega (solo lectura para todos los miembros)", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "operario@cintiviejo.test");
  await nav(page, "Cuenta de la bodega");
  await expect(page.getByRole("group", { name: "Identidad en la red" })).toContainText(CVJ_ACCOUNT);
  await expect(page.getByRole("table", { name: "NFT por lote" })).toContainText("Singani Preventa 2026");
  expect(errors).toEqual([]);
});

test("identidad preparándose: se dice con honestidad y se actualiza sola al confirmarse", async ({ page }) => {
  const errors = trackErrors(page);
  await setDataScenario(page, "identidad-preparandose");
  await login(page, "admin@altos.test", { manualChain: true });
  await nav(page, "Cuenta de la bodega");

  const identity = page.getByRole("group", { name: "Identidad en la red" });
  await expect(identity).toHaveAttribute("data-identity", "PROVISIONING");
  await expect(identity).toContainText("Preparando tu cuenta en la red");
  // Nada afirma que la cuenta o el contrato existan mientras el servidor no los devuelva.
  await expect(identity.getByRole("link", { name: /Ver el contrato en el explorador/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Aún no hay NFT emitidos" })).toBeVisible();

  // La red confirma: la pantalla, que consulta cada 5 s mientras hay algo en vuelo, lo refleja.
  await settleChain(page);
  await expect(identity).toHaveAttribute("data-identity", "ACTIVE", { timeout: 15_000 });
  await expect(identity.getByRole("link", { name: /Ver el contrato en el explorador/ })).toBeVisible();
  await expect(identity).toContainText("ALT");
  expect(errors).toEqual([]);
});

test("anclaje pendiente: el expediente lo muestra en cola y pasa a anclado cuando la red confirma", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await setDataScenario(page, "anclaje-pendiente");
  await login(page, "enologa@cintiviejo.test", { manualChain: true });
  await nav(page, "Lotes");
  const row = page.getByRole("row", { name: /Singani Gran Reserva 2026/ });
  await expect(row).toContainText("Expediente cerrado");
  await row.getByRole("link", { name: "Singani Gran Reserva 2026", exact: true }).click();
  await page.getByRole("tab", { name: "Expediente" }).click();

  const anchor = page.getByRole("region", { name: "Anclaje en la red" });
  await expect(anchor).toHaveAttribute("data-anchor", /PENDING|SUBMITTED/);
  await expect(anchor).toContainText(/Anclaje (pendiente|enviado a la red)/);

  await settleChain(page);
  await expect(anchor).toHaveAttribute("data-anchor", "ANCHORED", { timeout: 15_000 });
  await expect(anchor).toContainText("Confirmada");
  await expect(page.getByRole("heading", { level: 1 }).locator("..")).toContainText("Anclado en la red");
  expect(errors).toEqual([]);
});
