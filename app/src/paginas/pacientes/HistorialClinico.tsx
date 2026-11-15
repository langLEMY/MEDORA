import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ClipboardList,
  FileImage,
  FilePlus2,
  FileSignature,
  FileText,
  HeartPulse,
  Lock,
  NotebookPen,
  Paperclip,
  Pill,
  Plus,
  Printer,
  Reply,
  Search,
  ShieldAlert,
  Stethoscope,
  Syringe,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Esqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { puedeEscribir } from "@/lib/permisos";
import type { Json } from "@/lib/database.types";
import { datos, mensajeError, supabase, type TipoEntradaClinica } from "@/lib/supabase";
import { cn, fecha, fechaHora, relativo } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import {
  alertasSignos,
  balanceHidrico,
  CAMPOS_SIGNOS,
  CAMPOS_TIPO,
  diasLicencia,
  FORMULARIO_POR_CLAVE,
  formularioDisponible,
  FORMULARIOS,
  NIVELES_ESI,
  puntajeEscala,
  type CampoClinico,
} from "./catalogoClinico";
import { NuevaIndicacion } from "./Indicaciones";
import { SelectorCie10 } from "@/components/SelectorCie10";
import { DocumentoClinico, esDocumento, type ItemReceta, type MedicoFirma, type TipoDocumento } from "./DocumentoClinico";
import { ItemsOrden, NuevaOrden, TIPO_ORDEN, useOrdenesPaciente, type OrdenMedica, type TipoOrden } from "./OrdenesMedicas";

const TIPOS: Record<TipoEntradaClinica, { etiqueta: string; tono: Tono }> = {
  consulta: { etiqueta: "Consulta", tono: "marca" },
  evolucion: { etiqueta: "Evolución", tono: "info" },
  diagnostico: { etiqueta: "Diagnóstico", tono: "violeta" },
  receta: { etiqueta: "Receta", tono: "exito" },
  signos_vitales: { etiqueta: "Signos vitales", tono: "aviso" },
  triaje: { etiqueta: "Triaje", tono: "aviso" },
  laboratorio: { etiqueta: "Laboratorio", tono: "info" },
  imagen: { etiqueta: "Imagen", tono: "info" },
  procedimiento: { etiqueta: "Procedimiento", tono: "violeta" },
  nutricion: { etiqueta: "Nutrición", tono: "exito" },
  anestesia: { etiqueta: "Anestesia", tono: "peligro" },
  psicologia: { etiqueta: "Psicología", tono: "violeta" },
  certificado: { etiqueta: "Certificado", tono: "info" },
  referimiento: { etiqueta: "Referimiento", tono: "marca" },
  orden: { etiqueta: "Orden médica", tono: "aviso" },
  anexo: { etiqueta: "Adjunto", tono: "neutro" },
  adenda: { etiqueta: "Adenda", tono: "neutro" },
  formulario: { etiqueta: "Formulario", tono: "marca" },
  vacuna: { etiqueta: "Vacuna", tono: "exito" },
  licencia: { etiqueta: "Licencia médica", tono: "info" },
  consentimiento: { etiqueta: "Consentimiento", tono: "violeta" },
};

// Campos estructurados de cada tipo (se guardan en historial_clinico.datos).
const CAMPOS: Partial<Record<TipoEntradaClinica, CampoClinico[]>> = {
  // Todo diagnóstico se codifica con la CIE-10 (como lo exige Salud Pública).
  consulta: [{ clave: "diagnostico", etiqueta: "Diagnóstico (CIE-10)", tipo: "cie10" }],
  diagnostico: [
    { clave: "diagnostico", etiqueta: "Diagnóstico principal (CIE-10)", tipo: "cie10" },
    { clave: "diagnostico_2", etiqueta: "Diagnóstico secundario (CIE-10)", tipo: "cie10" },
    { clave: "tipo_dx", etiqueta: "Tipo", opciones: ["Presuntivo", "Definitivo"] },
  ],
  signos_vitales: CAMPOS_SIGNOS,
  nutricion: [
    { clave: "peso", etiqueta: "Peso (kg)", tipo: "numero" },
    { clave: "talla", etiqueta: "Talla (cm)", tipo: "numero" },
    { clave: "cintura", etiqueta: "Circ. abdominal (cm)", tipo: "numero" },
    { clave: "grasa", etiqueta: "Grasa corporal (%)", tipo: "numero" },
    { clave: "kcal", etiqueta: "Requerimiento (kcal/día)", tipo: "numero" },
    { clave: "dx_nutricional", etiqueta: "Diagnóstico nutricional (CIE-10)", tipo: "cie10" },
    { clave: "plan", etiqueta: "Plan alimentario", tipo: "area" },
  ],
  anestesia: [
    { clave: "asa", etiqueta: "Clasificación ASA", opciones: ["I", "II", "III", "IV", "V", "VI", "I-E", "II-E", "III-E", "IV-E", "V-E"] },
    { clave: "tipo_anestesia", etiqueta: "Tipo de anestesia", opciones: ["General", "Regional (raquídea)", "Regional (epidural)", "Bloqueo periférico", "Sedación", "Local"] },
    { clave: "mallampati", etiqueta: "Mallampati", opciones: ["I", "II", "III", "IV"] },
    { clave: "ayuno", etiqueta: "Ayuno (horas)", tipo: "numero" },
    { clave: "via_aerea", etiqueta: "Vía aérea", placeholder: "Tubo orotraqueal 7.5" },
    { clave: "aldrete", etiqueta: "Aldrete al egreso (0–10)", tipo: "numero" },
    { clave: "farmacos", etiqueta: "Fármacos y dosis", tipo: "area" },
    { clave: "eventos", etiqueta: "Eventos / complicaciones", tipo: "area" },
  ],
  psicologia: [
    { clave: "motivo", etiqueta: "Motivo de consulta", tipo: "area" },
    { clave: "estado_mental", etiqueta: "Examen del estado mental", tipo: "area" },
    { clave: "impresion", etiqueta: "Impresión diagnóstica (CIE-10)", tipo: "cie10" },
    { clave: "plan", etiqueta: "Plan terapéutico", tipo: "area" },
    { clave: "proxima_sesion", etiqueta: "Próxima sesión", tipo: "fecha" },
  ],
  ...CAMPOS_TIPO,
};
// Triaje = signos vitales + nivel de prioridad (ESI), útil sobre todo en emergencia.
CAMPOS.triaje = [{ clave: "nivel", etiqueta: "Prioridad (ESI)", opciones: NIVELES_ESI }, ...CAMPOS_SIGNOS];

/** Campos de una entrada: los del formulario del catálogo o los de su tipo. */
const camposDe = (tipo: TipoEntradaClinica, formulario?: unknown): CampoClinico[] =>
  tipo === "formulario" ? (FORMULARIO_POR_CLAVE[String(formulario ?? "")]?.campos ?? []) : (CAMPOS[tipo] ?? []);

const ETIQUETAS_CAMPO: Record<string, string> = Object.fromEntries(
  [...Object.values(CAMPOS).flatMap((cs) => cs ?? []), ...FORMULARIOS.flatMap((f) => f.campos)].map((c) => [c.clave, c.etiqueta]),
);
ETIQUETAS_CAMPO.imc = "IMC";
ETIQUETAS_CAMPO.numero = "No. de orden";
ETIQUETAS_CAMPO.proveedor = "Proveedor";
ETIQUETAS_CAMPO.diagnostico = "Diagnóstico";
ETIQUETAS_CAMPO.proxima_cita = "Próxima cita";
ETIQUETAS_CAMPO.referido_a = "Referido a";
ETIQUETAS_CAMPO.indicaciones = "Indicaciones";
ETIQUETAS_CAMPO.nivel = "Prioridad (ESI)";

// Claves internas que nunca se muestran como dato suelto.
const OCULTOS = new Set(["archivos", "items", "medico", "formulario", "orden_id", "tipo_orden", "indicacion_id", "puntaje", "riesgo"]);

interface Archivo {
  ruta: string;
  nombre: string;
  tipo: string;
  tamano: number;
}

export interface EntradaClinica {
  id: string;
  tipo: TipoEntradaClinica;
  titulo: string | null;
  contenido: string;
  datos: Record<string, unknown>;
  corrige_a: string | null;
  creado_en: string;
  autor: { nombre_completo: string } | null;
}

/** Lo que se quiere crear desde el catálogo. */
export type AccionClinica = { tipo: TipoEntradaClinica; formulario?: string; campos?: Record<string, string> } | { orden: TipoOrden } | { indicacion: true };

function imc(peso?: unknown, talla?: unknown) {
  const p = Number(peso);
  const t = Number(talla) / 100;
  if (!p || !t) return null;
  const v = p / (t * t);
  const clase = v < 18.5 ? "Bajo peso" : v < 25 ? "Normal" : v < 30 ? "Sobrepeso" : "Obesidad";
  return { valor: v.toFixed(1), clase };
}

/** Nombre visible de una entrada (el formulario del catálogo si lo es). */
export const nombreEntrada = (e: Pick<EntradaClinica, "tipo" | "datos">) =>
  e.tipo === "formulario" ? (FORMULARIO_POR_CLAVE[String(e.datos?.formulario ?? "")]?.nombre ?? (e.datos?.formulario === "checkout" ? "Checkout de la consulta" : "Formulario")) : TIPOS[e.tipo].etiqueta;

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function useHistorial(pacienteId: string) {
  const { sistemaId } = useSistema();
  return useQuery({
    queryKey: ["historial", sistemaId, pacienteId],
    queryFn: async () =>
      datos(
        await supabase
          .from("historial_clinico")
          .select("id, tipo, titulo, contenido, datos, corrige_a, creado_en, autor:perfiles!historial_autor_perfil_fk(nombre_completo)")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", pacienteId)
          .order("creado_en", { ascending: false }),
      ) as unknown as EntradaClinica[],
  });
}

/**
 * Historia clínica append-only: nada se edita ni se borra (lo impide Postgres).
 * Una corrección es una "adenda" enlazada a la entrada original. Las notas de
 * psicología solo las ve psicología (política RLS). A la izquierda, el catálogo de
 * todo lo que se puede registrar; a la derecha, la línea de tiempo por mes.
 */
export function HistorialClinico({ pacienteId, pacienteNombre, documento }: { pacienteId: string; pacienteNombre?: string; documento?: string | null }) {
  const { roles } = useSistema();
  const [nueva, setNueva] = useState<{ corrige?: EntradaClinica; inicial?: { tipo: TipoEntradaClinica; formulario?: string; campos?: Record<string, string> } } | null>(null);
  const [orden, setOrden] = useState<TipoOrden | null>(null);
  const [indicacion, setIndicacion] = useState(false);
  const [selector, setSelector] = useState(false);
  const [filtro, setFiltro] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [imprimir, setImprimir] = useState(false);

  const q = useHistorial(pacienteId);
  const ordenes = useOrdenesPaciente(pacienteId);
  const porOrden = useMemo(() => new Map((ordenes.data ?? []).map((o) => [o.id, o])), [ordenes.data]);

  const escribir = puedeEscribir.historial(roles);
  const porRaiz = useMemo(() => {
    const m = new Map<string, EntradaClinica[]>();
    for (const e of q.data ?? []) if (e.corrige_a) m.set(e.corrige_a, [...(m.get(e.corrige_a) ?? []), e]);
    return m;
  }, [q.data]);
  const adendas = (id: string) => porRaiz.get(id) ?? [];
  const raiz = useMemo(() => q.data?.filter((e) => !e.corrige_a) ?? [], [q.data]);
  const presentes = useMemo(() => [...new Set(raiz.map((e) => e.tipo))], [raiz]);

  const visibles = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    return raiz.filter((e) => {
      if (filtro !== "todos" && e.tipo !== filtro) return false;
      if (!t) return true;
      const pajar = [
        e.titulo,
        e.contenido,
        nombreEntrada(e),
        e.autor?.nombre_completo,
        ...Object.values(e.datos ?? {}).flatMap((v) => (typeof v === "string" || typeof v === "number" ? [String(v)] : Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? String((x as { nombre?: string }).nombre ?? "") : String(x))) : [])),
        ...(porRaiz.get(e.id) ?? []).map((a) => a.contenido),
      ]
        .filter(Boolean)
        .join(" ");
      return sinTildes(pajar).includes(t);
    });
  }, [raiz, filtro, busqueda, porRaiz]);

  // Agrupadas por mes (la línea de tiempo del portal clínico).
  const meses = useMemo(() => {
    const g = new Map<string, EntradaClinica[]>();
    for (const e of visibles) {
      const k = e.creado_en.slice(0, 7);
      g.set(k, [...(g.get(k) ?? []), e]);
    }
    return [...g.entries()];
  }, [visibles]);

  const accion = (a: AccionClinica) => {
    setSelector(false);
    if ("orden" in a) setOrden(a.orden);
    else if ("indicacion" in a) setIndicacion(true);
    else setNueva({ inicial: a });
  };

  return (
    <div className={cn("grid gap-5", escribir && "lg:grid-cols-[17rem_minmax(0,1fr)]")}>
      {escribir && (
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <CatalogoClinico onElegir={accion} />
          </div>
        </aside>
      )}

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-3" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el historial: diagnóstico, medicamento, médico…"
              aria-label="Buscar en el historial"
              className="h-9 w-full rounded-[10px] border border-borde bg-superficie pr-8 pl-9 text-sm outline-none transition-colors placeholder:text-texto-3 focus:border-marca"
            />
            {busqueda && (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda("")} className="absolute top-1/2 right-2 -translate-y-1/2 text-texto-3 hover:text-texto">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Boton variante="secundario" icono={<Printer className="size-4" />} disabled={!visibles.length} onClick={() => setImprimir(true)}>
            Imprimir
          </Boton>
          {escribir && (
            <Boton className="lg:hidden" icono={<FilePlus2 className="size-4" />} onClick={() => setSelector(true)}>
              Nueva entrada
            </Boton>
          )}
        </div>

        {presentes.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-1">
            {(["todos", ...presentes] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFiltro(t)}
                className={cn("relative h-7 rounded-full px-3 text-xs font-medium transition-colors", filtro === t ? "text-marca-texto" : "text-texto-2 hover:text-texto")}
              >
                {filtro === t && <motion.span layoutId="filtro-historial" className="absolute inset-0 rounded-full bg-marca-suave" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />}
                <span className="relative">{t === "todos" ? "Todo" : TIPOS[t as TipoEntradaClinica].etiqueta}</span>
              </button>
            ))}
            <p className="ml-auto flex items-center gap-1.5 text-xs text-texto-3">
              <Lock className="size-3.5" /> Las correcciones se agregan como adendas.
            </p>
          </div>
        )}

        {q.isLoading ? (
          <div className="space-y-3">{[0, 1].map((i) => <Esqueleto key={i} className="h-32 rounded-2xl" />)}</div>
        ) : visibles.length === 0 ? (
          <Tarjeta>
            <Vacio
              icono={busqueda ? <Search /> : <NotebookPen />}
              titulo={busqueda ? "Nada coincide con la búsqueda" : "Historia clínica vacía"}
              descripcion={busqueda ? "Prueba con otra palabra o quita el filtro." : "Consultas, formularios, órdenes, vacunas y documentos aparecerán aquí en orden cronológico."}
            />
          </Tarjeta>
        ) : (
          <div className="space-y-6">
            {meses.map(([mes, entradas]) => (
              <section key={mes}>
                <h3 className="sticky top-0 z-10 mb-3 inline-flex rounded-full border border-borde bg-superficie/90 px-3 py-1 text-xs font-semibold text-texto-2 capitalize backdrop-blur">
                  {new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric" }).format(new Date(mes + "-15T12:00:00"))}
                  <span className="ml-1.5 font-normal text-texto-3">· {entradas.length}</span>
                </h3>
                <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-borde">
                  <AnimatePresence initial={false}>
                    {entradas.map((e) => (
                      <motion.li
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
                        className="relative pl-11"
                      >
                        <span className="absolute top-4 left-2 size-[15px] rounded-full border-[3px] border-superficie bg-marca shadow-sm" />
                        <Tarjeta className="p-5">
                          <EntradaVista e={e} paciente={pacienteNombre} documento={documento} orden={porOrden.get(String(e.datos?.orden_id ?? ""))} pacienteId={pacienteId} />
                          {adendas(e.id).map((a) => (
                            <div key={a.id} className="mt-4 rounded-xl border border-dashed border-borde-fuerte bg-superficie-2/50 p-4">
                              <EntradaVista e={a} paciente={pacienteNombre} documento={documento} pacienteId={pacienteId} />
                            </div>
                          ))}
                          {escribir && (e.tipo !== "psicologia" || puedeEscribir.psicologia(roles)) && (
                            <button onClick={() => setNueva({ corrige: e })} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-texto-3 transition-colors hover:text-texto">
                              <Reply className="size-3.5" /> Agregar adenda
                            </button>
                          )}
                        </Tarjeta>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>

      <NuevaEntrada abierto={!!nueva} corrige={nueva?.corrige} inicial={nueva?.inicial} pacienteId={pacienteId} onCerrar={() => setNueva(null)} />
      <NuevaOrden tipo={orden} pacienteId={pacienteId} onCerrar={() => setOrden(null)} />
      <NuevaIndicacion abierto={indicacion} pacienteId={pacienteId} onCerrar={() => setIndicacion(false)} />
      <Modal abierto={selector} onCerrar={() => setSelector(false)} titulo="¿Qué quieres registrar?" ancho="md">
        <CatalogoClinico onElegir={accion} plano />
      </Modal>
      <ImprimirHistorial abierto={imprimir} onCerrar={() => setImprimir(false)} entradas={visibles} adendas={adendas} paciente={pacienteNombre ?? "Paciente"} documento={documento} filtrado={!!busqueda || filtro !== "todos"} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Catálogo: todo lo que se puede registrar en el expediente                */
/* ------------------------------------------------------------------------ */

interface ItemCatalogo {
  etiqueta: string;
  accion: AccionClinica;
}

function CatalogoClinico({ onElegir, plano }: { onElegir: (a: AccionClinica) => void; plano?: boolean }) {
  const { roles } = useSistema();
  const { capacidades } = useSesion();
  // Sin sede resuelta no se oculta nada (mismo criterio que el menú).
  const conInternamiento = !capacidades || Object.keys(capacidades).length === 0 || capacidades.internamiento === true;
  const [filtro, setFiltro] = useState("");
  const [cerrados, setCerrados] = useState<Set<string>>(new Set(["Formularios", "Enfermería"]));

  const grupos = useMemo(() => {
    const g: { titulo: string; icono: LucideIcon; items: ItemCatalogo[] }[] = [
      {
        titulo: "Notas clínicas",
        icono: NotebookPen,
        items: [
          { etiqueta: "Consulta", accion: { tipo: "consulta" } },
          { etiqueta: "Evolución", accion: { tipo: "evolucion" } },
          { etiqueta: "Diagnóstico", accion: { tipo: "diagnostico" } },
          { etiqueta: "Triaje", accion: { tipo: "triaje" } },
          { etiqueta: "Procedimiento (nota)", accion: { tipo: "procedimiento" } },
          { etiqueta: "Nutrición", accion: { tipo: "nutricion" } },
          { etiqueta: "Anestesia", accion: { tipo: "anestesia" } },
          ...(puedeEscribir.psicologia(roles) ? [{ etiqueta: "Psicología (confidencial)", accion: { tipo: "psicologia" as const } }] : []),
        ],
      },
      {
        titulo: "Formularios",
        icono: ClipboardList,
        items: FORMULARIOS.filter((f) => f.grupo === "clinicos" && formularioDisponible(f, capacidades)).map((f) => ({ etiqueta: f.nombre, accion: { tipo: "formulario", formulario: f.clave } })),
      },
      {
        titulo: "Enfermería",
        icono: HeartPulse,
        items: [
          { etiqueta: "Signos vitales", accion: { tipo: "signos_vitales" } },
          ...FORMULARIOS.filter((f) => f.grupo === "enfermeria" && formularioDisponible(f, capacidades)).map((f) => ({ etiqueta: f.nombre, accion: { tipo: "formulario" as const, formulario: f.clave } })),
        ],
      },
      {
        titulo: "Órdenes médicas",
        icono: Stethoscope,
        items: [
          { etiqueta: "Receta", accion: { tipo: "receta" } },
          ...(puedeEscribir.indicar(roles) && conInternamiento ? [{ etiqueta: "Indicación de medicamento (Kardex)", accion: { indicacion: true as const } }] : []),
          ...(puedeEscribir.ordenar(roles)
            ? (["laboratorio", "imagen", "procedimiento"] as TipoOrden[]).map((t) => ({ etiqueta: `Orden de ${TIPO_ORDEN[t].etiqueta.toLowerCase()}`, accion: { orden: t } }))
            : []),
          { etiqueta: "Resultado de laboratorio (adjunto)", accion: { tipo: "laboratorio" } },
          { etiqueta: "Resultado de imágenes (adjunto)", accion: { tipo: "imagen" } },
        ],
      },
      { titulo: "Vacunas", icono: Syringe, items: [{ etiqueta: "Aplicar vacuna", accion: { tipo: "vacuna" } }] },
      {
        titulo: "Documentos",
        icono: FileText,
        items: [
          { etiqueta: "Certificado médico", accion: { tipo: "certificado" } },
          { etiqueta: "Licencia médica", accion: { tipo: "licencia" } },
          { etiqueta: "Referimiento a especialista", accion: { tipo: "referimiento", campos: { tipo_referimiento: "Interconsulta con especialista" } } },
          { etiqueta: "Referimiento de estudios", accion: { tipo: "referimiento", campos: { tipo_referimiento: "Estudios" } } },
          { etiqueta: "Adjuntos adicionales", accion: { tipo: "anexo" } },
        ],
      },
      { titulo: "Consentimientos", icono: FileSignature, items: [{ etiqueta: "Consentimiento informado", accion: { tipo: "consentimiento" } }] },
    ];
    const t = sinTildes(filtro.trim());
    return g.map((x) => ({ ...x, items: t ? x.items.filter((i) => sinTildes(i.etiqueta).includes(t)) : x.items })).filter((x) => x.items.length);
  }, [roles, filtro, capacidades, conInternamiento]);

  const alternar = (t: string) =>
    setCerrados((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const cuerpo = (
    <>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-texto-3" />
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar formulario…"
          aria-label="Buscar formulario"
          className="h-8 w-full rounded-lg border border-borde bg-superficie-2/60 pr-2 pl-8 text-xs outline-none placeholder:text-texto-3 focus:border-marca"
        />
      </div>
      <div className="space-y-1">
        {grupos.map((g) => {
          const abierto = !!filtro || !cerrados.has(g.titulo);
          return (
            <div key={g.titulo}>
              <button
                type="button"
                onClick={() => alternar(g.titulo)}
                aria-expanded={abierto}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] font-semibold text-texto transition-colors hover:bg-superficie-2"
              >
                <g.icono className="size-4 text-marca" />
                <span className="flex-1">{g.titulo}</span>
                <span className="text-[0.6875rem] font-normal text-texto-3">{g.items.length}</span>
                <ChevronDown className={cn("size-3.5 text-texto-3 transition-transform duration-200", !abierto && "-rotate-90")} />
              </button>
              <AnimatePresence initial={false}>
                {abierto && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="overflow-hidden"
                  >
                    {g.items.map((i) => (
                      <li key={i.etiqueta}>
                        <button
                          type="button"
                          onClick={() => onElegir(i.accion)}
                          className="group flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 pl-8 text-left text-[0.8125rem] text-texto-2 transition-colors hover:bg-marca-suave hover:text-marca-texto"
                        >
                          <span className="flex-1">{i.etiqueta}</span>
                          <Plus className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </>
  );

  return plano ? cuerpo : <Tarjeta className="max-h-[calc(100vh-6rem)] overflow-y-auto p-3">{cuerpo}</Tarjeta>;
}

/* ------------------------------------------------------------------------ */
/* Una entrada de la línea de tiempo                                        */
/* ------------------------------------------------------------------------ */

function EntradaVista({ e, paciente, documento, orden, pacienteId }: { e: EntradaClinica; paciente?: string; documento?: string | null; orden?: OrdenMedica; pacienteId: string }) {
  const [imprimir, setImprimir] = useState(false);
  const items = (e.datos?.items as ItemReceta[] | undefined) ?? [];
  const medico = (e.datos?.medico as MedicoFirma | undefined) ?? (e.autor ? { nombre: e.autor.nombre_completo } : null);
  const imprimible = esDocumento(e.tipo, e.datos);
  const archivos = (e.datos?.archivos as Archivo[] | undefined) ?? [];
  const definicion = camposDe(e.tipo, e.datos?.formulario);
  const esArea = (k: string) => definicion.some((c) => c.clave === k && (c.tipo === "area" || c.tipo === "cie10")) || ["plan", "indicaciones"].includes(k);
  const esFecha = (k: string) => definicion.some((c) => c.clave === k && c.tipo === "fecha") || k === "proxima_cita";
  const valores = Object.entries(e.datos ?? {}).filter(([k, v]) => !OCULTOS.has(k) && v !== "" && v !== null && v !== undefined && typeof v !== "object");
  const cortos = valores.filter(([k]) => !esArea(k));
  const largos = valores.filter(([k]) => esArea(k));
  const indice = e.tipo === "nutricion" || e.tipo === "signos_vitales" || e.tipo === "triaje" || e.datos?.formulario === "curva_crecimiento" ? imc(e.datos.peso, e.datos.talla) : null;
  const dias = e.tipo === "licencia" ? diasLicencia(e.datos.desde, e.datos.hasta) : null;
  const balance = e.datos?.formulario === "control_hidrico" ? balanceHidrico(e.datos) : null;
  const escala = e.tipo === "formulario" ? puntajeEscala(FORMULARIO_POR_CLAVE[String(e.datos?.formulario ?? "")], e.datos ?? {}) : null;
  const alertas = e.tipo === "signos_vitales" || e.tipo === "triaje" ? alertasSignos(e.datos ?? {}) : [];
  // Una orden estructurada muestra sus pruebas con el estado actual; no repite el texto.
  const esOrdenViva = e.tipo === "orden" && !!orden;

  const abrir = async (a: Archivo) => {
    const { data, error } = await supabase.storage.from("anexos-clinicos").createSignedUrl(a.ruta, 120);
    if (error || !data) return toast.error("No se pudo abrir el archivo.");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={TIPOS[e.tipo].tono}>{nombreEntrada(e)}</Insignia>
        {e.tipo === "psicologia" && (
          <Insignia tono="peligro">
            <ShieldAlert className="size-3" /> Confidencial
          </Insignia>
        )}
        {e.titulo && e.titulo !== nombreEntrada(e) && <span className="text-sm font-semibold">{e.titulo}</span>}
        <span className="ml-auto text-xs text-texto-3" title={fechaHora(e.creado_en)}>
          {e.autor?.nombre_completo} · {relativo(e.creado_en)}
        </span>
      </div>
      {alertas.length > 0 && <AlertasSignos alertas={alertas} />}
      {(cortos.length > 0 || indice || dias || balance !== null) && !esOrdenViva && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cortos.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-superficie-2 px-3 py-2">
              <div className="text-[0.6875rem] text-texto-3">{ETIQUETAS_CAMPO[k] ?? k}</div>
              <div className="text-sm font-semibold tabular">{esFecha(k) ? fecha(String(v)) : String(v).replace(/\s*\(\d+\)$/, "")}</div>
            </div>
          ))}
          {escala && <Destacado etiqueta={`Puntaje${escala.completo ? "" : " (incompleto)"}`} valor={`${escala.total} · ${escala.etiqueta}`} />}
          {indice && <Destacado etiqueta="IMC" valor={`${indice.valor} · ${indice.clase}`} />}
          {dias && <Destacado etiqueta="Días de licencia" valor={`${dias} ${dias === 1 ? "día" : "días"}`} />}
          {balance !== null && <Destacado etiqueta="Balance hídrico" valor={`${balance > 0 ? "+" : ""}${balance} ml`} />}
        </div>
      )}
      {esOrdenViva && (
        <>
          {(orden.proveedor || orden.diagnostico) && (
            <p className="mt-2 text-xs text-texto-3">
              <span className="font-mono">{orden.numero}</span>
              {orden.proveedor && <> · Proveedor: {orden.proveedor}</>}
              {orden.diagnostico && <> · Diagnóstico: {orden.diagnostico}</>}
            </p>
          )}
          <ItemsOrden orden={orden} pacienteId={pacienteId} compacto />
          {orden.indicaciones && <p className="mt-3 text-sm whitespace-pre-wrap text-texto-2">{orden.indicaciones}</p>}
        </>
      )}
      {largos.map(([k, v]) => (
        <div key={k} className="mt-3">
          <p className="text-[0.6875rem] font-medium text-texto-3">{ETIQUETAS_CAMPO[k] ?? k}</p>
          <p className="text-sm whitespace-pre-wrap">{String(v)}</p>
        </div>
      ))}
      {items.length > 0 && !esOrdenViva && (
        <ol className="mt-3 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <Pill className="mt-0.5 size-3.5 shrink-0 text-marca" />
              <span>
                <b className="font-medium">{it.nombre}</b>
                {it.detalle ? ` — ${it.detalle}` : ""}
                {it.indicaciones ? <span className="text-texto-3"> · {it.indicaciones}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
      {e.contenido && !esOrdenViva && !(e.tipo === "orden" && items.length && e.contenido === items.map((i) => i.nombre).join("\n")) && (
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-texto">{e.contenido}</p>
      )}
      {archivos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {archivos.map((a) => (
            <button
              key={a.ruta}
              onClick={() => void abrir(a)}
              className="inline-flex items-center gap-2 rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-left text-xs transition-colors hover:border-borde-fuerte"
            >
              {a.tipo.startsWith("image/") ? <FileImage className="size-4 text-texto-3" /> : <FileText className="size-4 text-texto-3" />}
              <span className="max-w-48 truncate font-medium">{a.nombre}</span>
              <span className="text-texto-3">{(a.tamano / 1024 / 1024).toFixed(1)} MB</span>
            </button>
          ))}
        </div>
      )}
      {imprimible && (
        <button onClick={() => setImprimir(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-marca-texto transition-colors hover:underline">
          <Printer className="size-3.5" /> Imprimir
        </button>
      )}
      {imprimible && (
        <DocumentoClinico
          abierto={imprimir}
          onCerrar={() => setImprimir(false)}
          tipo={e.tipo as TipoDocumento}
          titulo={e.titulo}
          contenido={e.contenido}
          items={orden ? orden.items.filter((i) => i.estado !== "cancelada").map((i) => ({ nombre: i.descripcion })) : items}
          medico={medico}
          paciente={paciente ?? "Paciente"}
          documentoPaciente={documento}
          fechaEntrada={e.creado_en}
          datos={e.datos}
        />
      )}
    </>
  );
}

/** Valores de signos fuera de rango (orientativo; lo grave pide avisar al médico). */
export function AlertasSignos({ alertas }: { alertas: { texto: string; grave: boolean }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {alertas.map((a) => (
        <Insignia key={a.texto} tono={a.grave ? "peligro" : "aviso"}>
          {a.grave && <ShieldAlert className="size-3" />} {a.texto}
        </Insignia>
      ))}
    </div>
  );
}

function Destacado({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg bg-marca-suave px-3 py-2">
      <div className="text-[0.6875rem] text-marca-texto">{etiqueta}</div>
      <div className="text-sm font-semibold text-marca-texto tabular">{valor}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Historial impreso (lo filtrado o todo)                                   */
/* ------------------------------------------------------------------------ */

function ImprimirHistorial({
  abierto,
  onCerrar,
  entradas,
  adendas,
  paciente,
  documento,
  filtrado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  entradas: EntradaClinica[];
  adendas: (id: string) => EntradaClinica[];
  paciente: string;
  documento?: string | null;
  filtrado: boolean;
}) {
  if (!abierto) return null;
  const linea = (e: EntradaClinica) => {
    const campos = Object.entries(e.datos ?? {})
      .filter(([k, v]) => !OCULTOS.has(k) && v !== "" && v !== null && v !== undefined && typeof v !== "object")
      .map(([k, v]) => `${ETIQUETAS_CAMPO[k] ?? k}: ${v}`);
    const items = ((e.datos?.items as ItemReceta[] | undefined) ?? []).map((i) => `• ${i.nombre}${i.detalle ? ` — ${i.detalle}` : ""}${i.indicaciones ? ` (${i.indicaciones})` : ""}`);
    return { campos, items };
  };
  return (
    <Documento abierto onCerrar={onCerrar} titulo="Historial clínico" nombreArchivo={`Historial clínico ${paciente}`}>
      <EncabezadoDocumento titulo="Historial clínico" subtitulo={filtrado ? "Selección filtrada" : `${entradas.length} entradas`} />
      <p className="mb-4">
        <span className="text-[#475467]">Paciente:</span> <b>{paciente}</b>
        {documento && <span className="text-[#475467]"> · {documento}</span>}
      </p>
      <div className="space-y-4">
        {entradas.map((e) => {
          const { campos, items } = linea(e);
          return (
            <div key={e.id} className="break-inside-avoid border-b border-[#d0d5dd] pb-3">
              <p className="font-semibold">
                {nombreEntrada(e)}
                {e.titulo && e.titulo !== nombreEntrada(e) ? ` — ${e.titulo}` : ""}
              </p>
              <p className="text-[0.75rem] text-[#475467]">
                {fechaHora(e.creado_en)} · {e.autor?.nombre_completo ?? ""}
              </p>
              {campos.length > 0 && <p className="mt-1 text-[0.8125rem]">{campos.join(" · ")}</p>}
              {items.length > 0 && <p className="mt-1 text-[0.8125rem] whitespace-pre-wrap">{items.join("\n")}</p>}
              {e.contenido && <p className="mt-1 text-[0.8125rem] whitespace-pre-wrap">{e.contenido}</p>}
              {adendas(e.id).map((a) => (
                <p key={a.id} className="mt-1 border-l-2 border-[#98a2b3] pl-2 text-[0.8125rem] whitespace-pre-wrap">
                  Adenda ({fechaHora(a.creado_en)}, {a.autor?.nombre_completo}): {a.contenido}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </Documento>
  );
}

/* ------------------------------------------------------------------------ */
/* Nueva entrada (o adenda)                                                 */
/* ------------------------------------------------------------------------ */

const CON_ADJUNTOS: TipoEntradaClinica[] = ["anexo", "laboratorio", "imagen", "consentimiento"];
const DOCUMENTOS_FIRMADOS: TipoEntradaClinica[] = ["receta", "certificado", "referimiento", "orden", "licencia", "consentimiento", "formulario"];

export function NuevaEntrada({
  abierto,
  corrige,
  inicial,
  pacienteId,
  onCerrar,
}: {
  abierto: boolean;
  corrige?: EntradaClinica;
  inicial?: { tipo: TipoEntradaClinica; formulario?: string; campos?: Record<string, string> };
  pacienteId: string;
  onCerrar: () => void;
}) {
  const { sistemaId, roles } = useSistema();
  const { perfil, capacidades } = useSesion();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoEntradaClinica>("consulta");
  const [formulario, setFormulario] = useState<string>(FORMULARIOS[0].clave);
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemReceta[]>([{ nombre: "", detalle: "", indicaciones: "" }]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [abiertoCon, setAbiertoCon] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Al abrir desde el catálogo, empezar en ese tipo/formulario.
  const claveApertura = abierto ? `${inicial?.tipo ?? ""}:${inicial?.formulario ?? ""}:${corrige?.id ?? ""}` : null;
  if (claveApertura !== abiertoCon) {
    setAbiertoCon(claveApertura);
    if (abierto && inicial) {
      setTipo(inicial.tipo);
      if (inicial.formulario) setFormulario(inicial.formulario);
      setCampos(inicial.campos ?? {});
    }
  }

  const tipoEfectivo = corrige ? "adenda" : tipo;
  const definicion = corrige ? [] : camposDe(tipoEfectivo, formulario);
  const indice = imc(campos.peso, campos.talla);
  const dias = tipoEfectivo === "licencia" ? diasLicencia(campos.desde, campos.hasta) : null;
  const balance = tipoEfectivo === "formulario" && formulario === "control_hidrico" ? balanceHidrico(campos) : null;
  const defForm = tipoEfectivo === "formulario" ? FORMULARIO_POR_CLAVE[formulario] : undefined;
  const escala = puntajeEscala(defForm, campos);
  const alertas = tipoEfectivo === "signos_vitales" || tipoEfectivo === "triaje" ? alertasSignos(campos) : [];
  const formulariosSede = FORMULARIOS.filter((f) => formularioDisponible(f, capacidades) || f.clave === formulario);
  const tiposDisponibles = (Object.keys(TIPOS) as TipoEntradaClinica[]).filter(
    // Las órdenes nuevas van por el formulario estructurado (crear_orden_medica).
    (k) => k !== "adenda" && k !== "orden" && (k !== "psicologia" || puedeEscribir.psicologia(roles)),
  );

  const reiniciar = () => {
    setTitulo("");
    setContenido("");
    setCampos({});
    setItems([{ nombre: "", detalle: "", indicaciones: "" }]);
    setArchivos([]);
    setProgreso(null);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const subidos: Archivo[] = [];
      for (const [i, f] of archivos.entries()) {
        setProgreso(`Subiendo ${i + 1} de ${archivos.length}…`);
        const ruta = `${sistemaId}/${pacienteId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error } = await supabase.storage.from("anexos-clinicos").upload(ruta, f, { contentType: f.type });
        if (error) throw new Error(`No se pudo subir ${f.name}: ${error.message}`);
        subidos.push({ ruta, nombre: f.name, tipo: f.type, tamano: f.size });
      }
      setProgreso(null);
      const valores: Record<string, unknown> = Object.fromEntries(Object.entries(campos).filter(([, v]) => v.trim() !== ""));
      if (indice && (tipoEfectivo === "nutricion" || formulario === "curva_crecimiento")) valores.imc = indice.valor;
      if (tipoEfectivo === "formulario") valores.formulario = formulario;
      if (escala) {
        valores.puntaje = escala.total;
        valores.riesgo = escala.etiqueta;
      }
      // Receta: renglones estructurados. Documentos: foto del médico que firma (nombre/especialidad/exequátur).
      const itemsLimpios = items.map((i) => ({ nombre: i.nombre.trim(), detalle: i.detalle?.trim() || undefined, indicaciones: i.indicaciones?.trim() || undefined })).filter((i) => i.nombre);
      if (tipoEfectivo === "receta" && itemsLimpios.length) valores.items = itemsLimpios;
      if (DOCUMENTOS_FIRMADOS.includes(tipoEfectivo)) {
        const { data: mem } = await supabase.from("membresias").select("especialidad, exequatur").eq("sistema_id", sistemaId).eq("usuario_id", u.user!.id).maybeSingle();
        valores.medico = { nombre: perfil?.nombre_completo ?? "", especialidad: mem?.especialidad ?? undefined, exequatur: mem?.exequatur ?? undefined };
      }
      const resumen =
        tipoEfectivo === "vacuna"
          ? [campos.vacuna, campos.dosis && `dosis ${campos.dosis}`].filter(Boolean).join(", ")
          : tipoEfectivo === "licencia" && dias
            ? `Licencia de ${dias} ${dias === 1 ? "día" : "días"}${campos.diagnostico ? ` por ${campos.diagnostico}` : ""}`
            : tipoEfectivo === "consentimiento"
              ? `Consentimiento para ${campos.procedimiento || "procedimiento"}`
              : defForm
                ? defForm.nombre
                : "";
      const texto = contenido.trim() || (subidos.length ? `Adjunto: ${subidos.map((s) => s.nombre).join(", ")}` : resumen || "Registro estructurado");
      const { error } = await supabase.from("historial_clinico").insert({
        sistema_id: sistemaId,
        paciente_id: pacienteId,
        autor_id: u.user!.id,
        tipo: tipoEfectivo,
        titulo: titulo.trim() || (defForm ? defForm.nombre : null),
        contenido: texto,
        datos: { ...valores, ...(subidos.length ? { archivos: subidos } : {}) } as unknown as Json,
        corrige_a: corrige?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada registrada");
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, pacienteId] });
      void qc.invalidateQueries({ queryKey: ["cabecera-clinica", sistemaId, pacienteId] });
      reiniciar();
      onCerrar();
    },
    onError: (e) => {
      setProgreso(null);
      toast.error(mensajeError(e));
    },
  });

  // Un referimiento sin destino no sirve a quien lo recibe.
  const faltaDestino = tipoEfectivo === "referimiento" && !(campos.destino ?? "").trim();
  const valido =
    !faltaDestino &&
    (contenido.trim() ||
      archivos.length > 0 ||
      Object.values(campos).some((v) => v.trim()) ||
      (tipoEfectivo === "receta" && items.some((i) => i.nombre.trim())));

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo={corrige ? "Adenda" : defForm ? defForm.nombre : "Nueva entrada clínica"}
      descripcion={corrige ? "Se agregará debajo de la entrada original, sin modificarla." : (defForm?.descripcion ?? "Quedará firmada con tu nombre y la hora actual.")}
      pie={
        <>
          {progreso && <span className="mr-auto text-xs text-texto-3">{progreso}</span>}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            Firmar y guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {!corrige && (
          <div className="grid grid-cols-2 gap-4">
            <Selector
              etiqueta="Tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoEntradaClinica);
                setCampos({});
              }}
            >
              {tiposDisponibles.map((k) => (
                <option key={k} value={k}>
                  {TIPOS[k].etiqueta}
                </option>
              ))}
            </Selector>
            {tipo === "formulario" ? (
              <Selector
                etiqueta="Formulario"
                value={formulario}
                onChange={(e) => {
                  setFormulario(e.target.value);
                  setCampos({});
                }}
              >
                <optgroup label="Clínicos">
                  {formulariosSede.filter((f) => f.grupo === "clinicos").map((f) => (
                    <option key={f.clave} value={f.clave}>
                      {f.nombre}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Enfermería">
                  {formulariosSede.filter((f) => f.grupo === "enfermeria").map((f) => (
                    <option key={f.clave} value={f.clave}>
                      {f.nombre}
                    </option>
                  ))}
                </optgroup>
              </Selector>
            ) : (
              <Entrada etiqueta="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            )}
          </div>
        )}

        {tipoEfectivo === "psicologia" && (
          <p className="flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,#7a5af8_10%,var(--superficie))] px-3 py-2 text-xs text-[#6941c6] dark:text-[#bdb4fe]">
            <ShieldAlert className="size-4" /> Nota confidencial: solo la verán psicología y tú.
          </p>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {definicion.length > 0 && (
            <motion.div
              key={`${tipoEfectivo}:${formulario}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {definicion.map((c) =>
                c.tipo === "cie10" ? (
                  <SelectorCie10
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    contenedor="col-span-2 sm:col-span-4"
                    valor={campos[c.clave] ?? ""}
                    onChange={(v) => setCampos((s) => ({ ...s, [c.clave]: v }))}
                  />
                ) : c.opciones ? (
                  <Selector
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    contenedor="col-span-2"
                    value={campos[c.clave] ?? ""}
                    onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {c.opciones.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Selector>
                ) : c.tipo === "area" ? (
                  <AreaTexto
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    contenedor="col-span-2 sm:col-span-4"
                    className="min-h-16"
                    value={campos[c.clave] ?? ""}
                    onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                  />
                ) : (
                  <Entrada
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    placeholder={c.placeholder}
                    type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"}
                    step="any"
                    contenedor={(c.placeholder && c.placeholder.length > 12) || c.tipo === "fecha" || !c.tipo ? "col-span-2" : undefined}
                    value={campos[c.clave] ?? ""}
                    onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                  />
                ),
              )}
              {indice && <Calculado texto={`IMC calculado: ${indice.valor} · ${indice.clase}`} />}
              {dias && <Calculado texto={`Licencia de ${dias} ${dias === 1 ? "día" : "días"}`} />}
              {balance !== null && <Calculado texto={`Balance hídrico: ${balance > 0 ? "+" : ""}${balance} ml`} />}
              {escala && <Calculado texto={`Puntaje: ${escala.total} · ${escala.etiqueta}${escala.completo ? "" : " (faltan respuestas)"}`} />}
            </motion.div>
          )}
        </AnimatePresence>
        {alertas.length > 0 && <AlertasSignos alertas={alertas} />}

        {CON_ADJUNTOS.includes(tipoEfectivo) && (
          <div>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
              onChange={(e) => {
                const nuevos = [...(e.target.files ?? [])].filter((f) => {
                  if (f.size > 20 * 1024 * 1024) toast.error(`${f.name} supera 20 MB`);
                  return f.size <= 20 * 1024 * 1024;
                });
                setArchivos((a) => [...a, ...nuevos]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-borde-fuerte px-4 py-6 text-sm text-texto-2 transition-colors hover:border-marca hover:bg-marca-suave/40"
            >
              <Upload className="size-5 text-texto-3" />
              {tipoEfectivo === "consentimiento" ? "Adjuntar el consentimiento firmado (opcional)" : "Adjuntar PDF o imágenes (máx. 20 MB c/u)"}
            </button>
            <AnimatePresence initial={false}>
              {archivos.map((f, i) => (
                <motion.div key={f.name + i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                    <Paperclip className="size-4 text-texto-3" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-texto-3">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} className="text-texto-3 hover:text-peligro" aria-label={`Quitar ${f.name}`}>
                      <X className="size-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {tipoEfectivo === "receta" && (
          <div className="space-y-2">
            <p className="text-[0.8125rem] font-medium text-texto-2">Medicamentos</p>
            <AnimatePresence initial={false}>
              {items.map((it, i) => (
                <motion.div key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-borde bg-superficie-2/40 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                    <Entrada contenedor="sm:col-span-3" placeholder="Medicamento (ej.: Amoxicilina 500 mg)" value={it.nombre} onChange={(e) => setItems((a) => a.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} />
                    <Entrada contenedor="sm:col-span-2" placeholder="Cantidad / presentación" value={it.detalle ?? ""} onChange={(e) => setItems((a) => a.map((x, j) => (j === i ? { ...x, detalle: e.target.value } : x)))} />
                    <div className="flex items-center gap-2 sm:col-span-5">
                      <Entrada contenedor="flex-1" placeholder="Indicaciones (ej.: 1 cada 8 horas por 7 días)" value={it.indicaciones ?? ""} onChange={(e) => setItems((a) => a.map((x, j) => (j === i ? { ...x, indicaciones: e.target.value } : x)))} />
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems((a) => a.filter((_, j) => j !== i))} className="shrink-0 text-texto-3 hover:text-peligro" title="Quitar">
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <button type="button" onClick={() => setItems((a) => [...a, { nombre: "", detalle: "", indicaciones: "" }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-marca-texto hover:underline">
              <Plus className="size-3.5" /> Agregar medicamento
            </button>
          </div>
        )}

        <AreaTexto
          etiqueta={
            corrige
              ? "Corrección o ampliación"
              : tipoEfectivo === "psicologia"
                ? "Notas de la sesión"
                : tipoEfectivo === "receta"
                  ? "Indicaciones generales (opcional)"
                  : tipoEfectivo === "certificado"
                    ? "Texto del documento"
                    : definicion.length
                      ? "Observaciones (opcional)"
                      : "Contenido"
          }
          className="min-h-28"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={
            tipoEfectivo === "receta"
              ? "Reposo, dieta, próxima cita… (opcional)"
              : tipoEfectivo === "certificado"
                ? "Certifico que el/la paciente… (motivo, reposo, fechas)"
                : tipoEfectivo === "referimiento"
                  ? "Refiero al paciente a… por… con estos hallazgos…"
                  : tipoEfectivo === "anexo"
                    ? "Descripción del documento (opcional)"
                    : definicion.length
                      ? ""
                      : "Hallazgos, evolución, plan…"
          }
        />
      </div>
    </Modal>
  );
}

function Calculado({ texto }: { texto: string }) {
  return <div className="col-span-2 flex items-center gap-2 rounded-xl bg-marca-suave px-3 py-2 text-sm text-marca-texto sm:col-span-4">{texto}</div>;
}
