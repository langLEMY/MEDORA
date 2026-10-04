// Edge Function: ecf (facturación electrónica con la DGII).
//
//   { accion: "procesar" }                      → pg_cron (cabecera x-respaldo-token): todos los sistemas
//   { accion: "enviar", sistema_id }            → Caja/contabilidad: procesa ya lo pendiente de su sistema
//   { accion: "xml", documento_id }             → descarga del XML firmado (comprobante para el cliente)
//
// Para cada documento pendiente: arma el XML del e-CF, lo firma con el certificado
// del hospital (Vault), y lo envía (o su resumen RFCE si es consumo < RD$250,000).
// Los enviados con trackId se consultan hasta que la DGII responda. Todo queda en
// ecf_documentos y en la bitácora de integraciones.
import { clienteServicio, cors, error, json } from "../_shared/comun.ts";
import {
  consultarEstado,
  type DatosComprobante,
  enviarEcf,
  enviarResumen,
  estadoMedora,
  fechaFirmaDeXml,
  firmar,
  leerCertificado,
  obtenerToken,
  urlQr,
  urls,
  xmlEcf,
  xmlResumen,
  type Certificado,
} from "../_shared/dgii.ts";

type Admin = ReturnType<typeof clienteServicio>;
const LOTE = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);
  const admin = clienteServicio();

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }

  if (cuerpo.accion === "procesar") {
    const esperado = Deno.env.get("RESPALDO_TOKEN") ?? "";
    if (!esperado || req.headers.get("x-respaldo-token") !== esperado) return error("No autorizado.", 401);
    const { data } = await admin.from("ecf_documentos").select("sistema_id").in("estado", ["pendiente", "enviado", "error"]).lt("intentos", 20);
    const sistemas = [...new Set((data ?? []).map((d) => d.sistema_id as string))];
    const resultados: Record<string, unknown> = {};
    for (const s of sistemas) resultados[s] = await procesarSistema(admin, s);
    return json({ ok: true, resultados });
  }

  // Acciones de usuario: sesión válida y rol en el sistema.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: sesion } = await admin.auth.getUser(token);
  if (!sesion?.user) return error("Sesión inválida.", 401);

  let sistemaId = String(cuerpo.sistema_id ?? "");
  if (cuerpo.accion === "xml") {
    const { data: doc } = await admin.from("ecf_documentos").select("sistema_id, encf, xml").eq("id", String(cuerpo.documento_id ?? "")).maybeSingle();
    if (!doc) return error("Comprobante no encontrado.", 404);
    sistemaId = doc.sistema_id;
    if (!(await puede(admin, sesion.user.id, sistemaId))) return error("Sin permiso.", 403);
    if (!doc.xml) return error("Ese comprobante todavía no está firmado.");
    return json({ encf: doc.encf, xml: doc.xml });
  }

  if (cuerpo.accion === "enviar") {
    if (!sistemaId || !(await puede(admin, sesion.user.id, sistemaId))) return error("Sin permiso.", 403);
    return json({ ok: true, ...(await procesarSistema(admin, sistemaId)) });
  }

  return error("Acción desconocida.");
});

async function puede(admin: Admin, usuarioId: string, sistemaId: string): Promise<boolean> {
  const { data: m } = await admin.from("membresias").select("roles, activo").eq("sistema_id", sistemaId).eq("usuario_id", usuarioId).maybeSingle();
  return !!m?.activo && (m.roles as string[]).some((r) => ["caja", "admin", "contabilidad", "gerencia"].includes(r));
}

async function procesarSistema(admin: Admin, sistemaId: string) {
  const resumen = { procesados: 0, aceptados: 0, rechazados: 0, enviados: 0, errores: 0, mensaje: null as string | null };

  const { data: integ } = await admin.from("integraciones").select("config, estado").eq("sistema_id", sistemaId).eq("proveedor", "dgii_ecf").maybeSingle();
  if (!integ || integ.estado !== "conectado") {
    resumen.mensaje = "La facturación electrónica no está conectada en Integraciones.";
    return resumen;
  }
  const secreto = async (campo: string) =>
    ((await admin.rpc("integracion_secreto", { p_sistema: sistemaId, p_proveedor: "dgii_ecf", p_campo: campo })).data as string | null) ?? "";

  let cert: Certificado;
  try {
    cert = leerCertificado(await secreto("certificado"), await secreto("clave_certificado"));
  } catch (e) {
    resumen.mensaje = (e as Error).message;
    return resumen;
  }
  const base = urls(integ.config ?? {});
  const tokens: Partial<Record<"ecf" | "fc", string>> = {};
  const tokenDe = async (destino: "ecf" | "fc") => (tokens[destino] ??= await obtenerToken(base[destino], cert));

  const { data: sistema } = await admin.from("sistemas").select("rnc, razon_social, nombre, direccion").eq("id", sistemaId).single();
  const rnc = String(sistema?.rnc ?? "").replace(/\D/g, "");

  const { data: docs } = await admin
    .from("ecf_documentos")
    .select("*")
    .eq("sistema_id", sistemaId)
    .in("estado", ["pendiente", "enviado", "error"])
    .lt("intentos", 20)
    .order("creado_en")
    .limit(LOTE);

  for (const doc of docs ?? []) {
    resumen.procesados++;
    try {
      // Ya enviado a recepción: solo consultar el resultado.
      if (doc.estado === "enviado" && doc.track_id) {
        const r = await consultarEstado(base.ecf, await tokenDe("ecf"), doc.track_id);
        const estado = estadoMedora(r.estado);
        await actualizar(admin, doc.id, { estado, mensajes: r.crudo, intentos: doc.intentos + 1 });
        contar(resumen, estado);
        continue;
      }

      const datos = await datosComprobante(admin, doc, {
        rnc,
        razonSocial: sistema?.razon_social || sistema?.nombre || "",
        direccion: sistema?.direccion ?? "",
      });
      const firmado = firmar(xmlEcf(datos), cert);
      const codigo = firmado.firma.slice(0, 6);
      const fechaFirma = fechaFirmaDeXml(firmado.xml, new Date());
      const qr = urlQr(base, datos, codigo, fechaFirma, doc.resumen);
      const nombre = `${rnc}${doc.encf}.xml`;

      if (doc.resumen) {
        const rfce = firmar(xmlResumen(datos, codigo), cert).xml;
        const r = await enviarResumen(base.fc, await tokenDe("fc"), rfce, nombre);
        const estado = estadoMedora(r.estado) === "enviado" ? "error" : estadoMedora(r.estado);
        await actualizar(admin, doc.id, {
          estado, xml: firmado.xml, codigo_seguridad: codigo, fecha_firma: fechaFirma.toISOString(), qr_url: qr,
          mensajes: r.crudo, intentos: doc.intentos + 1,
        });
        contar(resumen, estado);
      } else {
        const r = await enviarEcf(base.ecf, await tokenDe("ecf"), firmado.xml, nombre);
        await actualizar(admin, doc.id, {
          estado: r.trackId ? "enviado" : "error", track_id: r.trackId ?? null, xml: firmado.xml, codigo_seguridad: codigo,
          fecha_firma: fechaFirma.toISOString(), qr_url: qr, mensajes: r.crudo, intentos: doc.intentos + 1,
        });
        contar(resumen, r.trackId ? "enviado" : "error");
      }
    } catch (e) {
      resumen.errores++;
      await actualizar(admin, doc.id, { estado: doc.estado === "enviado" ? "enviado" : "error", mensajes: { error: (e as Error).message }, intentos: doc.intentos + 1 });
    }
  }

  if (resumen.procesados > 0) {
    await admin.rpc("registrar_evento_integracion", {
      p_sistema: sistemaId, p_proveedor: "dgii_ecf", p_tipo: "envio", p_ok: resumen.errores === 0 && resumen.rechazados === 0, p_detalle: resumen,
    });
  }
  return resumen;
}

function contar(r: { aceptados: number; rechazados: number; enviados: number; errores: number }, estado: string) {
  if (estado.startsWith("aceptado")) r.aceptados++;
  else if (estado === "rechazado") r.rechazados++;
  else if (estado === "enviado") r.enviados++;
  else r.errores++;
}

async function actualizar(admin: Admin, id: string, cambios: Record<string, unknown>) {
  await admin.from("ecf_documentos").update({ ...cambios, ultimo_intento: new Date().toISOString() }).eq("id", id);
}

async function datosComprobante(
  admin: Admin,
  doc: { cobro_id: string; sistema_id: string; tipo: string; encf: string },
  emisor: DatosComprobante["emisor"],
): Promise<DatosComprobante> {
  const [{ data: cobro }, { data: detalles }, { data: pagos }, { data: secuencia }] = await Promise.all([
    admin.from("cobros").select("creado_en, total, descuento, monto_credito, cliente_rnc, cliente_nombre").eq("id", doc.cobro_id).single(),
    admin.from("cobro_detalles").select("descripcion, cantidad, precio_unitario, total").eq("cobro_id", doc.cobro_id),
    admin.from("cobro_pagos").select("metodo, monto").eq("cobro_id", doc.cobro_id),
    admin.from("secuencias_ncf").select("vence_en").eq("sistema_id", doc.sistema_id).eq("tipo", doc.tipo).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!cobro) throw new Error("Cobro no encontrado.");
  if (!emisor.rnc) throw new Error("El sistema no tiene RNC.");
  return {
    tipo: doc.tipo,
    encf: doc.encf,
    venceSecuencia: secuencia?.vence_en ?? null,
    fecha: new Date(cobro.creado_en),
    emisor,
    comprador: { rnc: cobro.cliente_rnc, nombre: cobro.cliente_nombre },
    items: (detalles ?? []).map((d) => ({
      descripcion: d.descripcion,
      cantidad: Number(d.cantidad),
      precio: Number(d.precio_unitario),
      monto: Number(d.total),
    })),
    descuento: Number(cobro.descuento),
    total: Number(cobro.total),
    credito: Number(cobro.monto_credito),
    pagos: (pagos ?? []).map((p) => ({ metodo: p.metodo as string, monto: Number(p.monto) })),
  };
}
