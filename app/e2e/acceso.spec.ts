import { expect, test } from "@playwright/test";

// Pantalla de acceso: no necesita cuenta ni envía nada al servidor.
test.describe("Acceso", () => {
  test("muestra la marca MEDORA y las opciones de la pantalla de acceso", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Bienvenido de nuevo")).toBeVisible();
    await expect(page.getByText("MEDORA").first()).toBeVisible();
    await expect(page.getByLabel("Usuario")).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
    await expect(page.getByText("¿Olvidaste tu contraseña?")).toBeVisible();
    await expect(page.getByText("Crear cuenta")).toBeVisible();
  });

  test("valida los campos antes de enviar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /entrar|iniciar/i }).click();
    // Sin datos no se llama a la Edge Function: el formulario marca los campos.
    await expect(page.locator("[aria-invalid=true]").first()).toBeVisible();
  });
});
