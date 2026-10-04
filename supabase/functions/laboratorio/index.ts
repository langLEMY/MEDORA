// Edge Function: laboratorio (recepción de resultados).
//
// El laboratorio envía cada resultado con el token que le dio el hospital
// (Integraciones → Laboratorio). verify_jwt = false: llama un sistema externo.
//
//   POST /functions/v1/laboratorio?sistema=<id del sistema>
//   Cabecera: x-medora-token: <token>
//   {
//     "orden": "LAB-12345",                         // número de orden del laboratorio (evita duplicados)
//     "fecha": "2026-10-04T10:30:00-04:00",
//     "paciente": { "cedula": "001-0000000-1", "expediente": "EXP-000123", "nombre": "Juana Pérez" },
//     "resultados": [{ "prueba": "Glicemia", "valor": "98", "unidad": "mg/dL", "referencia": "70-110", "bandera": "normal" }],
//     "observaciones": "…",
//     "pdf_base64": "JVBERi0…"                       // opcional, máx. 8 MB
//   }
// Si la cédula o el expediente coinciden, el resultado se asigna al paciente; si no,
// queda en la bandeja de Laboratorio para asignarlo a mano.
import { clienteServicio, cors, error, ipCliente, json, limitar } from "../_shared/comun.ts";

const MAX_PDF = 8 * 1024 * 1024;

function igualEnTiempoConstante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": `${cors["Access-Control-Allow-Headers"]}, x-medora-token` } });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  const admin = clienteServicio();
  const sistemaId = new URL(req.url).searchParams.get("sistema") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(sistemaId)) return error("Falta el parámetro sistema.", 400);
  if (!(await limitar(admin, `lab:ip:${ipCliente(req)}`, 300, 300))) return error("Demasiadas solicitudes.", 429);

  const { data: integ } = await admin.from("integraciones").select("activo, config").eq("sistema_id", sistemaId).eq("proveedor", "laboratorio").maybeSingle();
  const { data: esperado } = await admin.rpc("integracion_secreto", { p_sistema: sistemaId, p_proveedor: "laboratorio", p_campo: "token" });
  const recibido = req.headers.get("x-medora-token") ?? "";
  if (!integ || !esperado || !recibido || !igualEnTiempoConstante(recibido, String(esperado))) return error("No autorizado.", 401);
  if (!integ.activo) return error("La recepción de resultados está en pausa en este hospital.", 403);

  let c: Record<string, unknown>;
  try {
    c = await req.json();
  } catch {
    return error("JSON inválido.");
  }
  const paciente = (c.paciente ?? {}) as Record<string, string>;
  const resultados = Array.isArray(c.resultados) ? c.resultados.slice(0, 500) : [];
  if (resultados.length === 0 && !c.pdf_base64) return error("El envío no trae resultados ni PDF.");
  const orden = c.orden ? String(c.orden).slice(0, 80) : null;
  const laboratorio = String((integ.config as Record<string, string>)?.nombre_laboratorio ?? "Laboratorio");

  // ¿De quién es? Por cédula (formato 000-0000000-0) o por expediente.
  let pacienteId: string | null = null;
  const digitos = String(paciente.cedula ?? "").replace(/\D/g, "");
  if (digitos.length === 11) {
    const cedula = `${digitos.slice(0, 3)}-${digitos.slice(3, 10)}-${digitos.slice(10)}`;
    const { data } = await admin.from("pacientes").select("id").eq("sistema_id", sistemaId).eq("documento", cedula).is("eliminado_en", null).limit(2);
    if (data?.length === 1) pacienteId = data[0].id;
  }
  if (!pacienteId && paciente.expediente) {
    const { data } = await admin.from("pacientes").select("id").eq("sistema_id", sistemaId).eq("expediente", String(paciente.expediente).trim()).is("eliminado_en", null).maybeSingle();
    pacienteId = data?.id ?? null;
  }

  const id = crypto.randomUUID();
  let pdfRuta: string | null = null;
  if (typeof c.pdf_base64 === "string" && c.pdf_base64.length > 0) {
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(c.pdf_base64), (x) => x.charCodeAt(0));
    } catch {
      return error("pdf_base64 inválido.");
    }
    if (bytes.length > MAX_PDF) return error("El PDF pasa de 8 MB.");
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return error("El archivo no es un PDF.");
    pdfRuta = `${sistemaId}/laboratorio/${id}.pdf`;
    const { error: e } = await admin.storage.from("anexos-clinicos").upload(pdfRuta, bytes, { contentType: "application/pdf" });
    if (e) return error("No se pudo guardar el PDF.", 500);
  }

  const { error: errIns } = await admin.from("resultados_laboratorio").insert({
    id,
    sistema_id: sistemaId,
    paciente_id: pacienteId,
    estado: pacienteId ? "asignado" : "recibido",
    asignado_en: pacienteId ? new Date().toISOString() : null,
    laboratorio,
    identificacion: digitos || paciente.expediente || null,
    nombre_paciente: paciente.nombre ? String(paciente.nombre).slice(0, 150) : null,
    orden,
    fecha_resultado: c.fecha ? new Date(String(c.fecha)).toISOString() : new Date().toISOString(),
    resultados,
    observaciones: c.observaciones ? String(c.observaciones).slice(0, 4000) : null,
    pdf_ruta: pdfRuta,
  });
  if (errIns) {
    if (pdfRuta) await admin.storage.from("anexos-clinicos").remove([pdfRuta]);
    if (errIns.code === "23505") return json({ ok: true, duplicado: true, mensaje: "Esa orden ya se había recibido." });
    return error("No se pudo registrar el resultado.", 500);
  }

  await admin.rpc("registrar_evento_integracion", {
    p_sistema: sistemaId, p_proveedor: "laboratorio", p_tipo: "webhook", p_ok: true,
    p_detalle: { orden, asignado: !!pacienteId, pruebas: resultados.length, pdf: !!pdfRuta },
  });
  return json({ ok: true, id, asignado: !!pacienteId });
});
