// Alta de personal y restablecimiento de contraseñas. Necesita la service key
// (Auth Admin API), por eso vive aquí y no en el cliente. Autoriza con las
// mismas reglas que el RLS: superadmin, o admin del sistema afectado.
//
// Acciones:
//   { accion: "crear", sistema_id, email, nombre_completo, roles[], especialidad?, exequatur?, sede_id? }
//   { accion: "restablecer_password", sistema_id, usuario_id }
import { clienteServicio, cors, EMAIL_RE, error, json, passwordTemporal } from "../_shared/comun.ts";

const ROLES = new Set(["admin", "medico", "enfermeria", "recepcion", "caja", "farmacia", "auditor"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  const admin = clienteServicio();

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: sesion, error: errSesion } = await admin.auth.getUser(token);
  if (errSesion || !sesion.user) return error("Sesión inválida.", 401);
  const llamanteId = sesion.user.id;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }

  const sistemaId = String(cuerpo.sistema_id ?? "");
  if (!sistemaId) return error("Falta el sistema.");

  // ¿Puede administrar este sistema?
  const [{ data: perfil }, { data: membresia }] = await Promise.all([
    admin.from("perfiles").select("es_superadmin").eq("id", llamanteId).single(),
    admin
      .from("membresias")
      .select("roles, activo")
      .eq("sistema_id", sistemaId)
      .eq("usuario_id", llamanteId)
      .maybeSingle(),
  ]);
  const esAdmin = membresia?.activo && (membresia.roles as string[]).includes("admin");
  if (!perfil?.es_superadmin && !esAdmin) return error("No tienes permiso para gestionar personal en este sistema.", 403);

  switch (cuerpo.accion) {
    case "crear":
      return await crear(admin, llamanteId, sistemaId, cuerpo);
    case "restablecer_password":
      return await restablecer(admin, sistemaId, String(cuerpo.usuario_id ?? ""));
    default:
      return error("Acción desconocida.");
  }
});

async function crear(
  admin: ReturnType<typeof clienteServicio>,
  llamanteId: string,
  sistemaId: string,
  cuerpo: Record<string, unknown>,
) {
  const email = String(cuerpo.email ?? "").trim().toLowerCase();
  const nombre = String(cuerpo.nombre_completo ?? "").trim();
  const roles = Array.isArray(cuerpo.roles) ? (cuerpo.roles as string[]).filter((r) => ROLES.has(r)) : [];
  if (!EMAIL_RE.test(email)) return error("Correo electrónico inválido.");
  if (nombre.length < 3) return error("Escribe el nombre completo.");
  if (roles.length === 0) return error("Asigna al menos un rol.");

  // ¿Ya existe la persona en MEDORA (p. ej. trabaja en otro sistema)? Entonces
  // solo se le agrega la membresía, sin tocar su contraseña.
  const { data: existente } = await admin.from("perfiles").select("id").eq("email", email).maybeSingle();

  let usuarioId = existente?.id as string | undefined;
  let password: string | null = null;

  if (!usuarioId) {
    password = passwordTemporal();
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre_completo: nombre, debe_cambiar_password: true },
    });
    if (errCrear || !creado.user) return error(errCrear?.message ?? "No se pudo crear la cuenta.");
    usuarioId = creado.user.id;
  }

  const { error: errMembresia } = await admin.from("membresias").upsert(
    {
      sistema_id: sistemaId,
      usuario_id: usuarioId,
      roles,
      especialidad: cuerpo.especialidad ?? null,
      exequatur: cuerpo.exequatur ?? null,
      sede_id: cuerpo.sede_id ?? null,
      activo: true,
      creado_por: llamanteId,
    },
    { onConflict: "sistema_id,usuario_id" },
  );
  if (errMembresia) return error("No se pudo asignar la membresía: " + errMembresia.message);

  return json({ ok: true, usuario_id: usuarioId, password_temporal: password, ya_existia: !!existente });
}

async function restablecer(admin: ReturnType<typeof clienteServicio>, sistemaId: string, usuarioId: string) {
  if (!usuarioId) return error("Falta el usuario.");
  const { data: m } = await admin
    .from("membresias")
    .select("id")
    .eq("sistema_id", sistemaId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (!m) return error("Esa persona no pertenece a este sistema.", 404);

  const password = passwordTemporal();
  const { error: errPwd } = await admin.auth.admin.updateUserById(usuarioId, { password });
  if (errPwd) return error(errPwd.message);
  await admin.from("perfiles").update({ debe_cambiar_password: true }).eq("id", usuarioId);

  return json({ ok: true, password_temporal: password });
}
