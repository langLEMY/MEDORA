// Primer acceso con una contraseña heredada de FUNBIDE (ver migración
// credenciales_legado). Verifica el hash de ASP.NET Core Identity v3
// (PBKDF2-HMAC, normalmente SHA-512 y 100 000 iteraciones); si coincide, registra
// esa misma contraseña en Supabase Auth y borra el hash viejo. El cliente vuelve
// a iniciar sesión normalmente con la misma contraseña.
//   { usuario, password } → { ok, email } | 401
// verify_jwt = false: se llama antes de tener sesión. Responde igual si el
// usuario no existe, no tiene credencial heredada o la contraseña no coincide.
import { clienteServicio, cors, error, ipCliente, json, limitar } from "../_shared/comun.ts";
import { verificarIdentityV3 } from "../_shared/legado.ts";

const RECHAZO = "Usuario o contraseña incorrectos.";

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

  // Límite de intentos: corta fuerza bruta y el abuso de CPU del PBKDF2.
  const ip = ipCliente(req);
  if (!(await limitar(admin, `legado:ip:${ip}`, 30, 300)) || !(await limitar(admin, `legado:u:${usuario}`, 10, 600))) {
    return error("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 429);
  }

  const { data } = await admin.rpc("credencial_legado", { p_usuario: usuario });
  const fila = (data as { usuario_id: string; email: string; hash: string }[] | null)?.[0];
  if (!fila || !(await verificarIdentityV3(fila.hash, password))) return error(RECHAZO, 401);

  const { error: e } = await admin.auth.admin.updateUserById(fila.usuario_id, { password });
  if (e) return error("No se pudo completar el acceso. Intenta de nuevo.", 500);
  await admin.rpc("consumir_credencial_legado", { p_usuario_id: fila.usuario_id });

  return json({ ok: true, email: fila.email });
});
