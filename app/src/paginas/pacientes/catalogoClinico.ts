import type { Capacidad } from "@/lib/capacidades";
import type { TipoEntradaClinica } from "@/lib/supabase";

/**
 * Catálogo del expediente: formularios estructurados, campos de vacuna, licencia y
 * consentimiento, hábitos, antecedentes y condiciones especiales. Los formularios se
 * guardan como historial_clinico tipo "formulario" con datos.formulario = clave, así
 * que agregar uno nuevo es solo agregarlo aquí (sin migración).
 */

export type CampoClinico = {
  clave: string;
  etiqueta: string;
  placeholder?: string;
  opciones?: string[];
  tipo?: "texto" | "numero" | "fecha" | "area" | "cie10";
};

export type GrupoFormulario = "clinicos" | "enfermeria";

export interface DefFormulario {
  clave: string;
  nombre: string;
  grupo: GrupoFormulario;
  descripcion: string;
  campos: CampoClinico[];
  /** Se imprime como documento con membrete y firma. */
  imprimible?: boolean;
  /** Solo se ofrece si la sede activa tiene esta capacidad (p. ej. internamiento: no en un consultorio). */
  requiere?: Capacidad;
  /** Escala con puntaje: cada opción termina en "(n)" y se suma. */
  escala?: { menorEsPeor?: boolean; rangos: { desde: number; etiqueta: string; riesgo: "alto" | "medio" | "bajo" }[] };
  /** No se elige en el catálogo (lo escribe una RPC), pero se muestra con su nombre. */
  oculto?: boolean;
}

const SI_NO = ["Sí", "No"];

export const FORMULARIOS: DefFormulario[] = [
  {
    clave: "cuestionario_inicial",
    nombre: "Cuestionario inicial",
    grupo: "clinicos",
    descripcion: "Primera visita: motivo, síntomas y antecedentes declarados por el paciente.",
    campos: [
      { clave: "motivo", etiqueta: "Motivo de la visita", tipo: "area" },
      { clave: "tiempo_evolucion", etiqueta: "Tiempo de evolución", placeholder: "3 días" },
      { clave: "dolor", etiqueta: "Dolor (0–10)", tipo: "numero" },
      { clave: "medicamentos_actuales", etiqueta: "Medicamentos que toma", tipo: "area" },
      { clave: "cirugias_previas", etiqueta: "Cirugías previas", tipo: "area" },
      { clave: "antecedentes_familiares", etiqueta: "Antecedentes familiares", tipo: "area" },
    ],
  },
  {
    clave: "historia_clinica",
    nombre: "Historia clínica completa",
    grupo: "clinicos",
    descripcion: "Anamnesis, examen físico por sistemas, impresión diagnóstica y plan.",
    imprimible: true,
    campos: [
      { clave: "motivo", etiqueta: "Motivo de consulta", tipo: "area" },
      { clave: "enfermedad_actual", etiqueta: "Historia de la enfermedad actual", tipo: "area" },
      { clave: "revision_sistemas", etiqueta: "Revisión por sistemas", tipo: "area" },
      { clave: "examen_fisico", etiqueta: "Examen físico", tipo: "area" },
      { clave: "impresion", etiqueta: "Impresión diagnóstica (CIE-10)", tipo: "cie10" },
      { clave: "plan", etiqueta: "Plan", tipo: "area" },
    ],
  },
  {
    clave: "chequeo_ejecutivo",
    nombre: "Nota de salud ejecutiva",
    grupo: "clinicos",
    descripcion: "Chequeo preventivo: hallazgos, riesgo cardiovascular y recomendaciones.",
    imprimible: true,
    campos: [
      { clave: "hallazgos", etiqueta: "Hallazgos relevantes", tipo: "area" },
      { clave: "riesgo_cv", etiqueta: "Riesgo cardiovascular", opciones: ["Bajo", "Moderado", "Alto", "Muy alto"] },
      { clave: "apto", etiqueta: "Apto para sus labores", opciones: ["Apto", "Apto con restricciones", "No apto"] },
      { clave: "recomendaciones", etiqueta: "Recomendaciones", tipo: "area" },
      { clave: "proximo_control", etiqueta: "Próximo control", tipo: "fecha" },
    ],
  },
  {
    clave: "procedimiento",
    nombre: "Formulario de procedimiento",
    grupo: "clinicos",
    descripcion: "Procedimiento realizado: técnica, hallazgos, complicaciones y muestras.",
    imprimible: true,
    campos: [
      { clave: "procedimiento", etiqueta: "Procedimiento", placeholder: "Sutura de herida en antebrazo" },
      { clave: "indicacion", etiqueta: "Indicación", tipo: "area" },
      { clave: "anestesia", etiqueta: "Anestesia", opciones: ["Ninguna", "Local", "Sedación", "Regional", "General"] },
      { clave: "tecnica", etiqueta: "Técnica y hallazgos", tipo: "area" },
      { clave: "complicaciones", etiqueta: "Complicaciones", placeholder: "Ninguna" },
      { clave: "muestras", etiqueta: "Muestras enviadas", placeholder: "Biopsia a patología" },
    ],
  },
  {
    clave: "conciliacion_medicamentosa",
    nombre: "Conciliación medicamentosa",
    grupo: "clinicos",
    descripcion: "Lo que el paciente toma en casa frente a lo indicado: continuar, ajustar o suspender.",
    campos: [
      { clave: "medicamentos_casa", etiqueta: "Medicamentos que trae de casa", tipo: "area" },
      { clave: "continuar", etiqueta: "Continuar", tipo: "area" },
      { clave: "ajustar", etiqueta: "Ajustar dosis", tipo: "area" },
      { clave: "suspender", etiqueta: "Suspender", tipo: "area" },
      { clave: "fuente", etiqueta: "Fuente de la información", opciones: ["Paciente", "Familiar", "Receta previa", "Farmacia"] },
    ],
  },
  {
    clave: "interconsulta",
    nombre: "Nota de interconsulta",
    grupo: "clinicos",
    descripcion: "Pregunta al especialista y su respuesta.",
    imprimible: true,
    campos: [
      { clave: "especialidad", etiqueta: "Especialidad consultada", placeholder: "Cardiología" },
      { clave: "pregunta", etiqueta: "Motivo de la interconsulta", tipo: "area" },
      { clave: "hallazgos", etiqueta: "Hallazgos del especialista", tipo: "area" },
      { clave: "recomendaciones", etiqueta: "Recomendaciones", tipo: "area" },
    ],
  },
  {
    clave: "epicrisis",
    nombre: "Hoja de egreso (epicrisis)",
    grupo: "clinicos",
    descripcion: "Resumen al alta: diagnóstico de ingreso y egreso, evolución, tratamiento y seguimiento.",
    imprimible: true,
    requiere: "internamiento",
    campos: [
      { clave: "fecha_ingreso", etiqueta: "Fecha de ingreso", tipo: "fecha" },
      { clave: "fecha_egreso", etiqueta: "Fecha de egreso", tipo: "fecha" },
      { clave: "dx_ingreso", etiqueta: "Diagnóstico de ingreso (CIE-10)", tipo: "cie10" },
      { clave: "dx_egreso", etiqueta: "Diagnóstico de egreso (CIE-10)", tipo: "cie10" },
      { clave: "condicion", etiqueta: "Condición al egreso", opciones: ["Mejorado", "Igual", "Referido", "Alta voluntaria", "Fallecido"] },
      { clave: "evolucion", etiqueta: "Evolución", tipo: "area" },
      { clave: "tratamiento", etiqueta: "Tratamiento al alta", tipo: "area" },
      { clave: "seguimiento", etiqueta: "Seguimiento", tipo: "area" },
    ],
  },
  {
    clave: "alta_peticion",
    nombre: "Alta a petición",
    grupo: "clinicos",
    descripcion: "El paciente o su responsable pide el alta contra el criterio médico.",
    imprimible: true,
    requiere: "internamiento",
    campos: [
      { clave: "solicitante", etiqueta: "Quién la solicita", placeholder: "El paciente / su hija María Pérez" },
      { clave: "motivo", etiqueta: "Motivo expresado", tipo: "area" },
      { clave: "riesgos_explicados", etiqueta: "Riesgos explicados", tipo: "area" },
      { clave: "testigo", etiqueta: "Testigo" },
    ],
  },
  {
    clave: "curva_crecimiento",
    nombre: "Curva de crecimiento",
    grupo: "clinicos",
    descripcion: "Control pediátrico: peso, talla, perímetro cefálico y percentiles.",
    campos: [
      { clave: "peso", etiqueta: "Peso (kg)", tipo: "numero" },
      { clave: "talla", etiqueta: "Talla (cm)", tipo: "numero" },
      { clave: "perimetro_cefalico", etiqueta: "Perímetro cefálico (cm)", tipo: "numero" },
      { clave: "percentil_peso", etiqueta: "Percentil peso/edad", placeholder: "P50" },
      { clave: "percentil_talla", etiqueta: "Percentil talla/edad", placeholder: "P50" },
      { clave: "desarrollo", etiqueta: "Desarrollo psicomotor", tipo: "area" },
    ],
  },
  {
    clave: "riesgos_iaas",
    nombre: "Riesgos epidemiológicos e IAAS",
    grupo: "clinicos",
    descripcion: "Riesgo de infecciones asociadas a la atención y medidas de aislamiento.",
    requiere: "internamiento",
    campos: [
      { clave: "dispositivos", etiqueta: "Dispositivos invasivos", placeholder: "Catéter venoso, sonda vesical…" },
      { clave: "aislamiento", etiqueta: "Aislamiento", opciones: ["Ninguno", "Contacto", "Gotas", "Aéreo", "Protector"] },
      { clave: "germen", etiqueta: "Germen multirresistente", opciones: SI_NO },
      { clave: "viaje_reciente", etiqueta: "Viaje o brote reciente", opciones: SI_NO },
      { clave: "medidas", etiqueta: "Medidas indicadas", tipo: "area" },
    ],
  },
  {
    clave: "educacion",
    nombre: "Educación al paciente",
    grupo: "clinicos",
    descripcion: "Qué se le explicó, a quién y si lo entendió.",
    campos: [
      { clave: "tema", etiqueta: "Tema", placeholder: "Uso de insulina, dieta, signos de alarma…" },
      { clave: "dirigido_a", etiqueta: "Dirigido a", opciones: ["Paciente", "Familiar", "Cuidador"] },
      { clave: "comprension", etiqueta: "Comprensión", opciones: ["Buena", "Parcial", "Requiere refuerzo"] },
      { clave: "material", etiqueta: "Material entregado", placeholder: "Folleto, video…" },
    ],
  },
  {
    clave: "post_auditoria",
    nombre: "Comentario post-auditoría médica",
    grupo: "clinicos",
    descripcion: "Observaciones de la auditoría del expediente y su respuesta.",
    campos: [
      { clave: "hallazgo", etiqueta: "Hallazgo de la auditoría", tipo: "area" },
      { clave: "accion", etiqueta: "Acción correctiva", tipo: "area" },
    ],
  },
  // Enfermería
  {
    clave: "nota_enfermeria",
    nombre: "Nota de enfermería",
    grupo: "enfermeria",
    descripcion: "Valoración, cuidados realizados y respuesta del paciente.",
    campos: [
      { clave: "turno", etiqueta: "Turno", opciones: ["Mañana", "Tarde", "Noche"] },
      { clave: "valoracion", etiqueta: "Valoración", tipo: "area" },
      { clave: "cuidados", etiqueta: "Cuidados realizados", tipo: "area" },
      { clave: "respuesta", etiqueta: "Respuesta del paciente", tipo: "area" },
    ],
  },
  {
    clave: "aplicacion_medicamento",
    nombre: "Aplicación de medicamento",
    grupo: "enfermeria",
    descripcion: "Una dosis puntual (inyección, nebulización…). Con internamiento, el horario de cada paciente va en Enfermería → Kardex.",
    campos: [
      { clave: "medicamento", etiqueta: "Medicamento", placeholder: "Ceftriaxona 1 g" },
      { clave: "dosis", etiqueta: "Dosis" },
      { clave: "via", etiqueta: "Vía", opciones: ["Oral", "IV", "IM", "SC", "Sublingual", "Inhalada", "Tópica", "Rectal"] },
      { clave: "hora", etiqueta: "Hora", placeholder: "08:00" },
      { clave: "observaciones", etiqueta: "Observaciones", tipo: "area" },
    ],
  },
  {
    clave: "control_hidrico",
    nombre: "Control hídrico",
    grupo: "enfermeria",
    descripcion: "Ingresos y egresos de líquidos del turno; el balance se calcula solo.",
    requiere: "internamiento",
    campos: [
      { clave: "periodo", etiqueta: "Período", opciones: ["6 horas", "8 horas", "12 horas", "24 horas"] },
      { clave: "ingreso_oral", etiqueta: "Ingreso oral (ml)", tipo: "numero" },
      { clave: "ingreso_iv", etiqueta: "Ingreso IV (ml)", tipo: "numero" },
      { clave: "egreso_orina", etiqueta: "Orina (ml)", tipo: "numero" },
      { clave: "egreso_otros", etiqueta: "Otros egresos (ml)", tipo: "numero" },
    ],
  },
  {
    clave: "oxigenoterapia",
    nombre: "Control de oxigenoterapia",
    grupo: "enfermeria",
    descripcion: "Dispositivo, flujo y saturación.",
    requiere: "internamiento",
    campos: [
      { clave: "dispositivo", etiqueta: "Dispositivo", opciones: ["Cánula nasal", "Mascarilla simple", "Mascarilla con reservorio", "Venturi", "Alto flujo"] },
      { clave: "flujo", etiqueta: "Flujo (L/min)", tipo: "numero" },
      { clave: "fio2", etiqueta: "FiO₂ (%)", tipo: "numero" },
      { clave: "sat_antes", etiqueta: "SatO₂ antes (%)", tipo: "numero" },
      { clave: "sat_despues", etiqueta: "SatO₂ después (%)", tipo: "numero" },
    ],
  },
  {
    clave: "escala_morse",
    nombre: "Riesgo de caídas (escala de Morse)",
    grupo: "enfermeria",
    descripcion: "Seis preguntas; el puntaje dice si el riesgo de caída es bajo, medio o alto.",
    requiere: "internamiento",
    escala: {
      rangos: [
        { desde: 45, etiqueta: "Riesgo alto de caída", riesgo: "alto" },
        { desde: 25, etiqueta: "Riesgo medio de caída", riesgo: "medio" },
        { desde: 0, etiqueta: "Riesgo bajo de caída", riesgo: "bajo" },
      ],
    },
    campos: [
      { clave: "caidas_previas", etiqueta: "Caídas en los últimos 3 meses", opciones: ["No (0)", "Sí (25)"] },
      { clave: "dx_secundario", etiqueta: "Más de un diagnóstico", opciones: ["No (0)", "Sí (15)"] },
      { clave: "ayuda_deambular", etiqueta: "Ayuda para caminar", opciones: ["Ninguna, reposo o enfermería (0)", "Muletas, bastón o andador (15)", "Se apoya en los muebles (30)"] },
      { clave: "via_iv", etiqueta: "Vía venosa o heparina", opciones: ["No (0)", "Sí (20)"] },
      { clave: "marcha", etiqueta: "Marcha", opciones: ["Normal, en reposo o inmóvil (0)", "Débil (10)", "Alterada (20)"] },
      { clave: "estado_mental", etiqueta: "Estado mental", opciones: ["Conoce sus limitaciones (0)", "Olvida sus limitaciones (15)"] },
    ],
  },
  {
    clave: "escala_braden",
    nombre: "Úlceras por presión (escala de Braden)",
    grupo: "enfermeria",
    descripcion: "Seis factores; mientras más bajo el puntaje, mayor el riesgo de úlcera.",
    requiere: "internamiento",
    escala: {
      menorEsPeor: true,
      rangos: [
        { desde: 19, etiqueta: "Sin riesgo", riesgo: "bajo" },
        { desde: 15, etiqueta: "Riesgo bajo", riesgo: "bajo" },
        { desde: 13, etiqueta: "Riesgo moderado", riesgo: "medio" },
        { desde: 0, etiqueta: "Riesgo alto", riesgo: "alto" },
      ],
    },
    campos: [
      { clave: "percepcion", etiqueta: "Percepción sensorial", opciones: ["Completamente limitada (1)", "Muy limitada (2)", "Levemente limitada (3)", "Sin limitación (4)"] },
      { clave: "humedad", etiqueta: "Humedad de la piel", opciones: ["Constantemente húmeda (1)", "A menudo húmeda (2)", "Ocasionalmente húmeda (3)", "Rara vez húmeda (4)"] },
      { clave: "actividad", etiqueta: "Actividad", opciones: ["En cama (1)", "En silla (2)", "Camina ocasionalmente (3)", "Camina con frecuencia (4)"] },
      { clave: "movilidad", etiqueta: "Movilidad", opciones: ["Inmóvil (1)", "Muy limitada (2)", "Levemente limitada (3)", "Sin limitación (4)"] },
      { clave: "nutricion", etiqueta: "Nutrición", opciones: ["Muy pobre (1)", "Probablemente inadecuada (2)", "Adecuada (3)", "Excelente (4)"] },
      { clave: "friccion", etiqueta: "Fricción y cizallamiento", opciones: ["Es un problema (1)", "Problema potencial (2)", "Sin problema aparente (3)"] },
    ],
  },
  // Los escribe una RPC (no se eligen en el catálogo): se muestran con su nombre.
  {
    clave: "indicacion_medicamento",
    nombre: "Indicación de medicamento",
    grupo: "clinicos",
    descripcion: "Medicamento indicado para el Kardex de enfermería.",
    oculto: true,
    campos: [
      { clave: "medicamento", etiqueta: "Medicamento" },
      { clave: "dosis", etiqueta: "Dosis" },
      { clave: "via", etiqueta: "Vía" },
      { clave: "pauta", etiqueta: "Pauta" },
      { clave: "frecuencia", etiqueta: "Frecuencia" },
      { clave: "duracion", etiqueta: "Duración" },
      { clave: "observaciones", etiqueta: "Observaciones", tipo: "area" },
    ],
  },
];

/** ¿Se ofrece este formulario en la sede activa? Sin capacidades resueltas, se ofrece todo. */
export const formularioDisponible = (f: DefFormulario, capacidades?: Partial<Record<Capacidad, boolean>> | null) =>
  !f.oculto && (!f.requiere || !capacidades || Object.keys(capacidades).length === 0 || capacidades[f.requiere] === true);

/** Puntaje de una escala: suma el "(n)" de cada respuesta; null si no hay respuestas. */
export function puntajeEscala(f: DefFormulario | undefined, datos: Record<string, unknown>) {
  if (!f?.escala) return null;
  const puntos = f.campos.map((c) => /\((\d+)\)\s*$/.exec(String(datos[c.clave] ?? ""))?.[1]).filter((x): x is string => !!x).map(Number);
  if (!puntos.length) return null;
  const total = puntos.reduce((s, n) => s + n, 0);
  const rango = f.escala.rangos.find((r) => total >= r.desde) ?? f.escala.rangos[f.escala.rangos.length - 1];
  return { total, completo: puntos.length === f.campos.length, ...rango };
}

export const FORMULARIO_POR_CLAVE = Object.fromEntries(FORMULARIOS.map((f) => [f.clave, f])) as Record<string, DefFormulario>;

/** Signos vitales (historia, triaje y preconsulta de enfermería). */
export const CAMPOS_SIGNOS: CampoClinico[] = [
  { clave: "pa", etiqueta: "Presión arterial", placeholder: "120/80" },
  { clave: "fc", etiqueta: "Frec. cardíaca (lpm)", placeholder: "72", tipo: "numero" },
  { clave: "fr", etiqueta: "Frec. respiratoria", placeholder: "16", tipo: "numero" },
  { clave: "temp", etiqueta: "Temperatura (°C)", placeholder: "36.5", tipo: "numero" },
  { clave: "sat", etiqueta: "SatO₂ (%)", placeholder: "98", tipo: "numero" },
  { clave: "peso", etiqueta: "Peso (kg)", tipo: "numero" },
  { clave: "talla", etiqueta: "Talla (cm)", tipo: "numero" },
  { clave: "glucosa", etiqueta: "Glucosa (mg/dL)", tipo: "numero" },
];

export const NIVELES_ESI = ["1 · Reanimación", "2 · Emergencia", "3 · Urgente", "4 · Menos urgente", "5 · No urgente"];

/** Cierre de la consulta (lo escribe checkout_consulta). */
export const CAMPOS_CHECKOUT: CampoClinico[] = [
  { clave: "diagnostico", etiqueta: "Diagnóstico (CIE-10)", tipo: "cie10" },
  { clave: "plan", etiqueta: "Plan", tipo: "area" },
  { clave: "indicaciones", etiqueta: "Indicaciones al paciente", tipo: "area" },
  { clave: "proxima_cita", etiqueta: "Próxima cita sugerida", tipo: "fecha" },
  { clave: "referido_a", etiqueta: "Referido a" },
];

// Programa Ampliado de Inmunización (RD) y vacunas de uso frecuente en adultos.
export const VACUNAS = [
  "BCG", "Hepatitis B", "Pentavalente", "Polio (IPV)", "Polio (bOPV)", "Rotavirus", "Neumococo", "SRP (sarampión, rubéola, paperas)",
  "DPT", "dT / Td", "Tdap", "Influenza", "VPH", "COVID-19", "Fiebre amarilla", "Varicela", "Hepatitis A", "Antirrábica", "Otra",
];

/** Referimientos (a especialista, para estudios, traslado o respuesta del especialista). */
export const TIPOS_REFERIMIENTO = ["Interconsulta con especialista", "Estudios", "Traslado / internamiento", "Contrarreferencia"];

export const CAMPOS_TIPO: Partial<Record<TipoEntradaClinica, CampoClinico[]>> = {
  vacuna: [
    { clave: "vacuna", etiqueta: "Vacuna", opciones: VACUNAS },
    { clave: "dosis", etiqueta: "Dosis", opciones: ["1.ª", "2.ª", "3.ª", "Refuerzo", "Única", "Anual"] },
    { clave: "fecha_aplicacion", etiqueta: "Fecha de aplicación", tipo: "fecha" },
    { clave: "lote", etiqueta: "Lote" },
    { clave: "via", etiqueta: "Vía", opciones: ["IM", "SC", "ID", "Oral"] },
    { clave: "sitio", etiqueta: "Sitio", placeholder: "Deltoides izquierdo" },
    { clave: "proxima_dosis", etiqueta: "Próxima dosis", tipo: "fecha" },
  ],
  licencia: [
    { clave: "tipo_licencia", etiqueta: "Tipo", opciones: ["Enfermedad común", "Accidente laboral", "Post-quirúrgica", "Maternidad", "Acompañante"] },
    { clave: "reposo", etiqueta: "Reposo", opciones: ["Absoluto", "Relativo"] },
    { clave: "desde", etiqueta: "Desde", tipo: "fecha" },
    { clave: "hasta", etiqueta: "Hasta", tipo: "fecha" },
    { clave: "diagnostico", etiqueta: "Diagnóstico (CIE-10)", tipo: "cie10" },
  ],
  referimiento: [
    { clave: "tipo_referimiento", etiqueta: "Tipo", opciones: TIPOS_REFERIMIENTO },
    { clave: "prioridad", etiqueta: "Prioridad", opciones: ["Normal", "Preferente", "Urgente"] },
    { clave: "destino", etiqueta: "Referido a (especialidad, médico o centro)", placeholder: "Cardiología · Hospital Darío Contreras" },
    { clave: "diagnostico", etiqueta: "Diagnóstico (CIE-10)", tipo: "cie10" },
    { clave: "estudios", etiqueta: "Estudios solicitados", tipo: "area", placeholder: "Hemograma, perfil lipídico, sonografía abdominal…" },
    { clave: "motivo", etiqueta: "Motivo del referimiento", tipo: "area" },
    { clave: "resumen", etiqueta: "Resumen clínico (hallazgos y evolución)", tipo: "area" },
    { clave: "tratamiento", etiqueta: "Tratamiento actual", tipo: "area" },
  ],
  consentimiento: [
    { clave: "procedimiento", etiqueta: "Procedimiento o tratamiento", placeholder: "Colecistectomía laparoscópica" },
    { clave: "beneficios", etiqueta: "Beneficios esperados", tipo: "area" },
    { clave: "riesgos", etiqueta: "Riesgos y complicaciones explicados", tipo: "area" },
    { clave: "alternativas", etiqueta: "Alternativas", tipo: "area" },
    { clave: "responsable", etiqueta: "Firma el paciente o su representante", placeholder: "El propio paciente" },
    { clave: "parentesco", etiqueta: "Parentesco (si es representante)" },
    { clave: "testigo", etiqueta: "Testigo" },
  ],
};

/** Días de una licencia (ambos días incluidos). */
export function diasLicencia(desde?: unknown, hasta?: unknown): number | null {
  if (typeof desde !== "string" || typeof hasta !== "string" || !desde || !hasta) return null;
  const a = new Date(desde + "T12:00:00").getTime();
  const b = new Date(hasta + "T12:00:00").getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Alertas de signos vitales (adultos). Orientativas: avisan, no diagnostican.
 * grave = requiere atención inmediata (avisar al médico).
 */
export function alertasSignos(d: Record<string, unknown>): { texto: string; grave: boolean }[] {
  const n = (k: string) => {
    const v = Number(String(d[k] ?? "").replace(",", "."));
    return d[k] === undefined || d[k] === "" || Number.isNaN(v) ? null : v;
  };
  const a: { texto: string; grave: boolean }[] = [];
  const pa = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(String(d.pa ?? ""));
  if (pa) {
    const [s, di] = [Number(pa[1]), Number(pa[2])];
    if (s >= 180 || di >= 120) a.push({ texto: `Crisis hipertensiva (${s}/${di})`, grave: true });
    else if (s >= 140 || di >= 90) a.push({ texto: `Presión alta (${s}/${di})`, grave: false });
    else if (s < 90) a.push({ texto: `Presión baja (${s}/${di})`, grave: true });
  }
  const fc = n("fc");
  if (fc !== null) {
    if (fc > 120) a.push({ texto: `Taquicardia (${fc} lpm)`, grave: true });
    else if (fc > 100) a.push({ texto: `Taquicardia (${fc} lpm)`, grave: false });
    else if (fc < 50) a.push({ texto: `Bradicardia (${fc} lpm)`, grave: true });
  }
  const fr = n("fr");
  if (fr !== null) {
    if (fr > 24) a.push({ texto: `Respiración rápida (${fr}/min)`, grave: fr > 30 });
    else if (fr < 10) a.push({ texto: `Respiración lenta (${fr}/min)`, grave: true });
  }
  const t = n("temp");
  if (t !== null) {
    if (t >= 39) a.push({ texto: `Fiebre alta (${t} °C)`, grave: true });
    else if (t >= 38) a.push({ texto: `Fiebre (${t} °C)`, grave: false });
    else if (t < 35) a.push({ texto: `Hipotermia (${t} °C)`, grave: true });
  }
  const sat = n("sat");
  if (sat !== null) {
    if (sat < 90) a.push({ texto: `Saturación muy baja (${sat} %)`, grave: true });
    else if (sat < 94) a.push({ texto: `Saturación baja (${sat} %)`, grave: false });
  }
  const g = n("glucosa");
  if (g !== null) {
    if (g < 70) a.push({ texto: `Hipoglucemia (${g} mg/dL)`, grave: true });
    else if (g > 250) a.push({ texto: `Glucosa alta (${g} mg/dL)`, grave: g > 400 });
  }
  return a;
}

/** Balance del control hídrico: ingresos − egresos (ml). */
export function balanceHidrico(d: Record<string, unknown>): number | null {
  const n = (k: string) => Number(d[k] ?? 0) || 0;
  const hay = ["ingreso_oral", "ingreso_iv", "egreso_orina", "egreso_otros"].some((k) => d[k] !== undefined && d[k] !== "");
  return hay ? n("ingreso_oral") + n("ingreso_iv") - n("egreso_orina") - n("egreso_otros") : null;
}

// ── Cabecera clínica del paciente ─────────────────────────────────────────────

export const HABITOS = [
  { clave: "tabaco", etiqueta: "Tabaco" },
  { clave: "alcohol", etiqueta: "Alcohol" },
  { clave: "drogas", etiqueta: "Drogas" },
  { clave: "cafe", etiqueta: "Café" },
  { clave: "hookah", etiqueta: "Hookah / vapeo" },
] as const;
export const NIVELES_HABITO = ["No", "Ocasional", "Frecuente", "Diario", "Lo dejó"] as const;
export type Habitos = Partial<Record<(typeof HABITOS)[number]["clave"], string>>;

export const ANTECEDENTES = [
  { clave: "patologicos", etiqueta: "Personales patológicos", placeholder: "Hipertensión desde 2018, asma…" },
  { clave: "quirurgicos", etiqueta: "Quirúrgicos", placeholder: "Apendicectomía (2010)…" },
  { clave: "traumaticos", etiqueta: "Traumáticos", placeholder: "Fractura de radio (2015)…" },
  { clave: "familiares", etiqueta: "Familiares", placeholder: "Madre diabética, padre con cardiopatía…" },
  { clave: "gineco_obstetricos", etiqueta: "Gineco-obstétricos", placeholder: "G2 P1 C1 A0, FUM…" },
  { clave: "transfusionales", etiqueta: "Transfusionales", placeholder: "Ninguno" },
] as const;
export type Antecedentes = Partial<Record<(typeof ANTECEDENTES)[number]["clave"], string>>;

// Espejo del check pacientes_condiciones_especiales_validas.
export const CONDICIONES = [
  { clave: "embarazo", etiqueta: "Embarazo" },
  { clave: "lactancia", etiqueta: "Lactancia" },
  { clave: "discapacidad", etiqueta: "Discapacidad" },
  { clave: "movilidad_reducida", etiqueta: "Movilidad reducida" },
  { clave: "inmunosuprimido", etiqueta: "Inmunosuprimido" },
  { clave: "dialisis", etiqueta: "Diálisis" },
  { clave: "anticoagulado", etiqueta: "Anticoagulado" },
  { clave: "diabetico", etiqueta: "Diabético" },
  { clave: "hipertenso", etiqueta: "Hipertenso" },
  { clave: "marcapasos", etiqueta: "Marcapasos" },
] as const;
export type Condicion = (typeof CONDICIONES)[number]["clave"];
export const ETIQUETA_CONDICION = Object.fromEntries(CONDICIONES.map((c) => [c.clave, c.etiqueta])) as Record<string, string>;

/** Alergias escritas a mano ("Penicilina, mariscos; látex") → lista. */
export const listaAlergias = (texto?: string | null) =>
  (texto ?? "")
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(ninguna|niega|no conocidas?)$/i.test(x));

/** Hábitos que no son "No" ni están vacíos. */
export const habitosActivos = (h: unknown) =>
  HABITOS.map((x) => ({ ...x, nivel: (h as Habitos | null)?.[x.clave] })).filter((x) => x.nivel && x.nivel !== "No");
