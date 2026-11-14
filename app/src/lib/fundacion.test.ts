import { describe, expect, it } from "vitest";
import { NAVEGACION, puedeVer } from "@/components/layout/navegacion";
import { categoriaPorIngreso, descuentoTarifa, TARIFA_SOCIAL_DEFECTO } from "./fundacion";

describe("tarifa social", () => {
  it("clasifica por ingreso por persona (espejo de registrar_estudio_socioeconomico)", () => {
    expect(categoriaPorIngreso(12000, 4)).toEqual({ perCapita: 3000, categoria: "C" });
    expect(categoriaPorIngreso(8000, 4)?.categoria).toBe("D");
    expect(categoriaPorIngreso(30000, 3)?.categoria).toBe("B");
    expect(categoriaPorIngreso(60000, 2)?.categoria).toBe("A");
    expect(categoriaPorIngreso(10000, 0)).toBeNull();
  });

  it("respeta umbrales propios del hospital", () => {
    const t = { ...TARIFA_SOCIAL_DEFECTO, umbrales: [1000, 2000, 4000] as [number, number, number] };
    expect(categoriaPorIngreso(12000, 4, t)?.categoria).toBe("B");
  });

  it("calcula el descuento sobre lo que paga el paciente, en centavos", () => {
    expect(descuentoTarifa(950, 50)).toBe(475);
    expect(descuentoTarifa(33.33, 50)).toBe(16.67);
    expect(descuentoTarifa(500, 100)).toBe(500);
    expect(descuentoTarifa(-10, 50)).toBe(0);
  });
});

describe("menú según la naturaleza", () => {
  const fundacion = NAVEGACION.find((i) => i.ruta === "/fundacion")!;
  it("Fundación solo aparece en una fundación", () => {
    expect(puedeVer(fundacion, ["admin"], false, null, false, undefined, "fundacion")).toBe(true);
    expect(puedeVer(fundacion, ["admin"], false, null, false, undefined, "privada")).toBe(false);
    expect(puedeVer(fundacion, ["admin"], false, null, false, undefined, undefined)).toBe(false);
  });
  it("un rol sin el módulo no la ve aunque sea fundación", () => {
    expect(puedeVer(fundacion, ["farmacia"], false, null, false, undefined, "fundacion")).toBe(false);
  });
});
