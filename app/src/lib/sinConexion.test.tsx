import { onlineManager, type Query } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FranjaSinConexion } from "@/components/FranjaSinConexion";
import { guardarEnEquipo } from "./sinConexion";

const consulta = (clave: string, status: "success" | "error" = "success") => ({ queryKey: [clave, "s1"], state: { status } }) as unknown as Query;

describe("qué se guarda en el equipo para trabajar sin conexión", () => {
  it("guarda lo operativo del día", () => {
    for (const k of ["citas", "llamados", "personal", "servicios", "sedes", "perfil", "mis-sistemas"]) expect(guardarEnEquipo(consulta(k))).toBe(true);
  });
  it("nunca guarda historia clínica, pacientes ni finanzas", () => {
    for (const k of ["historial", "paciente", "pacientes", "resumen-financiero", "donaciones", "cobros-paciente", "nomina"]) expect(guardarEnEquipo(consulta(k))).toBe(false);
  });
  it("no guarda consultas que fallaron", () => {
    expect(guardarEnEquipo(consulta("citas", "error"))).toBe(false);
  });
});

describe("aviso sin conexión", () => {
  afterEach(() => act(() => onlineManager.setOnline(true)));
  it("aparece al perder la conexión", () => {
    render(<FranjaSinConexion />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent(/Sin conexión/);
  });
});
