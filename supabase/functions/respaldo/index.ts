// Edge Function: respaldo (copias de seguridad cifradas de toda la base).
//
//   { accion: "automatico" }            → pg_cron, con cabecera x-respaldo-token (Vault "respaldo_cron")
//   { accion: "ahora" }                 → superadmin: respaldo manual inmediato
//   { accion: "descargar", id }         → superadmin: devuelve el respaldo descifrado (.json.gz)
//
// Contenido: todas las tablas del esquema public (respaldo_tablas/respaldo_tabla,
// solo service_role) en un JSON { version, creado_en, tablas: { nombre: filas[] } },
// comprimido con gzip y cifrado con AES-256-GCM (clave RESPALDO_CLAVE, secreto de la
// función; nunca en el repo). Se guarda en el bucket privado "respaldos" y se
// conservan los últimos RETENER. Cada intento queda en la tabla respaldos.
import { clienteServicio, cors, error, json } from "../_shared/comun.ts";

const RETENER = 30;

async function clave(): Promise<CryptoKey> {
  const cruda = Uint8Array.from(atob(Deno.env.get("RESPALDO_CLAVE") ?? ""), (c) => c.charCodeAt(0));
  if (cruda.length !== 32) throw new Error("RESPALDO_CLAVE no está configurada.");
  return crypto.subtle.importKey("raw", cruda, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function comprimir(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function hacerRespaldo(origen: "automatico" | "manual", usuario: string | null) {
  const admin = clienteServicio();
  const inicio = Date.now();
  try {
    const { data: tablas, error: e1 } = await admin.rpc("respaldo_tablas");
    if (e1) throw e1;
    const contenido: Record<string, unknown[]> = {};
    let filas = 0;
    for (const t of (tablas as string[]) ?? []) {
      const { data, error: e2 } = await admin.rpc("respaldo_tabla", { p_tabla: t });
      if (e2) throw new Error(`${t}: ${e2.message}`);
      contenido[t] = (data as unknown[]) ?? [];
      filas += contenido[t].length;
    }
    const cuerpo = new TextEncoder().encode(JSON.stringify({ version: 1, creado_en: new Date().toISOString(), tablas: contenido }));
    const comprimido = await comprimir(cuerpo);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await clave(), comprimido));
    const archivo = new Uint8Array(iv.length + cifrado.length);
    archivo.set(iv);
    archivo.set(cifrado, iv.length);

    const ruta = `${new Date().toISOString().replace(/[:.]/g, "-")}-${origen}.medora.enc`;
    const { error: e3 } = await admin.storage.from("respaldos").upload(ruta, archivo, { contentType: "application/octet-stream" });
    if (e3) throw e3;

    const { data: fila } = await admin
      .from("respaldos")
      .insert({ origen, estado: "ok", ruta, bytes: archivo.length, filas, tablas: Object.keys(contenido).length, duracion_ms: Date.now() - inicio, solicitado_por: usuario })
      .select("id, creado_en, bytes, filas, tablas")
      .single();

    // Retención: se borran los archivos más viejos (el registro queda como historial).
    const { data: viejos } = await admin.from("respaldos").select("id, ruta").eq("estado", "ok").not("ruta", "is", null).order("creado_en", { ascending: false }).range(RETENER, RETENER + 100);
    if (viejos?.length) {
      await admin.storage.from("respaldos").remove(viejos.map((v) => v.ruta as string));
      await admin.from("respaldos").update({ ruta: null }).in("id", viejos.map((v) => v.id));
    }
    return { ok: true, respaldo: fila };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await admin.from("respaldos").insert({ origen, estado: "error", error: mensaje.slice(0, 500), duracion_ms: Date.now() - inicio, solicitado_por: usuario });
    return { ok: false, error: mensaje };
  }
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

  // pg_cron: token compartido guardado en Vault.
  if (cuerpo.accion === "automatico") {
    const esperado = Deno.env.get("RESPALDO_TOKEN") ?? "";
    if (!esperado || req.headers.get("x-respaldo-token") !== esperado) return error("No autorizado.", 401);
    const r = await hacerRespaldo("automatico", null);
    return json(r, r.ok ? 200 : 500);
  }

  // Resto: solo superadmin con sesión válida.
  const admin = clienteServicio();
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: sesion, error: errSesion } = await admin.auth.getUser(token);
  if (errSesion || !sesion.user) return error("Sesión inválida.", 401);
  const { data: perfil } = await admin.from("perfiles").select("es_superadmin").eq("id", sesion.user.id).single();
  if (!perfil?.es_superadmin) return error("Solo el soporte de MEDORA maneja los respaldos.", 403);

  if (cuerpo.accion === "ahora") {
    const r = await hacerRespaldo("manual", sesion.user.id);
    return r.ok ? json(r) : error(`No se pudo hacer el respaldo: ${r.error}`, 500);
  }

  if (cuerpo.accion === "descargar") {
    const { data: fila } = await admin.from("respaldos").select("ruta, creado_en").eq("id", String(cuerpo.id ?? "")).maybeSingle();
    if (!fila?.ruta) return error("Ese respaldo ya no está disponible.", 404);
    const { data: blob, error: e } = await admin.storage.from("respaldos").download(fila.ruta);
    if (e || !blob) return error("No se pudo leer el respaldo.", 500);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await clave(), bytes.slice(12));
    await admin.from("auditoria").insert({ usuario_id: sesion.user.id, accion: "DESCARGAR_RESPALDO", tabla: "respaldos", registro_id: String(cuerpo.id) });
    return new Response(plano, {
      headers: { ...cors, "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="medora-respaldo-${String(fila.creado_en).slice(0, 10)}.json.gz"` },
    });
  }

  return error("Acción desconocida.");
});
