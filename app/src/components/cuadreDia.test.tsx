import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Datos como los devuelve cuadre_dia (08/10: SENASA Contributivo con fondo, farmacia y un pago con tarjeta).
const respuesta = {
  fecha: "2026-10-08",
  lineas: [
    { numero: "REC-1", hora: "09:28", grupo: "ROSARIO RAMIREZ", especialidad: "Medicina general y familiar", paciente: "GUILLERMINA SANTANA", documento: "402-4043011-2",
      procedimiento: "CONSULTA", autorizacion: "1926662260", aseguradora: "SENASA Contributivo", ars_grupo: "SENASA", ars: 500, fondo: 150,
      efectivo: 100, tarjeta: 0, transferencia: 0, otros: 0, credito: 0, descuento: 0, total: 600, comision: 300, retencion: 30 },
    { numero: "REC-2", hora: "10:00", grupo: "FARMACIA", especialidad: "", paciente: "GUILLERMINA SANTANA", documento: "402-4043011-2",
      procedimiento: "ENTREGA DE MEDICAMENTOS", autorizacion: "1926662260", aseguradora: "SENASA Contributivo", ars_grupo: "SENASA", ars: 150, fondo: 0,
      efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0, credito: 0, descuento: 0, total: 150, comision: 0, retencion: 0 },
  ],
  egresos: [{ concepto: "Taxi", monto: 300, metodo: "efectivo", categoria: "general" }],
  turnos: [{ cajero: "ALEXANDRA FLORES", estado: "cerrado", apertura: 2000, esperado: 2100, declarado: 2100, notas: null }],
};

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: async () => ({ data: respuesta, error: null }) }) }));
vi.mock("@/sesion/SesionProvider", () => ({ useSistema: () => ({ sistemaId: "s1", sistema: { id: "s1", nombre: "FUNBIDE" }, roles: ["admin"] }) }));

const { CuadreDia } = await import("./CuadreDia");

describe("Cuadre del día (formato del Excel)", () => {
  it("se monta con datos y muestra cada médico, la farmacia, la comisión y el efectivo neto", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CuadreDia />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("ROSARIO RAMIREZ")).toBeInTheDocument();
    expect(screen.getByText("FARMACIA")).toBeInTheDocument();
    // Comisión 300, desc. 10 % = 30, a pagar 270 (como el Excel).
    expect(screen.getByText(/Comisión/).textContent).toMatch(/300/);
    expect(screen.getByText(/Comisión/).textContent).toMatch(/270/);
    // Total facturado = 600 + 150; el fondo (150) va aparte.
    expect(screen.getByText("Total facturado").nextSibling?.textContent).toMatch(/750/);
    expect(screen.getByText("Fondo interno de las ARS").nextSibling?.textContent).toMatch(/150/);
    // Efectivo 100 − taxi 300 = −200.
    expect(screen.getByText("Debe haber en efectivo").nextSibling?.textContent).toMatch(/200/);
  });
});
