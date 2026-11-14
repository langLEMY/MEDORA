import { describe, expect, it, vi } from "vitest";

// esDocumento vive junto al documento imprimible, que importa la sesión (y esta, el cliente).
vi.mock("@/lib/supabase", () => ({ supabase: {}, datos: (r: { data: unknown }) => r.data }));
import { capacidadesSede } from "@/lib/capacidades";
import {
  alertasSignos,
  balanceHidrico,
  CONDICIONES,
  diasLicencia,
  FORMULARIO_POR_CLAVE,
  formularioDisponible,
  FORMULARIOS,
  habitosActivos,
  listaAlergias,
  puntajeEscala,
} from "./catalogoClinico";
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

  it("Morse: suma las respuestas y clasifica el riesgo de caída", () => {
    const morse = FORMULARIO_POR_CLAVE.escala_morse;
    const alto = puntajeEscala(morse, {
      caidas_previas: "Sí (25)", dx_secundario: "Sí (15)", ayuda_deambular: "Muletas, bastón o andador (15)",
      via_iv: "Sí (20)", marcha: "Débil (10)", estado_mental: "Conoce sus limitaciones (0)",
    });
    expect(alto).toMatchObject({ total: 85, riesgo: "alto", completo: true });
    expect(puntajeEscala(morse, { caidas_previas: "No (0)", via_iv: "Sí (20)" })).toMatchObject({ total: 20, riesgo: "bajo", completo: false });
    expect(puntajeEscala(morse, {})).toBeNull();
  });

  it("Braden: menos puntos es más riesgo", () => {
    const braden = FORMULARIO_POR_CLAVE.escala_braden;
    const todo = (n: number) => Object.fromEntries(braden.campos.map((c) => [c.clave, c.opciones!.find((o) => o.endsWith(`(${n})`)) ?? c.opciones![c.opciones!.length - 1]]));
    expect(puntajeEscala(braden, todo(1))).toMatchObject({ total: 6, etiqueta: "Riesgo alto" });
    expect(puntajeEscala(braden, todo(4))).toMatchObject({ total: 23, etiqueta: "Sin riesgo" });
  });

  it("alerta signos vitales fuera de rango", () => {
    expect(alertasSignos({ pa: "185/100" })).toEqual([{ texto: "Crisis hipertensiva (185/100)", grave: true }]);
    expect(alertasSignos({ pa: "145/85", temp: "38.2" }).map((a) => a.grave)).toEqual([false, false]);
    expect(alertasSignos({ sat: "88", glucosa: "55" }).every((a) => a.grave)).toBe(true);
    expect(alertasSignos({ pa: "120/80", fc: "72", temp: "36.5", sat: "98" })).toEqual([]);
  });

  it("un consultorio no ve los formularios de internamiento; un hospital sí", () => {
    const consultorio = capacidadesSede({ tipo: "consultorio" });
    const hospital = capacidadesSede({ tipo: "hospital" });
    const nombres = (c: typeof consultorio) => FORMULARIOS.filter((f) => formularioDisponible(f, c)).map((f) => f.clave);
    expect(nombres(consultorio)).not.toContain("control_hidrico");
    expect(nombres(consultorio)).not.toContain("escala_morse");
    expect(nombres(consultorio)).toContain("aplicacion_medicamento");
    expect(nombres(hospital)).toContain("control_hidrico");
    expect(nombres(hospital)).toContain("epicrisis");
    // Un consultorio con internamiento activado a mano (override) sí los ve.
    expect(nombres(capacidadesSede({ tipo: "consultorio", capacidades: { internamiento: true } }))).toContain("control_hidrico");
    // Sin sede resuelta no se oculta nada; los que escribe una RPC nunca se eligen.
    expect(nombres({})).toContain("control_hidrico");
    expect(nombres(hospital)).not.toContain("indicacion_medicamento");
  });

  it("solo imprime los formularios marcados como imprimibles", () => {
    expect(esDocumento("licencia")).toBe(true);
    expect(esDocumento("formulario", { formulario: "epicrisis" })).toBe(true);
    expect(esDocumento("formulario", { formulario: "control_hidrico" })).toBe(false);
    expect(esDocumento("evolucion")).toBe(false);
  });
});
