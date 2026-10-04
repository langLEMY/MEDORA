import { describe, expect, it } from "vitest";
import { cedula, cedulaVerificada, correoVisible, edad, horaCorta, iniciales, isoDia, moneda, rnc, sugerirUsuario, telefonoRd, USUARIO_RE } from "./utils";

describe("identificación dominicana (espejo de privado.tg_identificacion_rd)", () => {
  it("formatea la cédula con guiones solo si tiene 11 dígitos", () => {
    expect(cedula("00112345678")).toBe("001-1234567-8");
    expect(cedula("001-1234567-8")).toBe("001-1234567-8");
    expect(cedula("0011234567")).toBeNull();
    expect(cedula(null)).toBeNull();
  });
  it("verifica el dígito de la cédula (módulo 10 de la JCE)", () => {
    expect(cedulaVerificada("001-1307529-5")).toBe(true);
    expect(cedulaVerificada("40213753516")).toBe(true);
    expect(cedulaVerificada("001-1307529-4")).toBe(false);
    expect(cedulaVerificada("0011307529")).toBe(false);
  });
  it("acepta RNC de 9 dígitos o cédula de 11, solo dígitos", () => {
    expect(rnc("1-30-12345-6")).toBe("130123456");
    expect(rnc("00112345678")).toBe("00112345678");
    expect(rnc("12345")).toBeNull();
  });
  it("normaliza teléfonos 809/829/849 con o sin +1", () => {
    expect(telefonoRd("+1 (809) 555-1234")).toBe("809-555-1234");
    expect(telefonoRd("8295551234")).toBe("829-555-1234");
    expect(telefonoRd("3055551234")).toBeNull();
  });
});

describe("formatos", () => {
  it("muestra pesos dominicanos con dos decimales", () => {
    expect(moneda(1234.5)).toMatch(/1,234\.50/);
    expect(moneda("950")).toMatch(/950\.00/);
    expect(moneda(null)).toMatch(/0\.00/);
  });
  it("usa horas de 12 h en los ejes", () => {
    expect(horaCorta(0)).toBe("12 a. m.");
    expect(horaCorta(8)).toBe("8 a. m.");
    expect(horaCorta(12)).toBe("12 p. m.");
    expect(horaCorta(15)).toBe("3 p. m.");
  });
  it("da la fecha local en AAAA-MM-DD", () => {
    expect(isoDia(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("calcula la edad sin contar el cumpleaños que no ha llegado", () => {
    const hoy = new Date();
    const cumpleManana = new Date(hoy.getFullYear() - 30, hoy.getMonth(), hoy.getDate() + 1);
    expect(edad(isoDia(cumpleManana))).toBe(29);
    expect(edad(null)).toBeNull();
  });
  it("saca iniciales de nombre y último apellido", () => {
    expect(iniciales("Ana María Pérez")).toBe("AP");
    expect(iniciales("")).toBe("·");
  });
});

describe("usuarios", () => {
  it("sugiere nombre.apellido sin tildes", () => {
    expect(sugerirUsuario("Ana María Pérez")).toBe("ana.perez");
    expect(USUARIO_RE.test(sugerirUsuario("José Núñez"))).toBe(true);
  });
  it("oculta los correos internos de Auth", () => {
    expect(correoVisible("ana@usuarios.medora.invalid")).toBeNull();
    expect(correoVisible("ana@hospital.do")).toBe("ana@hospital.do");
  });
});
