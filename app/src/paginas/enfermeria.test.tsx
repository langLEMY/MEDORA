import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capacidadesSede } from "@/lib/capacidades";

afterEach(cleanup);

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

// Datos inventados con la forma de PostgREST / del RPC kardex.
const tablas: Record<string, unknown[]> = {
  citas: [
    { id: "c1", estado: "en_espera", turno: "MG-003", paciente_id: "p1", llegada_en: hace(20), inicio: hace(30), especialidad: "Medicina general", medico: { nombre_completo: "Dra. Prueba" }, paciente: { nombres: "Ana", apellidos: "Demo" }, prioridad: false },
  ],
  historial_clinico: [],
  ordenes_medicas: [
    { id: "o1", numero: "OM-2026-000002", tipo: "procedimiento", indicaciones: null, creado_en: hace(40), paciente_id: "p1", paciente: { nombres: "Ana", apellidos: "Demo", expediente: "EXP-1" }, medico: { nombre_completo: "Dra. Prueba" }, items: [{ id: "i1", posicion: 1, descripcion: "Nebulización", estado: "pendiente" }] },
  ],
  admisiones: [],
};
const kardex = [
  { indicacion_id: "k1", paciente_id: "p2", paciente: "Luis Demo", cama: "101", medicamento: "Ceftriaxona", dosis: "1 g", via: "IV", pauta: "horario", frecuencia_horas: 8, observaciones: null, estado_indicacion: "activa", programada_para: hace(120), administracion_id: null, estado: null, motivo: null, registrado_en: null, registrado_por: null },
  { indicacion_id: "k2", paciente_id: "p2", paciente: "Luis Demo", cama: "101", medicamento: "Omeprazol", dosis: "40 mg", via: "IV", pauta: "horario", frecuencia_horas: 24, observaciones: null, estado_indicacion: "activa", programada_para: hace(180), administracion_id: "a1", estado: "administrada", motivo: null, registrado_en: hace(170), registrado_por: "Enf. Prueba" },
  { indicacion_id: "k3", paciente_id: "p2", paciente: "Luis Demo", cama: "101", medicamento: "Acetaminofén", dosis: "1 g", via: "Oral", pauta: "si_necesario", frecuencia_horas: null, observaciones: "Si fiebre", estado_indicacion: "activa", programada_para: null, administracion_id: null, estado: null, motivo: null, registrado_en: null, registrado_por: null },
];

function consulta(tabla: string) {
  const filas = tablas[tabla] ?? [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "or", "order", "limit", "gte", "lte"]) b[m] = () => b;
  b.maybeSingle = async () => ({ data: filas[0] ?? null, error: null });
  b.then = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(ok, mal);
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: consulta,
    rpc: async (fn: string) => ({ data: fn === "kardex" ? kardex : null, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  }),
}));

let sede = { id: "s", nombre: "Sede Demo", tipo: "consultorio", capacidades: null as Record<string, boolean> | null };
vi.mock("@/sesion/SesionProvider", () => ({
  useSistema: () => ({ sistemaId: "s1", sistema: { id: "s1", nombre: "Hospital Demo" }, roles: ["enfermeria", "medico"], permisos: {} }),
  useSesion: () => ({ perfil: { id: "u1", nombre_completo: "Enf. Prueba" }, sesion: { user: { id: "u1" } }, sede, capacidades: capacidadesSede(sede) }),
}));

const { default: Enfermeria, ventanaTurno } = await import("./Enfermeria");

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Enfermeria />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Enfermería según el tipo de establecimiento", () => {
  it("un consultorio ve preconsulta y procedimientos, sin internados ni Kardex", async () => {
    sede = { ...sede, tipo: "consultorio" };
    montar();
    expect(screen.getByText(/Consultorio · Sede Demo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preconsulta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Procedimientos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kardex" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Internados" })).not.toBeInTheDocument();
    // Preconsulta: quien llegó y no tiene signos.
    expect(await screen.findByText("MG-003")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tomar signos/ })).toBeInTheDocument();
  });

  it("los procedimientos ordenados aparecen para realizarlos", async () => {
    sede = { ...sede, tipo: "consultorio" };
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Procedimientos" }));
    expect(await screen.findByText("Nebulización")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Realizado/ })).toBeInTheDocument();
  });

  it("un hospital ve además internados y el Kardex con dosis atrasadas, dadas y «si es necesario»", async () => {
    sede = { ...sede, tipo: "hospital" };
    montar();
    expect(screen.getByRole("button", { name: "Internados" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kardex" }));
    expect(await screen.findByText("Ceftriaxona")).toBeInTheDocument();
    expect(screen.getAllByText("Atrasada").length).toBeGreaterThan(0);
    expect(screen.getByText("Administrada")).toBeInTheDocument();
    expect(screen.getByText("Si es necesario")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Administrar ahora/ })).toBeInTheDocument();
  });

  it("el turno de noche de madrugada empieza la noche anterior a las 23:00", () => {
    const madrugada = new Date(2026, 10, 14, 3, 0);
    const { desde, hasta } = ventanaTurno("noche", madrugada);
    expect([desde.getDate(), desde.getHours()]).toEqual([13, 23]);
    expect([hasta.getDate(), hasta.getHours()]).toEqual([14, 7]);
    const tarde = ventanaTurno("tarde", madrugada);
    expect([tarde.desde.getDate(), tarde.desde.getHours()]).toEqual([14, 15]);
  });
});
