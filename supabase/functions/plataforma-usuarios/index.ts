// Administración global de usuarios (solo superadministración activa).
//   { accion: "crear", email, nombre_completo, es_superadmin? }
//   { accion: "actualizar", usuario_id, nombre_completo?, email?, telefono?, es_superadmin? }
//   { accion: "desactivar" | "activar", usuario_id }
//   { accion: "restablecer_password", usuario_id }
//   { accion: "ping" }  (diagnóstico: comprueba que las Edge Functions responden)
//   { accion: "limpiar_archivos_sistema", sistema_id }  (tras eliminar un sistema)
// Las membresías (sistemas y roles) se editan directo por PostgREST: el RLS ya
// permite al superadmin gestionarlas.
import { clienteServicio, cors, EMAIL_RE, error, json, passwordTemporal } from "../_shared/comun.ts";

// Bloqueo en Auth por ~100 años: no puede iniciar sesión ni renovar su token.
const BLOQUEO = "876000h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  const admin = clienteServicio();
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: sesion } = await admin.auth.getUser(token);
  if (!sesion?.user) return error("Sesión inválida.", 401);
  const yo = sesion.user.id;

  const { data: miPerfil } = await admin.from("perfiles").select("es_superadmin, activo").eq("id", yo).single();
  if (!miPerfil?.es_superadmin || !miPerfil.activo) return error("Solo la superadministración.", 403);

  let c: Record<string, unknown>;
  try {
    c = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }
  const usuarioId = String(c.usuario_id ?? "");

  // Nunca dejar la plataforma sin ningún superadmin activo.
  const quedariaSinSuperadmin = async () => {
    const { count } = await admin
      .from("perfiles")
      .select("id", { count: "exact", head: true })
      .eq("es_superadmin", true)
      .eq("activo", true)
      .neq("id", usuarioId);
    return (count ?? 0) === 0;
  };

  switch (c.accion) {
    case "crear": {
      const email = String(c.email ?? "").trim().toLowerCase();
      const nombre = String(c.nombre_completo ?? "").trim();
      if (!EMAIL_RE.test(email)) return error("Correo electrónico inválido.");
      if (nombre.length < 3) return error("Escribe el nombre completo.");
      const password = passwordTemporal();
      const { data, error: e } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre_completo: nombre, debe_cambiar_password: true },
      });
      if (e || !data.user) return error(e?.message ?? "No se pudo crear la cuenta.");
      if (c.es_superadmin === true) {
        await admin.from("perfiles").update({ es_superadmin: true }).eq("id", data.user.id);
      }
      return json({ ok: true, usuario_id: data.user.id, password_temporal: password });
    }

    case "actualizar": {
      if (!usuarioId) return error("Falta el usuario.");
      const cambios: Record<string, unknown> = {};
      if (typeof c.nombre_completo === "string") cambios.nombre_completo = c.nombre_completo.trim();
      if (typeof c.telefono === "string") cambios.telefono = c.telefono.trim() || null;
      if (typeof c.es_superadmin === "boolean") {
        if (!c.es_superadmin && (await quedariaSinSuperadmin())) return error("Debe quedar al menos un superadmin activo.");
        cambios.es_superadmin = c.es_superadmin;
      }
      if (typeof c.email === "string" && c.email.trim()) {
        const email = c.email.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return error("Correo electrónico inválido.");
        const { error: e } = await admin.auth.admin.updateUserById(usuarioId, { email, email_confirm: true });
        if (e) return error(e.message);
      }
      if (Object.keys(cambios).length) {
        const { error: e } = await admin.from("perfiles").update(cambios).eq("id", usuarioId);
        if (e) return error(e.message);
      }
      return json({ ok: true });
    }

    case "desactivar":
    case "activar": {
      if (!usuarioId) return error("Falta el usuario.");
      const activar = c.accion === "activar";
      if (!activar && usuarioId === yo) return error("No puedes desactivar tu propia cuenta.");
      if (!activar) {
        const { data: p } = await admin.from("perfiles").select("es_superadmin").eq("id", usuarioId).single();
        if (p?.es_superadmin && (await quedariaSinSuperadmin())) return error("Debe quedar al menos un superadmin activo.");
      }
      const { error: e } = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: activar ? "none" : BLOQUEO });
      if (e) return error(e.message);
      await admin.from("perfiles").update({ activo: activar }).eq("id", usuarioId);
      return json({ ok: true });
    }

    case "restablecer_password": {
      if (!usuarioId) return error("Falta el usuario.");
      const password = passwordTemporal();
      const { error: e } = await admin.auth.admin.updateUserById(usuarioId, { password });
      if (e) return error(e.message);
      await admin.from("perfiles").update({ debe_cambiar_password: true }).eq("id", usuarioId);
      return json({ ok: true, password_temporal: password });
    }

    case "ping":
      return json({ ok: true, hora: new Date().toISOString() });

    // Tras plataforma_eliminar_sistema(): borra los anexos del sistema en Storage.
    // Solo actúa si el sistema ya no existe (no sirve para borrar archivos vigentes).
    case "limpiar_archivos_sistema": {
      const sistemaId = String(c.sistema_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(sistemaId)) return error("Sistema inválido.");
      const { count } = await admin.from("sistemas").select("id", { count: "exact", head: true }).eq("id", sistemaId);
      if ((count ?? 0) > 0) return error("El sistema todavía existe.");
      const bucket = admin.storage.from("anexos-clinicos");
      const rutas: string[] = [];
      const recorrer = async (carpeta: string) => {
        for (let desde = 0; ; desde += 1000) {
          const { data, error: e } = await bucket.list(carpeta, { limit: 1000, offset: desde });
          if (e) throw e;
          for (const o of data ?? []) {
            const ruta = `${carpeta}/${o.name}`;
            if (o.id) rutas.push(ruta);
            else await recorrer(ruta);
          }
          if ((data?.length ?? 0) < 1000) break;
        }
      };
      try {
        await recorrer(sistemaId);
        for (let i = 0; i < rutas.length; i += 500) {
          const { error: e } = await bucket.remove(rutas.slice(i, i + 500));
          if (e) throw e;
        }
      } catch (e) {
        return error(e instanceof Error ? e.message : "No se pudieron borrar los archivos.");
      }
      return json({ ok: true, archivos: rutas.length });
    }

    default:
      return error("Acción desconocida.");
  }
});
