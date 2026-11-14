import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarCheck, ChartColumn, Clock } from "lucide-react";
import { MotionGlobalConfig } from "motion";

// En pruebas las animaciones (salidas incluidas) terminan al instante.
MotionGlobalConfig.skipAnimations = true;

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({}) }) }) }) }));
vi.mock("@/sesion/SesionProvider", () => ({ useSesion: () => ({ perfil: null }) }));

const { TableroWidgets, SOSTENER_MS } = await import("./TableroWidgets");
const { cambiarPreferencias } = await import("@/lib/preferencias");

const widgets = [
  { id: "a", titulo: "Indicadores", descripcion: "Citas y cobrado", icono: ChartColumn, nodo: <a href="#/caja">Tarjeta A</a> },
  { id: "b", titulo: "Últimos 14 días", descripcion: "Gráfica de citas", icono: CalendarCheck, nodo: <div>Tarjeta B</div> },
  { id: "c", titulo: "Turnos en vivo", descripcion: "Quién sigue", icono: Clock, nodo: <div>Tarjeta C</div> },
];

const montar = () => render(<TableroWidgets vista="operacion" widgets={widgets} />);
const presionar = (texto: string, x = 10, y = 10) => fireEvent.pointerDown(screen.getByText(texto), { button: 0, clientX: x, clientY: y, pointerId: 1 });

beforeEach(() => {
  cambiarPreferencias({ widgets: {} });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("widgets estilo iOS", () => {
  it("entra a editar solo tras mantener presionado 2 segundos", () => {
    montar();
    expect(screen.getByText("Mantén presionado un widget para editar")).toBeInTheDocument();
    presionar("Tarjeta B");
    act(() => vi.advanceTimersByTime(SOSTENER_MS - 300));
    expect(screen.queryByRole("button", { name: /Listo/ })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("button", { name: /Listo/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Quitar / })).toHaveLength(3);
  });

  it("un clic corto o un movimiento no entran a editar", () => {
    montar();
    presionar("Tarjeta B");
    fireEvent.pointerUp(screen.getByText("Tarjeta B"));
    presionar("Tarjeta C", 10, 10);
    fireEvent.pointerMove(screen.getByText("Tarjeta C"), { clientX: 10, clientY: 40, pointerId: 1 });
    act(() => vi.advanceTimersByTime(SOSTENER_MS + 100));
    expect(screen.queryByRole("button", { name: /Listo/ })).not.toBeInTheDocument();
  });

  it("en edición los enlaces del widget no navegan", () => {
    montar();
    presionar("Tarjeta A");
    act(() => vi.advanceTimersByTime(SOSTENER_MS));
    const enlace = screen.getByText("Tarjeta A");
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true });
    enlace.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });

  it("(−) quita el widget y la galería lo busca y lo vuelve a añadir", async () => {
    montar();
    presionar("Tarjeta A");
    act(() => vi.advanceTimersByTime(SOSTENER_MS));
    fireEvent.click(screen.getByRole("button", { name: "Quitar Últimos 14 días" }));
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByText("Tarjeta B")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Añadir widget/ }));
    const buscar = await screen.findByLabelText("Buscar widgets");
    fireEvent.change(buscar, { target: { value: "grafica" } }); // sin tilde: igual encuentra «Gráfica de citas»
    expect(screen.getByText("Últimos 14 días")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Turnos en vivo")).not.toBeInTheDocument());
    fireEvent.change(buscar, { target: { value: "zzz" } });
    expect(screen.getByText(/Ningún widget coincide/)).toBeInTheDocument();
    fireEvent.change(buscar, { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: /Últimos 14 días/ }));
    await waitFor(() => expect(screen.getByText("Tarjeta B")).toBeInTheDocument());
  });

  it("Escape termina la edición", async () => {
    montar();
    presionar("Tarjeta C");
    act(() => vi.advanceTimersByTime(SOSTENER_MS));
    vi.useRealTimers();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Listo/ })).not.toBeInTheDocument());
    expect(screen.queryAllByRole("button", { name: /^Quitar / })).toHaveLength(0);
  });
});
