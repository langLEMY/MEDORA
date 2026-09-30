import { describe, expect, it, vi } from "vitest";

// El cliente real necesita la URL del proyecto; aquí solo se prueban los mensajes.
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
const { mensajeError } = await import("./supabase");

describe("mensajeError: errores de Postgres en español legible", () => {
  it("traduce los códigos conocidos", () => {
    expect(mensajeError({ code: "23505", message: "duplicate key" })).toBe("Ya existe un registro con esos datos.");
    expect(mensajeError({ code: "23P01", message: "exclusion" })).toMatch(/ya tiene una cita/);
    expect(mensajeError({ code: "42501", message: "new row violates row-level security policy" })).toBe("No tienes permiso para realizar esta acción.");
  });
  it("respeta el mensaje de negocio de las RPC (P0001)", () => {
    expect(mensajeError({ code: "P0001", message: "El descuento supera el monto a pagar." })).toBe("El descuento supera el monto a pagar.");
  });
  it("explica la falta de conexión", () => {
    expect(mensajeError(new TypeError("Failed to fetch"))).toMatch(/Sin conexión/);
  });
  it("nunca deja al usuario sin mensaje", () => {
    expect(mensajeError(null)).toBe("Ocurrió un error inesperado.");
    expect(mensajeError({})).toBe("Ocurrió un error inesperado.");
  });
});
