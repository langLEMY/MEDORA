// Primer acceso con una contraseña heredada de FUNBIDE (ver migración
// credenciales_legado). Verifica el hash de ASP.NET Core Identity v3
// (PBKDF2-HMAC, normalmente SHA-512 y 100 000 iteraciones); si coincide, registra
// esa misma contraseña en Supabase Auth y borra el hash viejo. El cliente vuelve
// a iniciar sesión normalmente con la misma contraseña.
//   { usuario, password } → { ok, email } | 401
// verify_jwt = false: se llama antes de tener sesión. Responde igual si el
// usuario no existe, no tiene credencial heredada o la contraseña no coincide.
import { clienteServicio, cors, error, json } from "../_shared/comun.ts";

const PRF: Record<number, string> = { 0: "SHA-1", 1: "SHA-256", 2: "SHA-512" };
const RECHAZO = "Usuario o contraseña incorrectos.";

async function verificarIdentityV3(hashB64: string, password: string): Promise<boolean> {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }
  const usuario = String(cuerpo.usuario ?? "").trim().toLowerCase();
  const password = String(cuerpo.password ?? "");
  if (!usuario || !password || password.length > 200) return error(RECHAZO, 401);

  const admin = clienteServicio();
  const { data } = await admin.rpc("credencial_legado", { p_usuario: usuario });
  const fila = (data as { usuario_id: string; email: string; hash: string }[] | null)?.[0];
  if (!fila || !(await verificarIdentityV3(fila.hash, password))) return error(RECHAZO, 401);

  const { error: e } = await admin.auth.admin.updateUserById(fila.usuario_id, { password });
  if (e) return error("No se pudo completar el acceso. Intenta de nuevo.", 500);
  await admin.rpc("consumir_credencial_legado", { p_usuario_id: fila.usuario_id });

  return json({ ok: true, email: fila.email });
});
