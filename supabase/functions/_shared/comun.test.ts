// deno test supabase/functions
import { assert, assertEquals } from "jsr:@std/assert@1";
import { aalDeToken, ipCliente, passwordTemporal, pinTemporal } from "./comun.ts";

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (carga: Record<string, unknown>) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(carga))}.firma`;

Deno.test("aalDeToken lee base64url (- y _, sin relleno)", () => {
  // "~" y "?" en esas posiciones dan 6 bits 111110/111111: en base64url salen como - y _.
  const t = token({ aal: "aal2", n: "~~~???" });
  assert(/[-_]/.test(t.split(".")[1]), "la carga de prueba debe traer - o _");
  assertEquals(aalDeToken(t), "aal2");
});

Deno.test("aalDeToken: sin aal o token roto → aal1", () => {
  assertEquals(aalDeToken(token({ sub: "x" })), "aal1");
  assertEquals(aalDeToken("no-es-un-jwt"), "aal1");
});

Deno.test("ipCliente prefiere la cabecera del proxy a x-forwarded-for", () => {
  const req = (h: Record<string, string>) => new Request("https://x", { headers: h });
  assertEquals(ipCliente(req({ "x-forwarded-for": "6.6.6.6, 1.2.3.4", "cf-connecting-ip": "1.2.3.4" })), "1.2.3.4");
  assertEquals(ipCliente(req({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "5.5.5.5" })), "5.5.5.5");
  assertEquals(ipCliente(req({ "x-forwarded-for": " 9.9.9.9 , 1.1.1.1" })), "9.9.9.9");
  assertEquals(ipCliente(req({})), "0.0.0.0");
});

Deno.test("passwordTemporal: largo pedido, solo el alfabeto legible y sin sesgo", () => {
  const conteo = new Map<string, number>();
  for (let i = 0; i < 2000; i++) {
    const p = passwordTemporal();
    assertEquals(p.length, 14);
    assert(/^[A-HJ-NP-Za-km-np-z2-9]+$/.test(p), p);
    for (const ch of p) conteo.set(ch, (conteo.get(ch) ?? 0) + 1);
  }
  // Con sesgo de módulo (256 % 56 = 32) las primeras 32 letras del alfabeto salían 1,25× más que las otras 24.
  const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const media = (letras: string) => [...letras].reduce((t, ch) => t + (conteo.get(ch) ?? 0), 0) / letras.length;
  assertEquals(conteo.size, 56);
  const razon = media(ALFABETO.slice(0, 32)) / media(ALFABETO.slice(32));
  assert(razon > 0.92 && razon < 1.08, `reparto desigual: ${razon.toFixed(3)}`);
});

Deno.test("pinTemporal: 8 dígitos", () => {
  for (let i = 0; i < 200; i++) assert(/^\d{8}$/.test(pinTemporal()));
});
