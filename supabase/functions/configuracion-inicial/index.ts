// Asistente de primer arranque: crea la cuenta del superadmin de la plataforma
// (y opcionalmente el primer sistema hospitalario). Solo funciona mientras NO
// exista ningún superadmin — después responde 409 para siempre. Equivale al
// SembradorUsuarioInicial de FUNBIDE, pero del lado del servidor.
//
// verify_jwt = false: se llama antes de que exista cualquier cuenta.
import { clienteServicio, cors, EMAIL_RE, error, json } from "../_shared/comun.ts";

interface Solicitud {
  codigo: string;
  nombre_completo: string;
  email: string;
  password: string;
  sistema?: { nombre: string; slug: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  let cuerpo: Solicitud;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }

  const nombre = cuerpo.nombre_completo?.trim() ?? "";
  const email = cuerpo.email?.trim().toLowerCase() ?? "";
  if (nombre.length < 3) return error("Escribe tu nombre completo.");
  if (!EMAIL_RE.test(email)) return error("Correo electrónico inválido.");
  if (!cuerpo.password || cuerpo.password.length < 10) {
    return error("La contraseña debe tener al menos 10 caracteres.");
  }

  const admin = clienteServicio();

  const { count, error: errConteo } = await admin
    .from("perfiles")
    .select("id", { count: "exact", head: true })
    .eq("es_superadmin", true);
  if (errConteo) return error("No se pudo verificar el estado de la instalación.", 500);
  if ((count ?? 0) > 0) return error("MEDORA ya fue configurado.", 409);

  // Código de instalación (ver migración 20260925120600): sin él, cualquiera con la URL
  // pública podría adelantarse al dueño y quedarse con la cuenta de superadmin.
  const { data: codigoValido } = await admin.rpc("verificar_codigo_instalacion", { p_codigo: cuerpo.codigo?.trim() ?? "" });
  if (codigoValido !== true) return error("Código de instalación incorrecto.", 403);

  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email,
    password: cuerpo.password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
  });
  if (errCrear || !creado.user) {
    return error(errCrear?.message ?? "No se pudo crear la cuenta.", 400);
  }
  const usuarioId = creado.user.id;

  const { error: errPromover } = await admin
    .from("perfiles")
    .update({ es_superadmin: true, nombre_completo: nombre })
    .eq("id", usuarioId);
  if (errPromover) {
    await admin.auth.admin.deleteUser(usuarioId);
    return error("No se pudo asignar el rol de superadministrador.", 500);
  }

  let sistemaId: string | null = null;
  if (cuerpo.sistema?.nombre && cuerpo.sistema?.slug) {
    const { data: sistema, error: errSistema } = await admin
      .from("sistemas")
      .insert({ nombre: cuerpo.sistema.nombre.trim(), slug: cuerpo.sistema.slug.trim(), creado_por: usuarioId })
      .select("id")
      .single();
    if (!errSistema && sistema) {
      sistemaId = sistema.id;
      await admin.from("membresias").insert({
        sistema_id: sistema.id,
        usuario_id: usuarioId,
        roles: ["admin"],
        creado_por: usuarioId,
      });
      await admin.from("perfiles").update({ ultimo_sistema_id: sistema.id }).eq("id", usuarioId);
    }
  }

  return json({ ok: true, usuario_id: usuarioId, sistema_id: sistemaId });
});
