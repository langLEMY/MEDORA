import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
const { textoPeriodo } = await import("./Finanzas");

describe("textoPeriodo (ventana de detalle de Finanzas)", () => {
  it("con la ventana cerrada no formatea fechas (la 1.6.0 tumbaba Finanzas con «Invalid time value»)", () => {
    expect(() => textoPeriodo(null)).not.toThrow();
    expect(textoPeriodo(null)).toBe("");
  });

  it("los saldos no dependen de fechas", () => {
    expect(textoPeriodo({ vista: "saldo", hasta: "2026-10-09" })).toBe("Todo lo registrado hasta hoy");
  });

  it("un solo día muestra el día; un rango, desde y hasta", () => {
    expect(textoPeriodo({ vista: "ingresos", desde: "2026-10-05", hasta: "2026-10-05" })).toMatch(/5/);
    const rango = textoPeriodo({ vista: "gastos", desde: "2026-10-01", hasta: "2026-10-09" });
    expect(rango.startsWith("Del ")).toBe(true);
    expect(rango).not.toMatch(/Invalid/);
  });
});
