import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// Datos inventados con la forma de las RPC.
const reporte = {
  donaciones: { total: 150000, cantidad: 3, donantes: 2 },
  por_donante: [{ donante: "Banco Demo", total: 100000, n: 1 }, { donante: "Anónimo", total: 50000, n: 2 }],
  fondos: [{ nombre: "Medicamentos 2026", restringido: true, recibido: 100000, usado: 40000, saldo: 60000 }],
  beneficiarios: { pacientes: 320, consultas: 410, jornadas: 2, atenciones_jornadas: 180 },
  valor_social: { tarifa_social: 85500, otros_descuentos: 1200, exonerados: 14, estudios: { D: 5, C: 9 } },
  voluntarios: { personas: 4, consultas: 96 },
};
const fondos = [
  { id: "f1", nombre: "Medicamentos 2026", donante: "Banco Demo", descripcion: null, restringido: true, meta: 200000, activo: true, recibido: 100000, usado: 40000, saldo: 60000, donaciones: 1 },
];

function consulta() {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "gte", "lte"]) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: consulta,
    rpc: async (fn: string) => ({ data: fn === "reporte_fundacion" ? reporte : fn === "fondos_resumen" ? fondos : null, error: null }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

let naturaleza = "fundacion";
vi.mock("@/sesion/SesionProvider", () => ({
  useSistema: () => ({ sistemaId: "s1", sistema: { id: "s1", nombre: "Fundación Demo" }, roles: ["admin"], permisos: {} }),
  useSesion: () => ({ naturaleza, tarifaSocial: null, perfil: { id: "u1" } }),
}));

const { default: Fundacion } = await import("./Fundacion");

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Fundacion />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Fundación", () => {
  it("una institución privada no ve los módulos de fundación", () => {
    naturaleza = "privada";
    montar();
    expect(screen.getByText("Esta institución no está registrada como fundación")).toBeInTheDocument();
  });

  it("el resumen muestra donaciones, personas atendidas, tarifa social y voluntarios", async () => {
    naturaleza = "fundacion";
    montar();
    expect(await screen.findByText("Banco Demo")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument(); // 320 en la sede + 180 en jornadas
    expect(screen.getByText(/14 turnos exonerados/)).toBeInTheDocument();
    expect(screen.getByText(/96 consultas de profesionales voluntarios/)).toBeInTheDocument();
  });

  it("los fondos muestran recibido, usado y disponible", async () => {
    naturaleza = "fundacion";
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Fondos" }));
    expect(await screen.findByText("Restringido")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registrar uso/ })).toBeInTheDocument();
  });
});
