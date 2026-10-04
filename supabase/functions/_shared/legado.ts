// Verificación de contraseñas heredadas de FUNBIDE (ASP.NET Core Identity v3:
// PBKDF2-HMAC, normalmente SHA-512 y 100 000 iteraciones). Compartido entre la
// Edge Function "acceso" (camino nuevo) y "acceso-legado" (compatibilidad).
const PRF: Record<number, string> = { 0: "SHA-1", 1: "SHA-256", 2: "SHA-512" };

export async function verificarIdentityV3(hashB64: string, password: string): Promise<boolean> {
  const b = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));
  if (b[0] !== 0x01 || b.length < 13) return false;
  const v = new DataView(b.buffer);
  const prf = PRF[v.getUint32(1)];
  const iteraciones = v.getUint32(5);
  const largoSal = v.getUint32(9);
  if (!prf || iteraciones < 1000 || iteraciones > 1_000_000) return false;
  const sal = b.slice(13, 13 + largoSal);
  const esperado = b.slice(13 + largoSal);
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: prf, salt: sal, iterations: iteraciones }, clave, esperado.length * 8));
  // Comparación en tiempo constante.
  let dif = bits.length ^ esperado.length;
  for (let i = 0; i < esperado.length; i++) dif |= bits[i] ^ esperado[i];
  return dif === 0;
}
