// Recuperar la contraseña con un código de 6 dígitos (Supabase Auth, plantilla
// "Reset password" con {{ .Token }}). Todo el flujo vive en el servidor para no
// revelar el correo de la cuenta al cliente (evita enumerar usuarios). Limitado
// por intentos. verify_jwt = false: se llama sin sesión.
//   { accion: "solicitar", usuario }                      → { estado } (+ correo enmascarado)
//   { accion: "confirmar", usuario, codigo, password }    → { access_token, refresh_token }
import { clienteAnon, clienteServicio, cors, enmascararCorreo, error, ipCliente, json, limitar } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  let c: Record<string, unknown>;
  try {
    c = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }
  const usuario = String(c.usuario ?? "").trim().toLowerCase();
  if (usuario.length < 2) return error("Escribe tu usuario.");

  const admin = clienteServicio();
  const ip = ipCliente(req);

  const { data: email } = await admin.rpc("correo_de_acceso", { p_usuario: usuario });
  const correo = String(email ?? "");
  const tieneCorreoReal = correo && !correo.endsWith(".invalid");

  if (c.accion === "solicitar") {
    if (!(await limitar(admin, `rec:ip:${ip}`, 15, 3600)) || !(await limitar(admin, `rec:u:${usuario}`, 4, 3600))) {
      return error("Pediste demasiados códigos. Espera un rato e inténtalo de nuevo.", 429);
    }
    // Sin correo real (o usuario inexistente): mismo mensaje, no se distingue.
    if (!tieneCorreoReal) return json({ estado: "sin_correo" });
    const anon = clienteAnon();
    await anon.auth.resetPasswordForEmail(correo); // su resultado no se revela
    return json({ estado: "enviado", correo: enmascararCorreo(correo) });
  }

  if (c.accion === "confirmar") {
    const codigo = String(c.codigo ?? "").trim();
    const password = String(c.password ?? "");
    if (!/^\d{6}$/.test(codigo)) return error("El código tiene 6 números.");
    if (password.length < 10 || password.length > 200) return error("La nueva contraseña necesita al menos 10 caracteres.");
    if (!(await limitar(admin, `recc:ip:${ip}`, 20, 3600)) || !(await limitar(admin, `recc:u:${usuario}`, 8, 3600))) {
      return error("Demasiados intentos. Espera un rato e inténtalo de nuevo.", 429);
    }
    if (!tieneCorreoReal) return error("El código no es válido o ya venció. Pide uno nuevo.", 400);

    const anon = clienteAnon();
    const { data: ver, error: e } = await anon.auth.verifyOtp({ email: correo, token: codigo, type: "recovery" });
    if (e || !ver.session) return error("El código no es válido o ya venció. Pide uno nuevo.", 400);
    const { error: e2 } = await anon.auth.updateUser({ password });
    if (e2) return error("No se pudo cambiar la contraseña. Inténtalo de nuevo.", 500);
    await anon.rpc("marcar_password_actualizada");
    return json({ access_token: ver.session.access_token, refresh_token: ver.session.refresh_token });
  }

  return error("Acción desconocida.");
});
