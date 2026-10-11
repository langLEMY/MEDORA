import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecorteFoto } from "./RecorteFoto";

describe("Recorte de la foto de perfil", () => {
  it("cerrado no muestra nada", () => {
    render(<RecorteFoto archivo={null} onCancelar={() => {}} onListo={() => {}} />);
    expect(screen.queryByText("Recortar foto")).toBeNull();
  });

  it("con una imagen abre el recorte con zoom, girar, cancelar y usar foto", () => {
    URL.createObjectURL = vi.fn(() => "blob:foto");
    URL.revokeObjectURL = vi.fn();
    const onCancelar = vi.fn();
    render(<RecorteFoto archivo={new File(["x"], "yo.png", { type: "image/png" })} onCancelar={onCancelar} onListo={() => {}} />);
    expect(screen.getByText("Recortar foto")).toBeInTheDocument();
    expect(screen.getByLabelText("Acercar")).toBeInTheDocument();
    expect(screen.getByText("Girar")).toBeInTheDocument();
    // Hasta que la imagen carga no se puede usar.
    expect(screen.getByText("Usar foto").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onCancelar).toHaveBeenCalled();
  });
});
