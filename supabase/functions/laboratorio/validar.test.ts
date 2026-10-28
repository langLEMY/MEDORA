import { assertEquals } from "jsr:@std/assert@1";
import { resultado } from "./validar.ts";

Deno.test("resultado: conserva los campos conocidos y el valor numérico", () => {
  assertEquals(resultado({ prueba: " Glicemia ", valor: 98, unidad: "mg/dL", referencia: "70-110", bandera: "normal", extra: { x: 1 } }), {
    prueba: "Glicemia",
    valor: 98,
    unidad: "mg/dL",
    referencia: "70-110",
    bandera: "normal",
  });
});

Deno.test("resultado: recorta textos largos", () => {
  assertEquals(resultado({ prueba: "x".repeat(500) })?.prueba.length, 150);
});

Deno.test("resultado: rechaza lo que no sirve", () => {
  assertEquals(resultado(null), null);
  assertEquals(resultado("Glicemia"), null);
  assertEquals(resultado([{ prueba: "x" }]), null);
  assertEquals(resultado({ valor: "98" }), null); // sin prueba
  assertEquals(resultado({ prueba: "x", valor: { anidado: true } }), null);
  assertEquals(resultado({ prueba: "x", valor: Infinity })?.valor, "Infinity");
});
