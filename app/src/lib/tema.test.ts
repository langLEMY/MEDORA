import { afterEach, describe, expect, it } from "vitest";
import { aplicarAcento, aplicarColorMarca } from "./tema";

const marca = () => document.documentElement.style.getPropertyValue("--marca");

afterEach(() => {
  // Deja el tema en limpio entre pruebas.
  aplicarAcento(null);
  aplicarColorMarca(null);
});

describe("color de marca y acento", () => {
  it("usa el verde de MEDORA cuando no hay color", () => {
    aplicarColorMarca(null);
    expect(marca()).toBe("#0f766e");
  });

  it("aplica el color del hospital", () => {
    aplicarColorMarca("#123456");
    expect(marca()).toBe("#123456");
  });

  it("el acento del usuario pisa el color del hospital", () => {
    aplicarColorMarca("#123456");
    aplicarAcento("#ABCDEF");
    expect(marca()).toBe("#ABCDEF");
  });

  it("quitar el acento vuelve al color del hospital", () => {
    aplicarColorMarca("#123456");
    aplicarAcento("#ABCDEF");
    aplicarAcento(null);
    expect(marca()).toBe("#123456");
  });

  it("ignora un acento con formato inválido", () => {
    aplicarColorMarca("#123456");
    aplicarAcento("rojo");
    expect(marca()).toBe("#123456");
  });
});
