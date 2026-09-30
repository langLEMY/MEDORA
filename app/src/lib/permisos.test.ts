import { describe, expect, it } from "vitest";
import { editaConfigContable, puede, puedeEscribir } from "./permisos";

describe("puede (espejo de privado.mis_sistemas_con_rol)", () => {
  it("da acceso por rol", () => {
    expect(puede(["caja"], "caja")).toBe(true);
    expect(puede(["recepcion"], "caja")).toBe(false);
    expect(puede(["medico"], "nomina")).toBe(false);
    expect(puede(["contabilidad"], "nomina")).toBe(true);
  });
  it("un permiso explícito gana sobre el rol, en los dos sentidos", () => {
    expect(puede(["recepcion"], "caja", false, { caja: true })).toBe(true);
    expect(puede(["caja"], "caja", false, { caja: false })).toBe(false);
  });
  it("sin permiso explícito, decide el rol", () => {
    expect(puede(["admin"], "contabilidad", false, {})).toBe(true);
  });
});

describe("escritura", () => {
  it("solo el personal clínico escribe en la historia", () => {
    expect(puedeEscribir.historial(["medico"])).toBe(true);
    expect(puedeEscribir.historial(["recepcion"])).toBe(false);
  });
  it("el catálogo de cuentas solo lo edita contabilidad o el superadmin", () => {
    expect(editaConfigContable(["admin"], false)).toBe(false);
    expect(editaConfigContable(["contabilidad"], false)).toBe(true);
    expect(editaConfigContable([], true)).toBe(true);
  });
});
