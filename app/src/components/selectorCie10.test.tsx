import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "motion";
import { codigoCie10, formatoCie10 } from "@/lib/cie10";

MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

const catalogo = [
  { codigo: "M54.5", descripcion: "Lumbago no especificado", capitulo: "XIII" },
  { codigo: "M54.4", descripcion: "Lumbago con ciática", capitulo: "XIII" },
];
const rpc = vi.fn(async () => ({ data: catalogo, error: null }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

let sesion: Record<string, unknown> = {};
vi.mock("@/sesion/SesionProvider", () => ({ useSesion: () => sesion }));

const { SelectorCie10 } = await import("./SelectorCie10");
const { FranjaVerComo, ModalVerComo } = await import("./VerComo");

function Envoltura({ inicial = "", onCambio }: { inicial?: string; onCambio?: (v: string) => void }) {
  const [v, setV] = useState(inicial);
  return (
    <SelectorCie10
      valor={v}
      onChange={(x) => {
        setV(x);
        onCambio?.(x);
      }}
    />
  );
}
const montar = (n: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{n}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("CIE-10", () => {
  it("formato y código", () => {
    expect(formatoCie10({ codigo: "I10", descripcion: "Hipertensión esencial (primaria)" })).toBe("I10 · Hipertensión esencial (primaria)");
    expect(codigoCie10("M54.5 · Lumbago no especificado")).toBe("M54.5");
    expect(codigoCie10("U07.1 · COVID-19, virus identificado")).toBe("U07.1");
    expect(codigoCie10("dolor de espalda")).toBeNull();
    expect(codigoCie10("")).toBeNull();
  });

  it("busca como lo dice la gente y guarda «CÓDIGO · descripción»", async () => {
    const cambio = vi.fn();
    montar(<Envoltura onCambio={cambio} />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "dolor lumbar" } });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("buscar_cie10", { p_texto: "dolor lumbar", p_limite: 15 }));
    fireEvent.click(await screen.findByText("Lumbago no especificado"));
    expect(cambio).toHaveBeenCalledWith("M54.5 · Lumbago no especificado");
    // Queda como ficha con su código.
    expect(screen.getByText("M54.5")).toBeInTheDocument();
  });

  it("con el teclado: flecha abajo y Enter eligen el segundo", async () => {
    const cambio = vi.fn();
    montar(<Envoltura onCambio={cambio} />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "lumbago" } });
    await screen.findByText("Lumbago con ciática");
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(cambio).toHaveBeenCalledWith("M54.4 · Lumbago con ciática");
  });

  it("lo que se escribe sin elegir no se guarda", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const cambio = vi.fn();
    montar(<Envoltura onCambio={cambio} />);
    const campo = screen.getByRole("combobox");
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "me duele todo" } });
    fireEvent.blur(campo);
    act(() => vi.advanceTimersByTime(300));
    vi.useRealTimers();
    expect(cambio).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("un diagnóstico viejo sin código pide elegir uno", () => {
    montar(<Envoltura inicial="Dolor de espalda" />);
    expect(screen.getByText(/sin código: elige uno/)).toBeInTheDocument();
  });
});

describe("Ver como", () => {
  it("solo ofrece los roles que la persona tiene en el sistema", () => {
    const cambiarVerComo = vi.fn();
    sesion = { rolesReales: ["admin", "caja", "medico", "quiosco"], verComo: null, cambiarVerComo, sistema: { nombre: "FUNBIDE · Pruebas" } };
    montar(<ModalVerComo abierto onCerrar={() => {}} />);
    expect(screen.getByRole("button", { name: /^Caja/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Médico/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Enfermería/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quiosco/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Caja/ }));
    expect(cambiarVerComo).toHaveBeenCalledWith(["caja"]);
  });

  it("con un solo rol explica que se prueba en el sistema de pruebas", () => {
    sesion = { rolesReales: ["admin"], verComo: null, cambiarVerComo: vi.fn(), sistema: { nombre: "FUNBIDE" } };
    montar(<ModalVerComo abierto onCerrar={() => {}} />);
    expect(screen.getByText(/entra al sistema de pruebas/)).toBeInTheDocument();
  });

  it("la franja avisa y vuelve a la vista propia", () => {
    const cambiarVerComo = vi.fn();
    sesion = { verComo: ["caja"], cambiarVerComo };
    montar(<FranjaVerComo />);
    expect(screen.getByRole("status")).toHaveTextContent(/Viendo MEDORA como/);
    fireEvent.click(screen.getByRole("button", { name: /Volver a mi vista/ }));
    expect(cambiarVerComo).toHaveBeenCalledWith(null);
  });
});
