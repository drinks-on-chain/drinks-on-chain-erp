import { expect, test, type Page } from "@playwright/test";
import { axe, login, logout, mailLink, settled, trackErrors } from "./support";

// O1-ERP-1 · Cuenta, organización y equipo contra los mocks 0.3 (contrato de la Ola 1): invitaciones
// desde el buzón simulado, recuperación de contraseña, equipo de la bodega, configuración efectiva,
// bitácora propia y bodega no activa.

// Recorridos largos (varias pantallas, cambio de sesión y buzón): más margen que el de por defecto.
test.describe.configure({ timeout: 120_000 });

const NEW_PASSWORD = "vendimia-2026";
const shellUser = (page: Page) => page.getByRole("button", { name: /Menú de usuario/ });
const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name, exact: true }).click();

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function invite(page: Page, email: string, role: string) {
  await nav(page, "Equipo");
  await page.getByRole("button", { name: "Invitar" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Invitar al equipo" });
  await dialog.getByLabel("Correo electrónico").fill(email);
  await dialog.getByRole("combobox", { name: "Rol en la bodega" }).click();
  await page.getByRole("option", { name: role }).click();
  await dialog.getByRole("button", { name: "Enviar invitación" }).click();
  return dialog;
}

test.describe("invitaciones desde el buzón simulado", () => {
  test("cuenta nueva: la dueña invita, la persona crea su cuenta y entra con la bodega activa", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, "admin@altos.test");
    const dialog = await invite(page, "rosa@altos.test", "Agronomía");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Invitación enviada a rosa@altos.test", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "rosa@altos.test", exact: true })).toBeVisible();

    const link = await mailLink(page, "rosa@altos.test", "INVITATION");
    expect(link).toMatch(/^\/invitacion\//);
    await logout(page);

    await page.goto(link);
    await expect(page.getByText("Martín Calamuchita te invita a unirte a Bodega Altos de Calamuchita")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
    // Requisitos a la vista: una contraseña común no se envía.
    await page.getByLabel("Nombre completo").fill("Rosa Mamani");
    await page
      .getByLabel(/^Contraseña/)
      .first()
      .fill("1234567890");
    await page.getByLabel(/^Repite la contraseña/).fill("1234567890");
    await page.getByRole("button", { name: "Crear cuenta y entrar" }).click();
    await expect(page.getByText("Es una contraseña demasiado común: elige otra.")).toBeVisible();

    await page
      .getByLabel(/^Contraseña/)
      .first()
      .fill(NEW_PASSWORD);
    await page.getByLabel(/^Repite la contraseña/).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta y entrar" }).click();
    await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
    await expect(shellUser(page)).toContainText("Agronomía · Bodega Altos de Calamuchita");

    // El enlace ya se usó.
    await page.goto(link);
    await expect(page.getByText("Esta invitación ya se aceptó")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("cuenta existente: entra con el mismo correo, acepta y suma la bodega a sus organizaciones", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await login(page, "admin@altos.test");
    await invite(page, "enologa@cintiviejo.test", "Enología");
    await expect(page.getByText("Invitación enviada a enologa@cintiviejo.test", { exact: true })).toBeVisible();
    const link = await mailLink(page, "enologa@cintiviejo.test", "INVITATION");
    await logout(page);

    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Entra para aceptar" })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toHaveValue("enologa@cintiviejo.test");
    await page.getByLabel("Contraseña").fill("demo1234");
    await page.getByRole("button", { name: "Entrar y aceptar" }).click();

    await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
    await expect(shellUser(page)).toContainText("Enología · Bodega Altos de Calamuchita");
    await page.getByRole("combobox", { name: "Organización activa" }).click();
    await expect(page.getByRole("option", { name: /Destilería Cinti Viejo/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Bodega Altos de Calamuchita/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("con la sesión de otra persona pide salir antes de aceptar", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, "enologa@altos.test");
    await page.goto("/invitacion/demo-invitacion-padcaya");
    await expect(page.getByText("Has iniciado sesión con otra cuenta")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión y continuar" }).click();
    await expect(page.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toHaveValue("duena@soldepadcaya.test");
    expect(errors).toEqual([]);
  });

  test("caducada o inexistente: se explica y no se ofrece aceptar", async ({ page }) => {
    const errors = trackErrors(page, [/^404 \/api\/v1\/invitations\/no-existe$/]);
    await page.goto("/invitacion/demo-invitacion-guadalquivir");
    await expect(page.getByText("La invitación caducó")).toBeVisible();
    await expect(page.getByText(/Pide a .+ que te la reenvíe/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Crear cuenta|Entrar y aceptar/ })).toHaveCount(0);

    await page.goto("/invitacion/no-existe");
    await expect(page.getByText("La invitación no existe")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("recuperar la contraseña desde el buzón y entrar con la nueva", async ({ page }) => {
  const errors = trackErrors(page, [/^422 \/api\/v1\/auth\/reset-password$/]);
  await page.goto("/recuperar");
  await page.getByLabel("Correo electrónico").fill("enologa@altos.test");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText("Revisa tu correo")).toBeVisible();

  const link = await mailLink(page, "enologa@altos.test", "PASSWORD_RESET");
  expect(link).toMatch(/^\/restablecer-contrasena\?token=/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/restablecer\/[^/]+$/);
  await page.getByLabel(/^Contraseña nueva/).fill(NEW_PASSWORD);
  await page.getByLabel(/^Repite la contraseña/).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Contraseña cambiada")).toBeVisible();

  // El enlace es de un solo uso.
  await page.goto(link);
  await page.getByLabel(/^Contraseña nueva/).fill(NEW_PASSWORD);
  await page.getByLabel(/^Repite la contraseña/).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("El enlace ya no vale")).toBeVisible();

  await signIn(page, "enologa@altos.test", NEW_PASSWORD);
  await expect(page.getByText("Tareas pendientes", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("perfil: preferencias y cambio de contraseña", async ({ page }) => {
  const errors = trackErrors(page, [/^422 \/api\/v1\/users\/me\/password$/]);
  await login(page, "agronomo@altos.test");
  await page.goto("/perfil");
  const promotions = page.getByRole("switch", { name: /Promociones y novedades/ });
  await expect(promotions).not.toBeChecked();
  await promotions.click();
  await page.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(page.getByText("Preferencias guardadas", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: /Promociones y novedades/ })).toBeChecked();

  await page.getByLabel("Contraseña actual").fill("equivocada");
  await page.getByLabel(/^Contraseña nueva/).fill(NEW_PASSWORD);
  await page.getByLabel(/^Repite la contraseña/).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText("La contraseña actual no es correcta")).toBeVisible();
  await page.getByLabel("Contraseña actual").fill("demo1234");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText("Contraseña cambiada", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe("equipo de la bodega (dueña)", () => {
  test("bloquea y desbloquea; el bloqueo de la plataforma y el límite de plazas se explican", async ({ page }) => {
    const errors = trackErrors(page, [/^422 \/api\/v1\/organizations\/current\/invitations$/]);
    await login(page, "admin@cintiviejo.test");
    await nav(page, "Equipo");
    await expect(page.getByText("6 de 6 plazas ocupadas", { exact: false })).toBeVisible();

    // Verónica la bloqueó la plataforma: se explica y no se ofrece desbloquear.
    const veronica = page.getByRole("row", { name: /Verónica Quiroga/ });
    await expect(veronica).toContainText("Bloqueado por Drinks on Chain");
    await expect(veronica).toContainText("Solo Drinks on Chain puede desbloquearlo.");
    await veronica.getByRole("button", { name: /Acciones para/ }).click();
    await expect(page.getByRole("menuitem", { name: "Desbloquear" })).toHaveCount(0);
    await expect(page.getByRole("menu")).toContainText("solo la plataforma puede desbloquearlo");
    await page.keyboard.press("Escape");

    // Bloquear a Rubén con motivo y volver a darle acceso.
    const ruben = page.getByRole("row", { name: /Rubén Flores/ });
    await ruben.getByRole("button", { name: "Acciones para Rubén Flores" }).click();
    await page.getByRole("menuitem", { name: "Bloquear acceso" }).click();
    const block = page.getByRole("alertdialog", { name: "Bloquear a Rubén Flores" });
    await block.getByLabel("Motivo (opcional)").fill("Licencia sin goce de haber");
    await block.getByRole("button", { name: "Bloquear acceso" }).click();
    await expect(page.getByText("Rubén Flores ya no tiene acceso", { exact: true })).toBeVisible();
    await expect(ruben).toContainText("Bloqueado por la dirección");
    await expect(ruben).toContainText("Motivo: Licencia sin goce de haber");

    await ruben.getByRole("button", { name: "Acciones para Rubén Flores" }).click();
    await page.getByRole("menuitem", { name: "Desbloquear" }).click();
    await page
      .getByRole("alertdialog", { name: "Desbloquear a Rubén Flores" })
      .getByRole("button", { name: "Desbloquear" })
      .click();
    await expect(page.getByText("Rubén Flores vuelve a tener acceso", { exact: true })).toBeVisible();

    // Cambiar el rol.
    await ruben.getByRole("button", { name: "Acciones para Rubén Flores" }).click();
    await page.getByRole("menuitem", { name: "Cambiar rol" }).click();
    const role = page.getByRole("dialog", { name: "Cambiar el rol de Rubén Flores" });
    await role.getByRole("combobox", { name: "Rol en la bodega" }).click();
    await page.getByRole("option", { name: "Enología" }).click();
    await role.getByRole("button", { name: "Guardar rol" }).click();
    await expect(page.getByText("Rubén Flores ahora es Enología", { exact: true })).toBeVisible();
    await expect(ruben).toContainText("Enología");

    // Cinti Viejo tiene 6 plazas ocupadas: invitar a otra persona choca con el límite.
    const dialog = await invite(page, "nuevo@cintiviejo.test", "Operario");
    await expect(dialog.getByText(/límite de 6 colaboradores/)).toBeVisible();
    await expect(dialog.getByLabel("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    // La bitácora recoge los cambios, filtrable por acción.
    await nav(page, "Bitácora");
    await expect(page.getByRole("heading", { level: 1, name: "Bitácora de la bodega" })).toBeVisible();
    await page.getByRole("combobox", { name: "Acción" }).click();
    await page.getByRole("option", { name: "Equipo · Miembro bloqueado" }).click();
    await expect(page.getByRole("row", { name: /Licencia sin goce de haber/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Quitar filtro Acción: Miembro bloqueado" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("reenvía y anula invitaciones pendientes", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, "admin@altos.test");
    await nav(page, "Equipo");
    const pending = page.getByRole("row", { name: /enologo\.junior@altos\.test/ });
    await expect(pending).toContainText("Vence en menos de 24 h");

    await pending.getByRole("button", { name: /Acciones para la invitación/ }).click();
    await page.getByRole("menuitem", { name: "Reenviar" }).click();
    await expect(page.getByText("Invitación reenviada a enologo.junior@altos.test", { exact: true })).toBeVisible();
    await expect(pending).not.toContainText("Vence en menos de 24 h");

    await pending.getByRole("button", { name: /Acciones para la invitación/ }).click();
    await page.getByRole("menuitem", { name: "Anular" }).click();
    await page
      .getByRole("alertdialog", { name: "Anular la invitación a enologo.junior@altos.test" })
      .getByRole("button", { name: "Anular invitación" })
      .click();
    await expect(page.getByText("Invitación anulada", { exact: true })).toBeVisible();
    await expect(pending).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("teclado: el menú de acciones abre el bloqueo y Esc devuelve el foco", async ({ page }) => {
    await login(page, "admin@altos.test");
    await nav(page, "Equipo");
    const trigger = page.getByRole("button", { name: "Acciones para Mario Quispe" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Cambiar rol" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Bloquear acceso" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Bloquear a Mario Quispe" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("bodega no activa (ORG_NOT_ACTIVE)", () => {
  test("suspendida: la dueña ve el estado, los datos de la bodega, su perfil y la bitácora", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, "sofia@aramayo.test");
    await page.getByRole("combobox", { name: "Organización activa" }).click();
    await page.getByRole("option", { name: /Casa Uriondo/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "La bodega está suspendida" })).toBeVisible();
    await expect(page.getByText("Solo lectura mientras dure la suspensión.")).toBeVisible();

    // Cualquier módulo lleva a la misma pantalla, sin romper la navegación.
    await page.goto("/origen");
    await expect(page.getByRole("heading", { level: 1, name: "La bodega está suspendida" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Origen y terroirs" })).toHaveCount(0);

    await nav(page, "Bitácora");
    await expect(page.getByRole("heading", { level: 1, name: "Bitácora de la bodega" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ver detalle:/ }).first()).toBeVisible();
    await expect(page.getByText("La bitácora está vacía")).toHaveCount(0);

    await page.goto("/perfil");
    await expect(page.getByRole("heading", { level: 1, name: "Lic. Sofía Aramayo" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("invitada: explica que falta activar la bodega", async ({ page }) => {
    const errors = trackErrors(page);
    await signIn(page, "gerencia@guadalquivir.test", "demo1234");
    await expect(page.getByRole("heading", { level: 1, name: "La bodega aún no está activa" })).toBeVisible();
    await expect(page.getByText(/Abre el enlace del correo de invitación/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Bitácora" })).toHaveCount(0);
    expect(await axe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("revocada: sin organización activa, explica por qué no entra", async ({ page }) => {
    const errors = trackErrors(page);
    await signIn(page, "hugo@valleescondido.test", "demo1234");
    await expect(page.getByRole("heading", { level: 1, name: "El acceso de la bodega fue revocado" })).toBeVisible();
    await expect(page.getByText(/Bodega Valle Escondido · Dirección/)).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  });
});

test.describe("accesibilidad de las pantallas públicas nuevas", () => {
  for (const path of ["/invitacion/demo-invitacion-padcaya", "/restablecer/enlace-de-prueba"]) {
    test(`axe ${path}`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(path);
      await settled(page);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
