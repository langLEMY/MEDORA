// Alta de cuenta con un código de invitación generado por la superadministración.
//   { accion: "verificar", codigo }                              → a qué da acceso
//   { accion: "registrar", codigo, nombre_completo, email, password }
// verify_jwt = false: quien se registra todavía no tiene cuenta. El código (60 bits
// aleatorios, con vencimiento y usos máximos) es la autorización.
import { clienteServicio, cors, EMAIL_RE, error, json } from "../_shared/comun.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  let cuerpo: Record<string, string>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }

  const admin = clienteServicio();
  const codigo = String(cuerpo.codigo ?? "").trim().toUpperCase();

  const { data: info } = await admin.rpc("consultar_codigo_invitacion", { p_codigo: codigo });
  if (!info) return error("El código no es válido, venció o ya fue usado.", 404);

  if (cuerpo.accion === "verificar") return json(info);
  if (cuerpo.accion !== "registrar") return error("Acción desconocida.");

  const nombre = String(cuerpo.nombre_completo ?? "").trim();
  const email = String(cuerpo.email ?? "").trim().toLowerCase();
  const password = String(cuerpo.password ?? "");
  if (nombre.length < 3) return error("Escribe tu nombre completo.");
  if (!EMAIL_RE.test(email)) return error("Correo electrónico inválido.");
  if (password.length < 10) return error("La contraseña debe tener al menos 10 caracteres.");

  const { data: existente } = await admin.from("perfiles").select("id").eq("email", email).maybeSingle();
  if (existente) return error("Ya existe una cuenta con ese correo. Inicia sesión o pide que te agreguen desde Personal.", 409);

  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
  });
  if (errCrear || !creado.user) return error(errCrear?.message ?? "No se pudo crear la cuenta.");

  // Canje atómico (bloquea la fila del código). Si falla —p. ej. otro lo usó un
  // instante antes— se deshace la cuenta recién creada.
  const { error: errCanje } = await admin.rpc("canjear_codigo_invitacion", { p_codigo: codigo, p_usuario: creado.user.id });
  if (errCanje) {
    await admin.auth.admin.deleteUser(creado.user.id);
    return error(errCanje.message, 409);
  }

  return json({ ok: true });
});
