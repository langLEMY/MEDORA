import { describe, expect, it } from "vitest";
import { NAVEGACION, puedeVer } from "@/components/layout/navegacion";

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
