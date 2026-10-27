import { datos, supabase, type Fila } from "@/lib/supabase";

/*
 * Exportación del expediente en HL7 FHIR R4 (Bundle «collection»), para entregarlo a otro
 * centro, a un laboratorio o al propio paciente (Ley 172-13, derecho de acceso).
 * Se arma en el navegador con lo que el RLS ya le deja ver a quien exporta: no hay una vía
 * nueva para leer datos. Cada exportación queda en la auditoría (EXPORTAR · FHIR).
 */

type Paciente = Fila<"pacientes">;
type Entrada = Pick<Fila<"historial_clinico">, "id" | "tipo" | "titulo" | "contenido" | "datos" | "corrige_a" | "creado_en" | "cita_id"> & {
  autor?: { nombre_completo: string | null } | null;
};
type Cita = Pick<Fila<"citas">, "id" | "inicio" | "fin" | "estado" | "especialidad" | "motivo"> & {
  medico?: { nombre_completo: string | null } | null;
};
type Resultado = Pick<Fila<"resultados_laboratorio">, "id" | "laboratorio" | "orden" | "fecha_resultado" | "resultados" | "observaciones">;

export interface DatosFhir {
  paciente: Paciente;
  historial: Entrada[];
  citas: Cita[];
  laboratorio: Resultado[];
  sistema: { nombre: string; rnc: string | null };
}

type Recurso = { resourceType: string; id: string } & Record<string, unknown>;
interface ItemReceta {
  nombre?: string;
  detalle?: string;
  indicaciones?: string;
}
interface PruebaLab {
  prueba?: string;
  valor?: string | number;
  unidad?: string;
  referencia?: string;
  bandera?: string;
}

const SISTEMA_EXPEDIENTE = "https://medora.do/fhir/expediente";
const SISTEMA_CEDULA = "https://www.jce.gob.do/cedula";

const ref = (r: Recurso) => ({ reference: `urn:uuid:${r.id}` });
const texto = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const genero = (s: string | null) => (s === "M" ? "male" : s === "F" ? "female" : "unknown");

/** Arma el Bundle FHIR R4. Función pura: la prueba la llama con datos de ejemplo. */
export function construirBundle(d: DatosFhir, ahora = new Date()): Recurso {
  const p = d.paciente;
  const recursos: Recurso[] = [];

  const paciente: Recurso = {
    resourceType: "Patient",
    id: p.id,
    identifier: [
      { system: SISTEMA_EXPEDIENTE, value: p.expediente },
      ...(p.documento ? [{ system: p.documento_tipo === "cedula" || !p.documento_tipo ? SISTEMA_CEDULA : `urn:medora:documento:${p.documento_tipo}`, value: p.documento }] : []),
    ],
    name: [{ use: "official", family: p.apellidos, given: p.nombres.split(/\s+/).filter(Boolean) }],
    gender: genero(p.sexo),
    ...(p.fecha_nacimiento ? { birthDate: p.fecha_nacimiento } : {}),
    telecom: [
      ...(p.telefono ? [{ system: "phone", value: p.telefono }] : []),
      ...(p.email ? [{ system: "email", value: p.email }] : []),
    ],
    ...(p.direccion ? { address: [{ text: p.direccion, country: "DO" }] } : {}),
    ...(p.contacto_emergencia_nombre
      ? { contact: [{ name: { text: p.contacto_emergencia_nombre }, telecom: p.contacto_emergencia_telefono ? [{ system: "phone", value: p.contacto_emergencia_telefono }] : [] }] }
      : {}),
  };
  recursos.push(paciente);
  const sujeto = ref(paciente);

  if (p.alergias?.trim()) {
    recursos.push({ resourceType: "AllergyIntolerance", id: crypto.randomUUID(), patient: sujeto, code: { text: p.alergias.trim() }, clinicalStatus: estado("active", "allergyintolerance-clinical") });
  }
  if (p.condiciones_cronicas?.trim()) {
    recursos.push({ resourceType: "Condition", id: crypto.randomUUID(), subject: sujeto, code: { text: p.condiciones_cronicas.trim() }, clinicalStatus: estado("active", "condition-clinical") });
  }
  if (p.tipo_sangre?.trim()) {
    recursos.push({
      resourceType: "Observation",
      id: crypto.randomUUID(),
      status: "final",
      subject: sujeto,
      code: { coding: [{ system: "http://loinc.org", code: "882-1", display: "ABO and Rh group" }], text: "Tipo de sangre" },
      valueString: p.tipo_sangre.trim(),
    });
  }

  const encuentros = new Map<string, Recurso>();
  for (const c of d.citas) {
    if (!["completada", "en_consulta", "llamado", "en_espera"].includes(c.estado)) continue;
    const e: Recurso = {
      resourceType: "Encounter",
      id: c.id,
      status: c.estado === "completada" ? "finished" : "in-progress",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatorio" },
      subject: sujeto,
      period: { start: c.inicio, ...(c.fin ? { end: c.fin } : {}) },
      ...(c.especialidad ? { serviceType: { text: c.especialidad } } : {}),
      ...(c.motivo ? { reasonCode: [{ text: c.motivo }] } : {}),
      ...(c.medico?.nombre_completo ? { participant: [{ individual: { display: c.medico.nombre_completo } }] } : {}),
      serviceProvider: { display: d.sistema.nombre },
    };
    encuentros.set(c.id, e);
    recursos.push(e);
  }

  for (const h of d.historial) {
    const comun = {
      subject: sujeto,
      ...(h.cita_id && encuentros.has(h.cita_id) ? { encounter: ref(encuentros.get(h.cita_id)!) } : {}),
    };
    const autor = h.autor?.nombre_completo ? [{ display: h.autor.nombre_completo }] : undefined;
    if (h.tipo === "receta") {
      const items = ((h.datos as { items?: ItemReceta[] } | null)?.items ?? []).filter((i) => i.nombre?.trim());
      for (const i of items) {
        recursos.push({
          resourceType: "MedicationRequest",
          id: crypto.randomUUID(),
          status: "completed",
          intent: "order",
          ...comun,
          authoredOn: h.creado_en,
          ...(autor ? { requester: autor[0] } : {}),
          medicationCodeableConcept: { text: i.nombre!.trim() },
          dosageInstruction: [{ text: [i.detalle, i.indicaciones].filter((x) => x?.trim()).join(" · ") || undefined }],
        });
      }
      if (items.length) continue;
    }
    if (h.tipo === "diagnostico") {
      recursos.push({
        resourceType: "Condition",
        id: h.id,
        ...comun,
        recordedDate: h.creado_en,
        code: { text: h.titulo || h.contenido.slice(0, 200) },
        ...(h.contenido ? { note: [{ text: h.contenido }] } : {}),
      });
      continue;
    }
    // Notas, evoluciones, signos vitales, procedimientos…: documento de texto con su tipo.
    recursos.push({
      resourceType: "DocumentReference",
      id: h.id,
      status: "current",
      ...(h.corrige_a ? { relatesTo: [{ code: "appends", target: { reference: `urn:uuid:${h.corrige_a}` } }] } : {}),
      type: { text: h.tipo },
      subject: sujeto,
      date: h.creado_en,
      ...(autor ? { author: autor } : {}),
      description: h.titulo || h.tipo,
      content: [{ attachment: { contentType: "text/plain; charset=utf-8", data: texto(h.contenido || ""), title: h.titulo || h.tipo } }],
      ...(comun.encounter ? { context: { encounter: [comun.encounter] } } : {}),
    });
  }

  for (const r of d.laboratorio) {
    const pruebas = (Array.isArray(r.resultados) ? (r.resultados as PruebaLab[]) : []).filter((x) => x.prueba);
    const obs: Recurso[] = pruebas.map((x) => ({
      resourceType: "Observation",
      id: crypto.randomUUID(),
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }] }],
      subject: sujeto,
      code: { text: x.prueba },
      ...(typeof x.valor === "number" && x.unidad ? { valueQuantity: { value: x.valor, unit: x.unidad } } : { valueString: `${x.valor ?? ""}${x.unidad ? ` ${x.unidad}` : ""}`.trim() }),
      ...(x.referencia ? { referenceRange: [{ text: x.referencia }] } : {}),
      ...(x.bandera ? { interpretation: [{ text: x.bandera }] } : {}),
      ...(r.fecha_resultado ? { effectiveDateTime: r.fecha_resultado } : {}),
    }));
    recursos.push(...obs);
    recursos.push({
      resourceType: "DiagnosticReport",
      id: r.id,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB" }] }],
      code: { text: r.orden ? `Orden ${r.orden}` : "Resultados de laboratorio" },
      subject: sujeto,
      ...(r.fecha_resultado ? { effectiveDateTime: r.fecha_resultado } : {}),
      ...(r.laboratorio ? { performer: [{ display: r.laboratorio }] } : {}),
      result: obs.map(ref),
      ...(r.observaciones ? { conclusion: r.observaciones } : {}),
    });
  }

  return {
    resourceType: "Bundle",
    id: crypto.randomUUID(),
    meta: { lastUpdated: ahora.toISOString(), source: `MEDORA · ${d.sistema.nombre}${d.sistema.rnc ? ` (RNC ${d.sistema.rnc})` : ""}` },
    type: "collection",
    timestamp: ahora.toISOString(),
    entry: recursos.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}

function estado(codigo: string, sistema: string) {
  return { coding: [{ system: `http://terminology.hl7.org/CodeSystem/${sistema}`, code: codigo }] };
}

/** Lee el expediente (con los permisos de quien exporta), lo audita y descarga el .json. */
export async function exportarFhir(sistemaId: string, pacienteId: string) {
  const [paciente, historial, citas, laboratorio, sistema] = await Promise.all([
    supabase.from("pacientes").select("*").eq("id", pacienteId).eq("sistema_id", sistemaId).single(),
    supabase
      .from("historial_clinico")
      .select("id, tipo, titulo, contenido, datos, corrige_a, creado_en, cita_id, autor:perfiles!historial_autor_perfil_fk(nombre_completo)")
      .eq("paciente_id", pacienteId)
      .eq("sistema_id", sistemaId)
      .order("creado_en"),
    supabase
      .from("citas")
      .select("id, inicio, fin, estado, especialidad, motivo, medico:perfiles!citas_medico_perfil_fk(nombre_completo)")
      .eq("paciente_id", pacienteId)
      .eq("sistema_id", sistemaId)
      .order("inicio"),
    supabase
      .from("resultados_laboratorio")
      .select("id, laboratorio, orden, fecha_resultado, resultados, observaciones")
      .eq("paciente_id", pacienteId)
      .eq("sistema_id", sistemaId)
      .order("fecha_resultado"),
    supabase.from("sistemas").select("nombre, rnc").eq("id", sistemaId).single(),
  ]);
  const bundle = construirBundle({
    paciente: datos(paciente)!,
    historial: (datos(historial) ?? []) as unknown as Entrada[],
    citas: (datos(citas) ?? []) as unknown as Cita[],
    laboratorio: (datos(laboratorio) ?? []) as Resultado[],
    sistema: datos(sistema)!,
  });

  // Sin registro en la auditoría no hay exportación.
  datos(
    await supabase.rpc("registrar_evento", {
      p_accion: "EXPORTAR",
      p_sistema: sistemaId,
      p_detalle: { formato: "FHIR R4", paciente: pacienteId, recursos: (bundle.entry as unknown[]).length },
    }),
  );

  const p = datos(paciente)!;
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${p.expediente} ${p.nombres} ${p.apellidos} · FHIR.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return (bundle.entry as unknown[]).length;
}
