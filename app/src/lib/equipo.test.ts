import { describe, expect, it } from "vitest";
import { cuentaRecordada, marcarSalidaInvoluntaria, recordarCuenta, saludo, seguridadClave, tomarAvisoSalida } from "./equipo";

describe("login", () => {
  it("saluda según la hora", () => {
    expect(saludo(new Date(2026, 9, 5, 8))).toBe("Buenos días");
    expect(saludo(new Date(2026, 9, 5, 15))).toBe("Buenas tardes");
    expect(saludo(new Date(2026, 9, 5, 21))).toBe("Buenas noches");
  });

  it("recuerda la cuenta sin contraseña y el aviso de salida una sola vez", () => {
    recordarCuenta({ usuario: "zalbornett", nombre: "Zaida Albornett", foto: null });
    expect(cuentaRecordada()?.usuario).toBe("zalbornett");
    expect(JSON.stringify(cuentaRecordada())).not.toMatch(/password|clave/i);
    recordarCuenta(null);
    expect(cuentaRecordada()).toBeNull();

    marcarSalidaInvoluntaria();
    expect(tomarAvisoSalida()).toBe(true);
    expect(tomarAvisoSalida()).toBe(false);
  });

  it("mide la seguridad de la contraseña", () => {
    expect(seguridadClave("")).toBe(0);
    expect(seguridadClave("12345678")).toBe(1); // solo números (como la temporal)
    expect(seguridadClave("contraseña2026")).toBe(1); // palabra común
    expect(seguridadClave("zalbornett2026!", "zalbornett")).toBe(1); // contiene el usuario
    expect(seguridadClave("abcdefghij")).toBe(1);
    expect(seguridadClave("Abcdefghij7")).toBe(2);
    expect(seguridadClave("Abcdefghij7!")).toBe(3);
    expect(seguridadClave("Mi perro come mango 7!")).toBe(4);
  });
});
