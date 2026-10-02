import { expect, test, type Page } from "@playwright/test";
import { trackErrors } from "./support";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Tareas pendientes")).toBeVisible();
}

test("la enóloga de Altos solo ve los terroirs de su bodega, con su badge D.O.", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "enologa@altos.test");
  await page.goto("/origen");

  const cards = page.getByRole("list", { name: "Terroirs" }).getByRole("listitem");
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole("link", { name: /Cuartel 2 · Los Sauces/ })).toBeVisible();
  // Parcelas de Cinti Viejo (otra bodega): no aparecen.
  await expect(page.getByText(/Los Parrales/)).toHaveCount(0);
  // La aptitud la calcula el servidor con las reglas vigentes de la bodega: Altos tiene autorizada
  // una altitud mínima de 1.500 m (excepción legal), así que El Portillo (1.540 m) es apto por excepción.
  await expect(page.getByText("Apto D.O. por excepción legal")).toBeVisible();
  await expect(page.getByText("Apto para Singani D.O.")).toHaveCount(1);
  // La enóloga no da de alta terroirs (terroir.write).
  await expect(page.getByRole("link", { name: "Nuevo terroir" })).toHaveCount(0);

  // Filtros: pill de cepa y "Apto D.O.".
  await page.getByRole("button", { name: "Moscatel" }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Apto D.O." }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Todas" }).click();
  await page.getByRole("button", { name: "Apto D.O." }).click();
  await page.getByRole("searchbox", { name: "Buscar terroir" }).fill("portillo");
  await expect(cards).toHaveCount(1);

  await cards.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: /El Portillo/ })).toBeVisible();
  await expect(page.getByText("Ficha de la parcela")).toBeVisible();
  // La ficha explica la evaluación: lo que tiene la parcela, lo que exige la bodega y el mínimo legal.
  const checks = page.getByRole("list", { name: "Comprobaciones de la D.O." });
  await expect(checks).toContainText(
    "Tiene 1.540 m s. n. m. · exige 1.500 m s. n. m. (mínimo legal: 1.600 m s. n. m.)",
  );
  await expect(page.getByText("Calculada con las reglas vigentes de la bodega")).toBeVisible();
  expect(errors).toEqual([]);
});

test("el agrónomo crea un terroir: la aptitud D.O. la calcula el servidor y una parcela con pesajes no se edita", async ({
  page,
}) => {
  // El 409 de la parcela en uso es parte del recorrido.
  const errors = trackErrors(page, [/^409 \/api\/v1\/terroirs\//]);
  await login(page, "agronomo@cintiviejo.test");
  await page.goto("/origen");
  await page.getByRole("link", { name: "Nuevo terroir" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo terroir" })).toBeVisible();

  // Validación en cliente antes de enviar.
  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByText("Escribe el nombre de la parcela.")).toBeVisible();

  await page.getByLabel("Nombre de la parcela").fill("Parcela 6 · La Cumbre");
  await page.getByLabel("Superficie").fill("2,4");
  await page.getByLabel("Cepa").fill("Moscatel de Alejandría");
  await page.getByLabel("Altitud").fill("1500");
  // La aptitud no se declara: no hay casilla; el formulario muestra las reglas vigentes.
  await expect(page.getByRole("checkbox", { name: /Parcela apta para D.O./ })).toHaveCount(0);
  await expect(page.getByText("La aptitud D.O. Singani la calcula el servidor")).toBeVisible();
  await expect(page.getByText(/al menos 1\.600 m s\. n\. m\. y cepa Moscatel de Alejandría/)).toBeVisible();
  await page.getByLabel("Polígono GeoJSON").fill("{ no es json");
  await expect(page.getByText("No es un JSON válido.")).toBeVisible();
  await page.getByLabel("Polígono GeoJSON").fill("");

  await page.getByRole("button", { name: "Crear terroir" }).click();
  await expect(page.getByRole("heading", { name: "Parcela 6 · La Cumbre" })).toBeVisible();
  await expect(page.getByText("Sin ingresos todavía")).toBeVisible();
  // A 1.500 m el servidor la da por no apta.
  await expect(page.getByText("No apto D.O. · altitud < 1.600 m s. n. m.").first()).toBeVisible();

  // Sin pesajes, la altitud aún se edita; el servidor recalcula la aptitud.
  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Altitud").fill("2.450");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("heading", { name: "Parcela 6 · La Cumbre" })).toBeVisible();
  await expect(page.getByText("Apto para Singani D.O.").first()).toBeVisible();

  // Una parcela con pesajes no cambia su altitud por edición: solo con una corrección.
  await page.getByRole("link", { name: "Origen y terroirs", exact: true }).first().click();
  await page.getByRole("link", { name: /Parcela 1 · Los Parrales/ }).click();
  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Altitud").fill("1.400");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const notice = page.getByTestId("rule-violation-notice");
  await expect(notice).toContainText("La parcela ya tiene pesajes");
  await expect(notice).toContainText("TRC_TERROIR_IN_USE");
  expect(errors).toEqual([]);
});
