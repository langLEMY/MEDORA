import { describe, expect, it, vi } from "vitest";

// construirBundle es pura; el cliente de Supabase no hace falta (y sin .env no se crea).
vi.mock("@/lib/supabase", () => ({ supabase: {}, datos: (r: { data: unknown }) => r.data }));
import { construirBundle, type DatosFhir } from "./fhir";

const base = (): DatosFhir => ({
  sistema: { nombre: "Hospital Demo", rnc: "101000001" },
  paciente: {
    id: "11111111-1111-4111-8111-111111111111",
    sistema_id: "s",
    expediente: "EXP-000001",
    nombres: "Ana María",
    apellidos: "Pérez Gómez",
    documento_tipo: "cedula",
    documento: "001-0000001-1",
    fecha_nacimiento: "1990-05-04",
    sexo: "F",
    telefono: "809-555-0001",
    email: null,
    direccion: "Santo Domingo",
    tipo_sangre: "O+",
    alergias: "Penicilina",
    condiciones_cronicas: null,
    aseguradora_id: null,
    numero_afiliado: null,
    contacto_emergencia_nombre: null,
    contacto_emergencia_telefono: null,
    notas: null,
    eliminado_en: null,
    busqueda: null,
    creado_en: "2026-01-01T00:00:00Z",
    creado_por: null,
    actualizado_en: "2026-01-01T00:00:00Z",
    actualizado_por: null,
    foto_documento: null,
  },
  citas: [
    { id: "22222222-2222-4222-8222-222222222222", inicio: "2026-10-01T13:00:00Z", fin: "2026-10-01T13:30:00Z", estado: "completada", especialidad: "Medicina general", motivo: "Control", medico: { nombre_completo: "Dra. Demo" } },
    { id: "33333333-3333-4333-8333-333333333333", inicio: "2026-10-05T13:00:00Z", fin: "2026-10-05T13:30:00Z", estado: "cancelada", especialidad: null, motivo: null },
  ],
  historial: [
    { id: "44444444-4444-4444-8444-444444444444", tipo: "consulta", titulo: "Consulta", contenido: "Paciente estable.", datos: null, corrige_a: null, creado_en: "2026-10-01T13:20:00Z", cita_id: "22222222-2222-4222-8222-222222222222" },
    { id: "55555555-5555-4555-8555-555555555555", tipo: "receta", titulo: "Receta", contenido: "", datos: { items: [{ nombre: "Amoxicilina 500 mg", detalle: "1 cada 8 h", indicaciones: "7 días" }, { nombre: "" }] }, corrige_a: null, creado_en: "2026-10-01T13:25:00Z", cita_id: null },
    { id: "66666666-6666-4666-8666-666666666666", tipo: "diagnostico", titulo: "Hipertensión", contenido: "Grado 1", datos: null, corrige_a: null, creado_en: "2026-10-01T13:30:00Z", cita_id: null },
  ],
  laboratorio: [
    { id: "77777777-7777-4777-8777-777777777777", laboratorio: "Lab Demo", orden: "L-1", fecha_resultado: "2026-10-02T10:00:00Z", resultados: [{ prueba: "Glucosa", valor: 98, unidad: "mg/dL", referencia: "70-110" }, { prueba: "VIH", valor: "No reactivo" }], observaciones: null },
  ],
});

const tipos = (b: ReturnType<typeof construirBundle>) =>
  (b.entry as { resource: { resourceType: string } }[]).map((e) => e.resource.resourceType);

describe("construirBundle (FHIR R4)", () => {
  it("arma un Bundle collection con el paciente y sus recursos", () => {
    const b = construirBundle(base(), new Date("2026-10-27T00:00:00Z"));
    expect(b.resourceType).toBe("Bundle");
    expect(b.type).toBe("collection");
    expect(tipos(b)).toEqual([
      "Patient",
      "AllergyIntolerance",
      "Observation", // tipo de sangre
      "Encounter", // solo la cita completada
      "DocumentReference",
      "MedicationRequest", // el renglón vacío de la receta no cuenta
      "Condition",
      "Observation",
      "Observation",
      "DiagnosticReport",
    ]);
  });

  it("identifica al paciente por expediente y cédula, con nombres y sexo FHIR", () => {
    const b = construirBundle(base());
    const p = (b.entry as { resource: Record<string, unknown> }[])[0].resource as {
      identifier: { system: string; value: string }[];
      name: { family: string; given: string[] }[];
      gender: string;
    };
    expect(p.identifier.map((i) => i.value)).toEqual(["EXP-000001", "001-0000001-1"]);
    expect(p.name[0]).toMatchObject({ family: "Pérez Gómez", given: ["Ana", "María"] });
    expect(p.gender).toBe("female");
  });

  it("las referencias apuntan a recursos del mismo Bundle", () => {
    const b = construirBundle(base());
    const entradas = b.entry as { fullUrl: string; resource: Record<string, unknown> }[];
    const urls = new Set(entradas.map((e) => e.fullUrl));
    const refs = JSON.stringify(entradas).match(/"reference":"([^"]+)"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(urls.has(r.slice(13, -1))).toBe(true);
  });

  it("el texto de las notas va en base64 UTF-8 (acentos incluidos)", () => {
    const d = base();
    d.historial[0].contenido = "Evolución favorable";
    const b = construirBundle(d);
    const doc = (b.entry as { resource: { resourceType: string; content?: { attachment: { data: string } }[] } }[]).find(
      (e) => e.resource.resourceType === "DocumentReference",
    )!.resource;
    const bytes = Uint8Array.from(atob(doc.content![0].attachment.data), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("Evolución favorable");
  });
});
