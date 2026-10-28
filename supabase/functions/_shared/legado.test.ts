import { assert, assertFalse } from "jsr:@std/assert@1";
import { verificarIdentityV3 } from "./legado.ts";

/** Arma un hash de ASP.NET Core Identity v3 (0x01 | prf | iteraciones | largo sal | sal | subclave). */
async function hashV3(password: string, prf = 2, hash = "SHA-512", iteraciones = 10_000): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const sub = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash, salt: sal, iterations: iteraciones }, clave, 256));
  const b = new Uint8Array(13 + sal.length + sub.length);
  const v = new DataView(b.buffer);
  b[0] = 0x01;
  v.setUint32(1, prf);
  v.setUint32(5, iteraciones);
  v.setUint32(9, sal.length);
  b.set(sal, 13);
  b.set(sub, 13 + sal.length);
  return btoa(String.fromCharCode(...b));
}

Deno.test("verificarIdentityV3 acepta la contraseña correcta (SHA-512 y SHA-256)", async () => {
  assert(await verificarIdentityV3(await hashV3("Funbide#2024"), "Funbide#2024"));
  assert(await verificarIdentityV3(await hashV3("ñandú", 1, "SHA-256"), "ñandú"));
});

Deno.test("verificarIdentityV3 rechaza otra contraseña y hashes raros", async () => {
  const h = await hashV3("Funbide#2024");
  assertFalse(await verificarIdentityV3(h, "funbide#2024"));
  assertFalse(await verificarIdentityV3(btoa("\x00corto"), "x")); // versión 2 / truncado
  assertFalse(await verificarIdentityV3(await hashV3("x", 9), "x")); // PRF desconocido
  assertFalse(await verificarIdentityV3(await hashV3("x", 2, "SHA-512", 500), "x")); // pocas iteraciones
});
