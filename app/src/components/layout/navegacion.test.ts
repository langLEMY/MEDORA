import { describe, expect, it } from "vitest";
import { inicioPorRol, NAVEGACION, puedeVer } from "./navegacion";

const menu = (roles: Parameters<typeof puedeVer>[1], esSuperadmin = false, propio = false) =>
  NAVEGACION.filter((i) => !i.soloBusqueda && puedeVer(i, roles, esSuperadmin, null, propio)).map((i) => i.etiqueta);

describe("inicio según el rol", () => {
  it("cada quien aterriza donde trabaja", () => {
    expect(inicioPorRol(["admin"], false)).toBe("/");
    expect(inicioPorRol(["recepcion"], false)).toBe("/recepcion");
    expect(inicioPorRol(["caja"], false)).toBe("/caja");
    expect(inicioPorRol(["medico"], false)).toBe("/recepcion");
    expect(inicioPorRol(["farmacia"], false)).toBe("/inventario");
    expect(inicioPorRol([], true)).toBe("/");
  });
});

describe("menú", () => {
  it("caja ve Caja y Finanzas (donaciones), no Nómina ni Personal", () => {
    const m = menu(["caja"]);
    expect(m).toContain("Caja y facturación");
    expect(m).toContain("Finanzas");
    expect(m).not.toContain("Nómina");
    expect(m).not.toContain("Personal");
  });
  it("el médico con vista propia no ve el directorio de colegas", () => {
    expect(menu(["medico"], false, true)).not.toContain("Médicos");
  });
  it("Plataforma es solo del superadmin", () => {
    expect(menu(["admin"])).not.toContain("Plataforma");
    expect(menu([], true)).toContain("Plataforma");
  });
  it("Reportes ya no es una entrada suelta: vive dentro de Finanzas", () => {
    expect(menu(["admin"])).not.toContain("Reportes");
    expect(menu(["admin"])).toContain("Finanzas");
  });
});
