import { describe, expect, it, vi } from "vitest";

// esDocumento vive junto al documento imprimible, que importa la sesión (y esta, el cliente).
vi.mock("@/lib/supabase", () => ({ supabase: {}, datos: (r: { data: unknown }) => r.data }));
import { balanceHidrico, CONDICIONES, diasLicencia, FORMULARIOS, habitosActivos, listaAlergias } from "./catalogoClinico";
import { esDocumento } from "./DocumentoClinico";

describe("catálogo clínico", () => {
  it("cuenta los días de licencia con ambos extremos", () => {
    expect(diasLicencia("2026-11-10", "2026-11-12")).toBe(3);
    expect(diasLicencia("2026-11-10", "2026-11-10")).toBe(1);
    expect(diasLicencia("2026-11-12", "2026-11-10")).toBeNull();
    expect(diasLicencia("", "2026-11-10")).toBeNull();
  });

  it("calcula el balance hídrico (ingresos − egresos)", () => {
    expect(balanceHidrico({ ingreso_oral: "500", ingreso_iv: "1000", egreso_orina: "800" })).toBe(700);
    expect(balanceHidrico({ egreso_orina: "300" })).toBe(-300);
    expect(balanceHidrico({})).toBeNull();
  });

  it("separa las alergias escritas a mano e ignora 'ninguna'", () => {
    expect(listaAlergias("Penicilina, mariscos; látex")).toEqual(["Penicilina", "mariscos", "látex"]);
    expect(listaAlergias("Ninguna")).toEqual([]);
    expect(listaAlergias(null)).toEqual([]);
  });

  it("muestra solo los hábitos activos", () => {
    expect(habitosActivos({ tabaco: "Diario", alcohol: "No", cafe: "" }).map((h) => h.clave)).toEqual(["tabaco"]);
  });

  it("las claves de formularios son únicas", () => {
    const claves = FORMULARIOS.map((f) => f.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("las condiciones coinciden con el check de la base", () => {
    expect(CONDICIONES.map((c) => c.clave).sort()).toEqual(
      ["anticoagulado", "diabetico", "dialisis", "discapacidad", "embarazo", "hipertenso", "inmunosuprimido", "lactancia", "marcapasos", "movilidad_reducida"].sort(),
    );
  });

  it("solo imprime los formularios marcados como imprimibles", () => {
    expect(esDocumento("licencia")).toBe(true);
    expect(esDocumento("formulario", { formulario: "epicrisis" })).toBe(true);
    expect(esDocumento("formulario", { formulario: "control_hidrico" })).toBe(false);
    expect(esDocumento("evolucion")).toBe(false);
  });
});
