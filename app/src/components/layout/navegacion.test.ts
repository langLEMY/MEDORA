import { describe, expect, it } from "vitest";
import { inicioPorRol, moduloApagado, NAVEGACION, puedeVer } from "./navegacion";

const menu = (roles: Parameters<typeof puedeVer>[1], esSuperadmin = false, propio = false) =>
  NAVEGACION.filter((i) => !i.soloBusqueda && puedeVer(i, roles, esSuperadmin, null, propio)).map((i) => i.etiqueta);

describe("inicio según el rol", () => {
  it("cada quien aterriza donde trabaja", () => {
    expect(inicioPorRol(["admin"], false)).toBe("/");
    expect(inicioPorRol(["recepcion"], false)).toBe("/recepcion");
    expect(inicioPorRol(["caja"], false)).toBe("/caja");
    expect(inicioPorRol(["medico"], false)).toBe("/recepcion");
    expect(inicioPorRol(["farmacia"], false)).toBe("/inventario");
    expect(inicioPorRol(["enfermeria"], false)).toBe("/enfermeria");
    expect(inicioPorRol(["laboratorio"], false)).toBe("/laboratorio");
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
  it("enfermería ve lo de una enfermera: Enfermería, Pacientes e Inventario; no Agenda ni Recepción", () => {
    const m = menu(["enfermeria"]);
    expect(m).toEqual(expect.arrayContaining(["Inicio", "Enfermería", "Pacientes", "Inventario"]));
    expect(m).not.toContain("Agenda");
    expect(m).not.toContain("Recepción");
  });
  it("el médico ya no entra a Enfermería, Inventario ni Laboratorio", () => {
    const m = menu(["medico"]);
    expect(m).not.toContain("Enfermería");
    expect(m).not.toContain("Inventario");
    expect(m).not.toContain("Laboratorio");
  });
  it("un módulo apagado en el hospital desaparece (con sus secciones), pero Inicio y Personal no se apagan", () => {
    const ver = (ruta: string, apagados: string[]) => puedeVer(NAVEGACION.find((i) => i.ruta === ruta)!, ["admin"], false, null, false, undefined, apagados);
    expect(ver("/agenda", ["/agenda"])).toBe(false);
    expect(ver("/agenda", [])).toBe(true);
    expect(ver("/finanzas?vista=donaciones", ["/finanzas"])).toBe(false);
    expect(moduloApagado("/", ["/"])).toBe(false);
    expect(moduloApagado("/personal", ["/personal"])).toBe(false);
  });
  it("no hay sección Fundación en el menú", () => {
    expect(NAVEGACION.some((i) => i.ruta === "/fundacion")).toBe(false);
  });
  it("Reportes ya no es una entrada suelta: vive dentro de Finanzas", () => {
    expect(menu(["admin"])).not.toContain("Reportes");
    expect(menu(["admin"])).toContain("Finanzas");
  });
});
