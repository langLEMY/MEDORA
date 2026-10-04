// Edge Function: integraciones (conectores de cada hospital: WhatsApp, Azul, e-CF DGII,
// SENASA, laboratorio y JCE).
//
//   { accion: "probar", sistema_id, proveedor }
//
// Solo la administración del sistema (o la superadministración). Las claves se leen
// de Supabase Vault con el service_role y NUNCA salen de aquí: la respuesta trae solo
// el resultado y datos públicos de la cuenta (número y nombre verificado).
// Cada prueba queda en integracion_eventos.
import { clienteServicio, cors, error, json } from "../_shared/comun.ts";
import { leerCertificado, obtenerToken, urls } from "../_shared/dgii.ts";

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
  if (!sistemaId || !["whatsapp", "azul", "dgii_ecf", "ars_senasa", "laboratorio", "jce"].includes(proveedor)) return error("Datos incompletos.");

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
    r = await probar(proveedor, config, secreto, sistemaId);
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

async function probar(proveedor: string, config: Record<string, string>, secreto: (c: string) => Promise<string>, sistemaId: string): Promise<Resultado> {
  switch (proveedor) {
    case "whatsapp":
      return probarWhatsApp(config, await secreto("token"));
    case "azul":
      // Azul exige certificado de cliente y su ambiente de pruebas: se conecta al tenerlos.
      return { ok: false, error: "La prueba de Azul se habilita al recibir el ambiente de pruebas y el certificado de Azul." };
    case "dgii_ecf":
      return probarDgii(config, await secreto("certificado"), await secreto("clave_certificado"));
    case "ars_senasa":
      // SENASA no ofrece todavía un servicio de validación para prestadores desde sistemas
      // externos: el conector deja registrado al prestador y la conciliación funciona por archivo.
      if (!config.codigo_prestador) return { ok: false, error: "Falta el código de prestador." };
      return { ok: true, detalle: { prestador: `Prestador ${config.codigo_prestador}`, modo: "Pagos por relación (Excel); validación en línea al habilitarla SENASA" } };
    case "laboratorio": {
      if (!(await secreto("token"))) return { ok: false, error: "Falta el token." };
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/laboratorio?sistema=${sistemaId}`;
      return { ok: true, detalle: { laboratorio: config.nombre_laboratorio, direccion: url } };
    }
    case "jce":
      return probarJce(config, await secreto("clave"));
    default:
      return { ok: false, error: "Integración desconocida." };
  }
}

/** DGII: abre el certificado, revisa su vigencia y se autentica (semilla → token). */
async function probarDgii(config: Record<string, string>, certificado: string, clave: string): Promise<Resultado> {
  if (!certificado || !clave) return { ok: false, error: "Falta el certificado digital o su clave." };
  const cert = leerCertificado(certificado, clave);
  const ahora = new Date();
  if (cert.hasta < ahora) return { ok: false, error: `El certificado venció el ${cert.hasta.toISOString().slice(0, 10)}.` };
  if (cert.desde > ahora) return { ok: false, error: "El certificado todavía no está vigente." };
  const base = urls(config);
  await obtenerToken(base.ecf, cert);
  const dias = Math.floor((cert.hasta.getTime() - ahora.getTime()) / 86_400_000);
  return {
    ok: true,
    detalle: { titular: cert.titular, ambiente: base.ambiente, vence: `vence en ${dias} días (${cert.hasta.toISOString().slice(0, 10)})` },
  };
}

/** JCE: el servicio lo da la JCE/OGTIC a entidades autorizadas; se comprueba que responda con las credenciales. */
async function probarJce(config: Record<string, string>, clave: string): Promise<Resultado> {
  if (!config.url_servicio || !config.usuario || !clave) return { ok: false, error: "Faltan la dirección del servicio, el usuario o la clave." };
  let url: URL;
  try {
    url = new URL(config.url_servicio);
  } catch {
    return { ok: false, error: "La dirección del servicio no es válida." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "El servicio debe usar https." };
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${config.usuario}:${clave}`)}` },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, error: "El servicio rechazó el usuario o la clave." };
  if (res.status >= 500) return { ok: false, error: `El servicio respondió ${res.status}.` };
  return { ok: true, detalle: { servicio: url.host, respuesta: `HTTP ${res.status}` } };
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
