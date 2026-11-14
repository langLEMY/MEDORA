import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// Datos inventados con la forma que devuelve PostgREST.
const ORDEN_ID = "o1";
const tablas: Record<string, unknown[]> = {
  historial_clinico: [
    { id: "h1", tipo: "signos_vitales", titulo: null, contenido: "Registro estructurado", datos: { pa: "130/85", fc: "78", temp: "36.8", sat: "97" }, corrige_a: null, creado_en: "2026-11-13T14:00:00Z", autor: { nombre_completo: "Enf. Prueba" } },
    { id: "h2", tipo: "orden", titulo: "Orden de laboratorio OM-2026-000001", contenido: "Hemograma\nCreatinina", datos: { orden_id: ORDEN_ID, numero: "OM-2026-000001", items: [{ nombre: "Hemograma" }, { nombre: "Creatinina" }] }, corrige_a: null, creado_en: "2026-11-13T13:00:00Z", autor: { nombre_completo: "Dra. Prueba" } },
    { id: "h3", tipo: "formulario", titulo: "Hoja de egreso (epicrisis)", contenido: "Hoja de egreso (epicrisis)", datos: { formulario: "epicrisis", dx_egreso: "Neumonía resuelta", condicion: "Mejorado", evolucion: "Afebril desde el día 2." }, corrige_a: null, creado_en: "2026-11-12T13:00:00Z", autor: { nombre_completo: "Dra. Prueba" } },
    { id: "h4", tipo: "licencia", titulo: null, contenido: "Licencia de 3 días", datos: { desde: "2026-11-12", hasta: "2026-11-14", diagnostico: "Neumonía", reposo: "Absoluto" }, corrige_a: null, creado_en: "2026-11-12T12:00:00Z", autor: { nombre_completo: "Dra. Prueba" } },
    { id: "h5", tipo: "vacuna", titulo: null, contenido: "Influenza, dosis Anual", datos: { vacuna: "Influenza", dosis: "Anual", fecha_aplicacion: "2026-10-01", lote: "FLU-778", via: "IM", proxima_dosis: "2027-10-01" }, corrige_a: null, creado_en: "2026-10-01T12:00:00Z", autor: { nombre_completo: "Enf. Prueba" } },
    { id: "h6", tipo: "formulario", titulo: null, contenido: "Control hídrico", datos: { formulario: "control_hidrico", ingreso_oral: "500", ingreso_iv: "1000", egreso_orina: "900" }, corrige_a: null, creado_en: "2026-10-01T11:00:00Z", autor: { nombre_completo: "Enf. Prueba" } },
    { id: "h7", tipo: "evolucion", titulo: null, contenido: "Se corrige: la temperatura fue 37.2.", datos: {}, corrige_a: "h1", creado_en: "2026-11-13T15:00:00Z", autor: { nombre_completo: "Enf. Prueba" } },
  ],
  ordenes_medicas: [
    {
      id: ORDEN_ID, numero: "OM-2026-000001", tipo: "laboratorio", proveedor: "Laboratorio Demo", diagnostico: "Control", indicaciones: null, cita_id: null, creado_en: "2026-11-13T13:00:00Z",
      medico: { nombre_completo: "Dra. Prueba" },
      items: [
        { id: "i2", posicion: 2, descripcion: "Creatinina", estado: "entregada", actualizado_en: "2026-11-13T16:00:00Z" },
        { id: "i1", posicion: 1, descripcion: "Hemograma", estado: "pendiente", actualizado_en: null },
      ],
    },
  ],
  citas: [{ id: "c1", estado: "en_consulta", inicio: "2026-11-14T13:00:00Z", atendida_en: null, turno: "MG-004", medico_id: "u1" }],
  laboratorio_pruebas: [],
  aseguradoras: [],
  membresias: [],
};

function consulta(tabla: string) {
  const filas = tablas[tabla] ?? [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "is", "or", "order", "limit", "gte", "lte", "ilike"]) b[m] = () => b;
  b.maybeSingle = async () => ({ data: filas[0] ?? null, error: null });
  b.single = b.maybeSingle;
  b.then = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(ok, mal);
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: consulta,
    rpc: async () => ({ data: null, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  }),
}));
vi.mock("@/sesion/SesionProvider", () => ({
  useSistema: () => ({ sistemaId: "s1", sistema: { id: "s1", nombre: "Hospital Demo" }, roles: ["medico", "enfermeria"], permisos: {} }),
  useSesion: () => ({ perfil: { id: "u1", nombre_completo: "Dra. Prueba" }, sesion: { user: { id: "u1" } }, roles: ["medico"], permisos: {}, esSuperadmin: false }),
}));

const { HistorialClinico } = await import("./HistorialClinico");
const { OrdenesMedicas } = await import("./OrdenesMedicas");
const { Vacunas } = await import("./Vacunas");
const { CabeceraClinica } = await import("./CabeceraClinica");
const { BotonCheckout } = await import("./Checkout");
const { FormPaciente } = await import("./FormPaciente");

const montar = (n: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{n}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("expediente ampliado", () => {
  it("la línea de tiempo muestra formularios, órdenes con su estado, licencia, balance y adendas", async () => {
    montar(<HistorialClinico pacienteId="p1" pacienteNombre="Paciente Demo" />);
    expect(await screen.findAllByText("Hoja de egreso (epicrisis)")).not.toHaveLength(0);
    expect(screen.getByText("Neumonía resuelta")).toBeInTheDocument();
    // Orden estructurada: las pruebas con su estado actual (no el texto plano).
    expect(await screen.findByText("Pendiente de entrega")).toBeInTheDocument();
    expect(screen.getByText(/^Entregada · /)).toBeInTheDocument();
    expect(screen.getByText("3 días")).toBeInTheDocument();
    expect(screen.getByText("+600 ml")).toBeInTheDocument();
    expect(screen.getByText(/la temperatura fue 37.2/)).toBeInTheDocument();
    // Agrupado por mes.
    expect(screen.getByText(/noviembre de 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/octubre de 2026/i)).toBeInTheDocument();
    // El catálogo lateral ofrece formularios, órdenes y consentimientos.
    expect(screen.getAllByText("Consentimientos").length).toBeGreaterThan(0);
  });

  it("la búsqueda filtra el historial (sin tildes) e incluye las adendas", async () => {
    montar(<HistorialClinico pacienteId="p1" pacienteNombre="Paciente Demo" />);
    await screen.findByText("Neumonía resuelta");
    fireEvent.change(screen.getByLabelText("Buscar en el historial"), { target: { value: "neumonia" } });
    expect(screen.getByText("Neumonía resuelta")).toBeInTheDocument();
    expect(screen.queryByText("FLU-778")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar en el historial"), { target: { value: "37.2" } });
    expect(screen.getByText(/la temperatura fue 37.2/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar en el historial"), { target: { value: "zzz" } });
    expect(screen.getByText("Nada coincide con la búsqueda")).toBeInTheDocument();
  });

  it("la pestaña Órdenes ordena las pruebas y resume el avance", async () => {
    montar(<OrdenesMedicas pacienteId="p1" pacienteNombre="Paciente Demo" />);
    expect(await screen.findByText("OM-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("1 de 2 entregadas")).toBeInTheDocument();
    const nombres = screen.getAllByText(/^(Hemograma|Creatinina)$/).map((n) => n.textContent);
    expect(nombres).toEqual(["Hemograma", "Creatinina"]);
  });

  it("el carnet de vacunas muestra la dosis y la próxima", async () => {
    montar(<Vacunas pacienteId="p1" pacienteNombre="Paciente Demo" />);
    expect(await screen.findByText("FLU-778")).toBeInTheDocument();
    expect(screen.getByText("Próximas dosis")).toBeInTheDocument();
  });

  it("la cabecera muestra alergias, hábitos y los últimos signos vitales", async () => {
    montar(
      <CabeceraClinica
        pacienteId="p1"
        verHistorial
        p={{
          alergias: "Penicilina, mariscos",
          tipo_sangre: "O+",
          condiciones_cronicas: null,
          habitos: { tabaco: "Diario", alcohol: "No" },
          antecedentes: { quirurgicos: "Apendicectomía (2010)" },
          condiciones_especiales: ["hipertenso"],
          fecha_nacimiento: "1950-01-01",
          medico_cabecera: { nombre_completo: "Dra. Prueba" },
        }}
      />,
    );
    expect(screen.getByText("Penicilina")).toBeInTheDocument();
    expect(screen.getByText("mariscos")).toBeInTheDocument();
    expect(screen.getByText("Hipertenso")).toBeInTheDocument();
    expect(screen.getByText("Adulto mayor")).toBeInTheDocument();
    expect(await screen.findByText("130/85")).toBeInTheDocument();
  });

  it("la ficha del paciente edita hábitos, antecedentes y condiciones especiales", async () => {
    const paciente = {
      id: "p1", sistema_id: "s1", expediente: "EXP-000001", nombres: "Paciente", apellidos: "Demo", documento_tipo: "otro", documento: null,
      fecha_nacimiento: null, sexo: null, telefono: null, email: null, direccion: null, tipo_sangre: null, alergias: null, condiciones_cronicas: null,
      aseguradora_id: null, numero_afiliado: null, contacto_emergencia_nombre: null, contacto_emergencia_telefono: null, notas: null, eliminado_en: null,
      busqueda: null, creado_en: "2026-01-01T00:00:00Z", creado_por: null, actualizado_en: "2026-01-01T00:00:00Z", actualizado_por: null, foto_documento: null,
      habitos: { tabaco: "No" }, antecedentes: { familiares: "Madre diabética" }, condiciones_especiales: ["embarazo"], medico_cabecera_id: null,
    };
    montar(<FormPaciente abierto onCerrar={() => {}} paciente={paciente} />);
    expect(await screen.findByText("Hábitos tóxicos")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Madre diabética")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Embarazo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Lactancia" })).toHaveAttribute("aria-pressed", "false");
  });

  it("el checkout aparece con una consulta en curso y abre su resumen", async () => {
    montar(<BotonCheckout pacienteId="p1" pacienteNombre="Paciente Demo" />);
    fireEvent.click(await screen.findByRole("button", { name: /Checkout/ }));
    expect(await screen.findByText("Checkout de la consulta")).toBeInTheDocument();
    expect(screen.getByText(/turno MG-004/)).toBeInTheDocument();
  });
});
