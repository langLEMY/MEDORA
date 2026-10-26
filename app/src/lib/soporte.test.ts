import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {}, datos: (r: { data: unknown }) => r.data }));
vi.mock("./monitoreo", () => ({ erroresRecientes: () => [] }));

const { enlaceA, extraerEnlaces, limpiarTextoSoporte, noLeida } = await import("./soporte");
type Solicitud = Parameters<typeof noLeida>[0];

describe("datos sensibles en los mensajes de soporte", () => {
  // Mismos casos que privado.limpiar_texto_soporte: lo que se ve al enviar es lo que se guarda.
  it("tapa cédulas, teléfonos, tokens y números largos", () => {
    expect(limpiarTextoSoporte("La paciente 001-1234567-8 no aparece")).toBe("La paciente [cédula] no aparece");
    expect(limpiarTextoSoporte("cédula 00112345678")).toBe("cédula [cédula]");
    expect(limpiarTextoSoporte("llamar al 809-555-1234 o al +1 829 555 1234")).toBe("llamar al [teléfono] o al [teléfono]");
    expect(limpiarTextoSoporte("RNC 130123456")).toBe("RNC [número]");
    expect(limpiarTextoSoporte("token eyJhbGciOi.eyJzdWIiOi.firma_x-1")).toBe("token [token]");
  });

  it("deja intacto lo demás", () => {
    expect(limpiarTextoSoporte("  El recibo REC-0000829 de RD$750 no imprime  ")).toBe("El recibo REC-0000829 de RD$750 no imprime");
    expect(limpiarTextoSoporte("mi correo es ana@funbide.org")).toBe("mi correo es ana@funbide.org");
  });
});

describe("conversaciones con algo nuevo", () => {
  const base = {
    autor_id: "ana",
    estado: "abierta",
    ultimo_mensaje_en: "2026-10-26T15:00:00Z",
    ultimo_de_soporte: false,
    vista_autor_en: "2026-10-26T15:00:00Z",
    vista_soporte_en: null,
    no_leida_soporte: false,
  } as unknown as Solicitud;

  it("a soporte le marca lo que escribió el hospital y no ha visto", () => {
    expect(noLeida(base, "soporte", true)).toBe(true);
    expect(noLeida({ ...base, vista_soporte_en: "2026-10-26T15:01:00Z" }, "soporte", true)).toBe(false);
    expect(noLeida({ ...base, ultimo_de_soporte: true }, "soporte", true)).toBe(false);
    expect(noLeida({ ...base, estado: "resuelta" }, "soporte", true)).toBe(false);
  });

  it("«marcar como no leída» gana aunque soporte haya escrito lo último", () => {
    expect(noLeida({ ...base, ultimo_de_soporte: true, no_leida_soporte: true }, "soporte", true)).toBe(true);
    // Solo afecta a la bandeja de soporte.
    expect(noLeida({ ...base, no_leida_soporte: true }, "ana", false)).toBe(false);
  });

  it("a quien la abrió le marca las respuestas de soporte", () => {
    const respondida = { ...base, ultimo_de_soporte: true, ultimo_mensaje_en: "2026-10-26T15:05:00Z" };
    expect(noLeida(respondida, "ana", false)).toBe(true);
    expect(noLeida({ ...respondida, vista_autor_en: "2026-10-26T15:06:00Z" }, "ana", false)).toBe(false);
    // Un admin que ve la solicitud de otra persona no tiene nada pendiente.
    expect(noLeida(respondida, "admin", false)).toBe(false);
  });
});

describe("enlaces a pantallas de MEDORA", () => {
  it("separa los enlaces del texto y arma la ruta interna", () => {
    expect(extraerEnlaces("Entra aquí: medora://caja y revisa")).toEqual({ texto: "Entra aquí: y revisa", rutas: ["/caja"] });
    expect(extraerEnlaces("medora://ayuda?guia=cuadre")).toEqual({ texto: "", rutas: ["/ayuda?guia=cuadre"] });
    expect(extraerEnlaces("dos veces medora://caja medora://caja").rutas).toEqual(["/caja"]);
  });

  it("enlaceA es el inverso de extraerEnlaces", () => {
    for (const ruta of ["/", "/finanzas?vista=reportes", "/ayuda?guia=dos-pasos"]) expect(extraerEnlaces(enlaceA(ruta)).rutas).toEqual([ruta]);
  });

  it("no deja pasar nada que no sea una ruta interna", () => {
    expect(extraerEnlaces("medora://caja<script>").rutas).toEqual(["/caja"]);
    expect(extraerEnlaces("https://otro.sitio/caja").rutas).toEqual([]);
  });
});
