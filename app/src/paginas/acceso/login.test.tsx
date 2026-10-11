import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {}, rpc: async () => ({}) }) }));
const { Login } = await import("./Login");

describe("Login rediseñado", () => {
  it("mantiene todas las opciones: usuario, contraseña con ojo, olvidé, crear cuenta y tema", () => {
    render(<Login />);
    expect(screen.getByText("Bienvenido de nuevo")).toBeInTheDocument();
    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Mostrar contraseña")).toBeInTheDocument();
    expect(screen.getByText("¿Olvidaste tu contraseña?")).toBeInTheDocument();
    expect(screen.getByText("Crear cuenta")).toBeInTheDocument();
    expect(screen.getByText(/con código de invitación/)).toBeInTheDocument();
    expect(screen.getByText("Iniciar sesión")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    // Solo la marca MEDORA: nunca el nombre de un hospital.
    expect(screen.queryByText(/FUNBIDE/i)).toBeNull();
  });
});
