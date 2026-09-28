// Edge Function: integraciones (conectores de cada hospital: WhatsApp y Azul).
//
//   { accion: "probar", sistema_id, proveedor }
//
// Solo la administración del sistema (o la superadministración). Las claves se leen
// de Supabase Vault con el service_role y NUNCA salen de aquí: la respuesta trae solo
// el resultado y datos públicos de la cuenta (número y nombre verificado).
// Cada prueba queda en integracion_eventos.
import { clienteServicio, cors, error, json } from "../_shared/comun.ts";

type Resultado = { ok: true; detalle: Record<string, unknown> } | { ok: false; error: string };

const ESPERA_MS = 10_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  const admin = clienteServicio();
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: sesion, error: errSesion } = await admin.auth.getUser(token);
  if (errSesion || !sesion.user) return error("Sesión inválida.", 401);
  const usuarioId = sesion.user.id;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }
  const sistemaId = String(cuerpo.sistema_id ?? "");
  const proveedor = String(cuerpo.proveedor ?? "");
  if (!sistemaId || !["whatsapp", "azul"].includes(proveedor)) return error("Datos incompletos.");

  const [{ data: perfil }, { data: membresia }] = await Promise.all([
    admin.from("perfiles").select("es_superadmin").eq("id", usuarioId).single(),
    admin.from("membresias").select("roles, activo").eq("sistema_id", sistemaId).eq("usuario_id", usuarioId).maybeSingle(),
  ]);
  const esAdmin = membresia?.activo && (membresia.roles as string[]).includes("admin");
  if (!perfil?.es_superadmin && !esAdmin) return error("Solo la administración del hospital prueba integraciones.", 403);

  if (cuerpo.accion !== "probar") return error("Acción desconocida.");

  const { data: fila } = await admin.from("integraciones").select("config").eq("sistema_id", sistemaId).eq("proveedor", proveedor).maybeSingle();
  if (!fila) return error("Primero guarda los datos de la integración.");
  const config = (fila.config ?? {}) as Record<string, string>;
  const secreto = async (campo: string) => {
    const { data } = await admin.rpc("integracion_secreto", { p_sistema: sistemaId, p_proveedor: proveedor, p_campo: campo });
    return (data as string | null) ?? "";
  };

  let r: Resultado;
  try {
    r = await probar(proveedor, config, secreto);
  } catch (e) {
    const msg = e instanceof DOMException && e.name === "TimeoutError" ? "El servicio no respondió a tiempo." : String((e as Error).message ?? e);
    r = { ok: false, error: msg };
  }

  await admin.rpc("registrar_prueba_integracion", {
    p_sistema: sistemaId,
    p_proveedor: proveedor,
    p_ok: r.ok,
    p_detalle: r.ok ? r.detalle : null,
    p_error: r.ok ? null : r.error,
    p_usuario: usuarioId,
  });
  return json(r);
});

async function probar(proveedor: string, config: Record<string, string>, secreto: (c: string) => Promise<string>): Promise<Resultado> {
  switch (proveedor) {
    case "whatsapp":
      return probarWhatsApp(config, await secreto("token"));
    case "azul":
      // Azul exige certificado de cliente y su ambiente de pruebas: se conecta al tenerlos.
      return { ok: false, error: "La prueba de Azul se habilita al recibir el ambiente de pruebas y el certificado de Azul." };
    default:
      return { ok: false, error: "Integración desconocida." };
  }
}

/** WhatsApp Cloud API: lee el número de teléfono del negocio con el token. */
async function probarWhatsApp(config: Record<string, string>, token: string): Promise<Resultado> {
  if (!config.phone_number_id || !token) return { ok: false, error: "Falta el identificador del número o el token." };
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phone_number_id)}?fields=display_phone_number,verified_name,quality_rating`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(ESPERA_MS) });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (cuerpo as { error?: { message?: string; code?: number } }).error;
    const msg = e?.code === 190 ? "El token no es válido o expiró." : e?.message ?? `Meta respondió ${res.status}.`;
    return { ok: false, error: msg };
  }
  const d = cuerpo as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
  return { ok: true, detalle: { numero: d.display_phone_number, nombre: d.verified_name, calidad: d.quality_rating } };
}
