// Inicio de sesión del lado del servidor. Resuelve usuario→correo aquí (nunca se
// devuelve el correo al cliente: evita enumerar usuarios y cosechar correos) e
// inicia sesión en nombre del usuario, devolviendo solo los tokens de la sesión.
// Incluye el camino heredado de FUNBIDE y un limitador de intentos (fuerza bruta
// y abuso de CPU del PBKDF2). verify_jwt = false: se llama sin sesión.
//   { usuario, password } → { access_token, refresh_token } | 401
import { clienteAnon, clienteServicio, cors, error, ipCliente, json, limitar } from "../_shared/comun.ts";
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

  // Límite de intentos: por IP y por usuario. Si se pasa, se corta en seco.
  const ip = ipCliente(req);
  const okIp = await limitar(admin, `acceso:ip:${ip}`, 30, 300); // 30 / 5 min por IP
  const okUsuario = await limitar(admin, `acceso:u:${usuario}`, 10, 600); // 10 / 10 min por usuario
  if (!okIp || !okUsuario) return error("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 429);

  // usuario → correo de Auth (acepta también un correo escrito directamente).
  const { data: email } = await admin.rpc("correo_de_acceso", { p_usuario: usuario });
  if (!email) return error(RECHAZO, 401);

  const anon = clienteAnon();
  let intento = await anon.auth.signInWithPassword({ email, password });

  // Contraseña heredada (formato que Supabase no lee): verificar, migrar y reintentar.
  if (intento.error && intento.error.code === "invalid_credentials") {
    const { data } = await admin.rpc("credencial_legado", { p_usuario: usuario });
    const fila = (data as { usuario_id: string; email: string; hash: string }[] | null)?.[0];
    if (fila && (await verificarIdentityV3(fila.hash, password))) {
      const { error: e } = await admin.auth.admin.updateUserById(fila.usuario_id, { password });
      if (!e) {
        await admin.rpc("consumir_credencial_legado", { p_usuario_id: fila.usuario_id });
        intento = await anon.auth.signInWithPassword({ email: fila.email, password });
      }
    }
  }

  if (intento.error || !intento.data.session) return error(RECHAZO, 401);
  return json({
    access_token: intento.data.session.access_token,
    refresh_token: intento.data.session.refresh_token,
  });
});
