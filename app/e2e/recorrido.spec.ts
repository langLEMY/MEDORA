import { expect, test, type Page } from "@playwright/test";

/*
 * Recorrido con una cuenta del sistema de PRUEBAS (E2E_USUARIO / E2E_CLAVE).
 * Solo lectura: abre cada pantalla y los formularios principales sin guardar nada,
 * y falla si alguna cae en «Algo salió mal en esta pantalla».
 */
const usuario = process.env.E2E_USUARIO;
const clave = process.env.E2E_CLAVE;

test.describe("Recorrido (cuenta de pruebas)", () => {
  test.skip(!usuario || !clave, "Define E2E_USUARIO y E2E_CLAVE (cuenta del sistema de pruebas).");
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/");
    await page.getByLabel("Usuario").fill(usuario!);
    await page.getByLabel("Contraseña", { exact: true }).fill(clave!);
    await page.getByRole("button", { name: /entrar|iniciar/i }).click();
    // Freno de seguridad: solo se sigue dentro de un sistema de pruebas.
    await expect(page.getByText(/PRUEBAS · nada de lo que hagas aquí afecta/)).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await page?.close();
  });

  const pantallas: [string, RegExp][] = [
    ["/", /Inicio|Hola|Buen/],
    ["/recepcion", /Recepción|Mi consulta/],
    ["/agenda", /Agenda/],
    ["/pacientes", /Pacientes/],
    ["/caja", /Caja/],
    ["/comisiones", /Comisiones/],
    ["/finanzas", /Finanzas/],
    ["/contabilidad", /Contabilidad/],
    ["/ayuda", /Ayuda/],
    ["/perfil", /Mi perfil/],
  ];

  for (const [ruta, titulo] of pantallas) {
    test(`abre ${ruta} sin errores`, async () => {
      await page.goto(`/#${ruta}`);
      await expect(page.getByRole("heading", { name: titulo }).first()).toBeVisible();
      await expect(page.getByText("Algo salió mal en esta pantalla")).toHaveCount(0);
    });
  }

  test("Caja: F2 abre el nuevo cobro y Escape lo cierra sin guardar", async () => {
    await page.goto("/#/caja");
    await expect(page.getByRole("heading", { name: /Caja/ }).first()).toBeVisible();
    await page.keyboard.press("F2");
    const dialogo = page.getByRole("dialog", { name: "Nuevo cobro" });
    await expect(dialogo).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
  });

  test("Comisiones: la pestaña de liquidaciones y pagos carga", async () => {
    await page.goto("/#/comisiones");
    await page.getByRole("button", { name: "Liquidaciones y pagos" }).click();
    await expect(page.getByRole("button", { name: "Por pagar" })).toBeVisible();
  });
});
