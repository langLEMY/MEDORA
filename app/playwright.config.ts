import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta (Playwright) contra la app en modo navegador.
 *
 *   npm run e2e                       → solo lo que no necesita cuenta (pantalla de acceso)
 *   E2E_USUARIO=… E2E_CLAVE=… npm run e2e → además recorre la app con esa cuenta
 *
 * La cuenta debe pertenecer SOLO a un sistema de pruebas (franja «PRUEBAS»): las pruebas
 * se detienen si no ven la franja, para no tocar nunca un hospital real.
 * E2E_URL apunta a otra instancia ya servida (si no, se levanta `vite` en el puerto 5180).
 */
const url = process.env.E2E_URL ?? "http://localhost:5180";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: url, trace: "retain-on-failure", locale: "es-DO", timezoneId: "America/Santo_Domingo" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_URL
    ? undefined
    : { command: "npx vite --port 5180 --strictPort", url, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
