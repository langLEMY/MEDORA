import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  BedDouble,
  Check,
  Clock,
  ClipboardCheck,
  HeartPulse,
  MoreHorizontal,
  NotebookPen,
  Pill,
  Plus,
  Printer,
  Stethoscope,
  Syringe,
  Thermometer,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, nombrePaciente, useTurnosHoy, type CitaConRelaciones } from "@/lib/consultas";
import type { Json } from "@/lib/database.types";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn, fecha, fechaHora, hora, relativo } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { alertasSignos, CAMPOS_SIGNOS, NIVELES_ESI } from "./pacientes/catalogoClinico";
import { AlertasSignos, NuevaEntrada } from "./pacientes/HistorialClinico";
import { NuevaIndicacion } from "./pacientes/Indicaciones";

type Vista = "preconsulta" | "procedimientos" | "internados" | "kardex";

const TIPO_SEDE: Record<string, string> = {
  hospital: "Hospital",
  clinica: "Clínica",
  consultorio: "Consultorio",
  laboratorio: "Laboratorio",
  farmacia: "Farmacia",
  otro: "Centro de salud",
};

/**
 * Enfermería. Lo que se ve depende del tipo de establecimiento (capacidades de la sede):
 *   consultorio → preconsulta (signos de quien llegó) y procedimientos ordenados;
 *   clínica/hospital (internamiento) → además, pacientes ingresados y Kardex;
 *   emergencia → la preconsulta pide la prioridad (ESI).
 * Sin sede resuelta se muestra todo (mismo criterio que el menú).
 */
export default function Enfermeria() {
  const { capacidades, sede } = useSesion();
  const resuelto = !!capacidades && Object.keys(capacidades).length > 0;
  const tiene = (c: "agenda" | "internamiento" | "emergencia") => !resuelto || capacidades[c] === true;

  const opciones = [
    tiene("agenda") && { valor: "preconsulta" as const, etiqueta: "Preconsulta" },
    { valor: "procedimientos" as const, etiqueta: "Procedimientos" },
    tiene("internamiento") && { valor: "internados" as const, etiqueta: "Internados" },
    tiene("internamiento") && { valor: "kardex" as const, etiqueta: "Kardex" },
  ].filter(Boolean) as { valor: Vista; etiqueta: string }[];
  const [vista, setVista] = useState<Vista>(opciones[0].valor);
  const activa = opciones.some((o) => o.valor === vista) ? vista : opciones[0].valor;

  const descripcion = sede
    ? `${TIPO_SEDE[sede.tipo] ?? "Sede"} · ${sede.nombre}${tiene("internamiento") ? "" : " — sin internamiento: preconsulta y procedimientos"}`
    : "Preconsulta, procedimientos y medicamentos";

  return (
    <>
      <EncabezadoPagina titulo="Enfermería" descripcion={descripcion} acciones={opciones.length > 1 && <Segmentado id="enf-vista" valor={activa} onChange={setVista} opciones={opciones} />} />
      <AnimatePresence mode="wait">
        <motion.div key={activa} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
          {activa === "preconsulta" && <Preconsulta conTriaje={tiene("emergencia") && resuelto} />}
          {activa === "procedimientos" && <Procedimientos />}
          {activa === "internados" && <Internados />}
          {activa === "kardex" && <Kardex />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Signos vitales rápidos (preconsulta e internados)                         */
/* ------------------------------------------------------------------------ */

interface SignosHoy {
  paciente_id: string;
  datos: Record<string, unknown>;
  creado_en: string;
}

function useUltimosSignos(ids: string[], desde: Date) {
  const { sistemaId } = useSistema();
  return useQuery({
    queryKey: ["signos-recientes", sistemaId, ids.join(","), desde.toISOString().slice(0, 13)],
    enabled: ids.length > 0,
    queryFn: async () => {
      const filas = datos(
        await supabase
          .from("historial_clinico")
          .select("paciente_id, datos, creado_en")
          .eq("sistema_id", sistemaId)
          .in("tipo", ["signos_vitales", "triaje"])
          .in("paciente_id", ids)
          .gte("creado_en", desde.toISOString())
          .order("creado_en", { ascending: false }),
      ) as unknown as SignosHoy[];
      const m = new Map<string, SignosHoy>();
      for (const f of filas) if (!m.has(f.paciente_id)) m.set(f.paciente_id, f);
      return m;
    },
  });
}

function ResumenSignos({ s }: { s: SignosHoy }) {
  const v = (k: string) => s.datos?.[k];
  const partes = [v("pa") && `PA ${v("pa")}`, v("fc") && `FC ${v("fc")}`, v("temp") && `T ${v("temp")}°`, v("sat") && `Sat ${v("sat")}%`].filter(Boolean);
  return (
    <span className="text-xs text-texto-2 tabular">
      {partes.join(" · ") || "Registrados"} <span className="text-texto-3">· {hora(s.creado_en)}</span>
      {typeof v("nivel") === "string" && <Insignia tono={String(v("nivel")).startsWith("1") || String(v("nivel")).startsWith("2") ? "peligro" : "aviso"}>ESI {String(v("nivel")).slice(0, 1)}</Insignia>}
    </span>
  );
}

function SignosRapidos({
  paciente,
  onCerrar,
  conTriaje,
}: {
  paciente: { id: string; nombre: string; citaId?: string | null } | null;
  onCerrar: () => void;
  conTriaje?: boolean;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [nota, setNota] = useState("");
  const alertas = alertasSignos(campos);

  const guardar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const valores = Object.fromEntries(Object.entries(campos).filter(([, v]) => v.trim() !== ""));
      const triaje = conTriaje && !!valores.nivel;
      const { error } = await supabase.from("historial_clinico").insert({
        sistema_id: sistemaId,
        paciente_id: paciente!.id,
        cita_id: paciente!.citaId ?? null,
        autor_id: u.user!.id,
        tipo: triaje ? "triaje" : "signos_vitales",
        titulo: paciente!.citaId ? "Preconsulta" : "Control de signos",
        contenido: nota.trim() || (alertas.length ? `Alertas: ${alertas.map((a) => a.texto).join(", ")}` : "Signos vitales registrados"),
        datos: valores as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(alertas.some((a) => a.grave) ? "Signos guardados · avisa al médico: hay valores de alarma" : "Signos guardados");
      void qc.invalidateQueries({ queryKey: ["signos-recientes", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, paciente!.id] });
      void qc.invalidateQueries({ queryKey: ["cabecera-clinica", sistemaId, paciente!.id] });
      setCampos({});
      setNota("");
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const valido = Object.values(campos).some((v) => v.trim());
  return (
    <Modal
      abierto={!!paciente}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Signos vitales"
      descripcion={paciente?.nombre}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {conTriaje && (
          <Selector etiqueta="Prioridad (ESI)" value={campos.nivel ?? ""} onChange={(e) => setCampos((s) => ({ ...s, nivel: e.target.value }))}>
            <option value="">Sin clasificar</option>
            {NIVELES_ESI.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Selector>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CAMPOS_SIGNOS.map((c) => (
            <Entrada
              key={c.clave}
              etiqueta={c.etiqueta}
              placeholder={c.placeholder}
              inputMode={c.tipo === "numero" ? "decimal" : "text"}
              value={campos[c.clave] ?? ""}
              onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
            />
          ))}
          <Entrada etiqueta="Dolor (0–10)" inputMode="numeric" value={campos.dolor ?? ""} onChange={(e) => setCampos((s) => ({ ...s, dolor: e.target.value }))} />
        </div>
        {alertas.length > 0 && <AlertasSignos alertas={alertas} />}
        <AreaTexto etiqueta="Observaciones (opcional)" className="min-h-14" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Preconsulta: signos de quien ya llegó, antes de pasar con el médico      */
/* ------------------------------------------------------------------------ */

const ESPERANDO = ["por_cobrar", "en_espera", "llamado"];

function Preconsulta({ conTriaje }: { conTriaje: boolean }) {
  const { sistemaId, roles } = useSistema();
  const turnos = useTurnosHoy(sistemaId);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);
  const [filtro, setFiltro] = useState<"pendientes" | "todos">("pendientes");
  const [signos, setSignos] = useState<{ id: string; nombre: string; citaId: string } | null>(null);

  const inicio = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const lista = (turnos.data ?? []).filter((c) => c.paciente_id && [...ESPERANDO, "en_consulta"].includes(c.estado));
  const ids = [...new Set(lista.map((c) => c.paciente_id!))];
  const hoy = useUltimosSignos(ids, inicio);
  const visibles = lista.filter((c) => filtro === "todos" || (!hoy.data?.has(c.paciente_id!) && ESPERANDO.includes(c.estado)));
  const pendientes = lista.filter((c) => !hoy.data?.has(c.paciente_id!) && ESPERANDO.includes(c.estado)).length;
  const escribir = puedeEscribir.historial(roles);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmentado
          id="pre-filtro"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "pendientes", etiqueta: pendientes ? `Sin signos (${pendientes})` : "Sin signos" },
            { valor: "todos", etiqueta: "Todos los que llegaron" },
          ]}
        />
        <p className="text-xs text-texto-3">Los pacientes aparecen al registrar su llegada; los que no tienen ficha esperan a que caja o recepción los identifique.</p>
      </div>
      <Tarjeta className="overflow-hidden">
        {turnos.isLoading ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-12" />)}</div>
        ) : !visibles.length ? (
          <Vacio icono={<HeartPulse />} titulo={filtro === "pendientes" ? "Nadie esperando signos" : "Nadie ha llegado todavía"} descripcion="Cuando un paciente llegue, aparecerá aquí para tomarle los signos antes de la consulta." />
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((c: CitaConRelaciones) => {
              const s = hoy.data?.get(c.paciente_id!);
              const alertas = s ? alertasSignos(s.datos) : [];
              const min = Math.max(0, Math.round((Date.now() - new Date(c.llegada_en ?? c.inicio).getTime()) / 60000));
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-16 font-mono text-sm font-bold text-marca-texto">{c.turno ?? "—"}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/pacientes/${c.paciente_id}`} className="block truncate text-sm font-medium hover:underline">
                      {nombrePaciente(c)}
                    </Link>
                    <p className="truncate text-xs text-texto-3">
                      {c.medico?.nombre_completo ?? `${c.especialidad ?? "Consulta"} · cualquiera`} · llegó hace {min} min
                    </p>
                    {s && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ResumenSignos s={s} />
                        {alertas.map((a) => (
                          <Insignia key={a.texto} tono={a.grave ? "peligro" : "aviso"}>
                            {a.texto}
                          </Insignia>
                        ))}
                      </div>
                    )}
                  </div>
                  {c.prioridad && <Insignia tono="aviso">{c.motivo_prioridad ?? "Prioridad"}</Insignia>}
                  {escribir && (
                    <Boton variante={s ? "secundario" : "primario"} tamano="sm" icono={<Thermometer className="size-3.5" />} onClick={() => setSignos({ id: c.paciente_id!, nombre: nombrePaciente(c), citaId: c.id })}>
                      {s ? "Repetir" : "Tomar signos"}
                    </Boton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
      <SignosRapidos paciente={signos} onCerrar={() => setSignos(null)} conTriaje={conTriaje} />
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Procedimientos ordenados por el médico (curas, inyecciones, nebulizaciones…) */
/* ------------------------------------------------------------------------ */

interface OrdenProc {
  id: string;
  numero: string;
  tipo: string;
  indicaciones: string | null;
  creado_en: string;
  paciente_id: string;
  paciente: { nombres: string; apellidos: string; expediente: string } | null;
  medico: { nombre_completo: string } | null;
  items: { id: string; posicion: number; descripcion: string; estado: string }[];
}

function Procedimientos() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["procedimientos-pendientes", sistemaId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const filas = datos(
        await supabase
          .from("ordenes_medicas")
          .select(
            "id, numero, tipo, indicaciones, creado_en, paciente_id, paciente:pacientes!ordenes_medicas_sistema_id_paciente_id_fkey(nombres, apellidos, expediente), medico:perfiles!ordenes_medicas_medico_id_fkey(nombre_completo), items:orden_items!orden_items_sistema_id_orden_id_fkey(id, posicion, descripcion, estado)",
          )
          .eq("sistema_id", sistemaId)
          .in("tipo", ["procedimiento", "otro"])
          .order("creado_en", { ascending: true })
          .limit(200),
      ) as unknown as OrdenProc[];
      return filas
        .map((o) => ({ ...o, items: o.items.filter((i) => i.estado === "pendiente").sort((a, b) => a.posicion - b.posicion) }))
        .filter((o) => o.items.length);
    },
  });

  const marcar = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: "entregada" | "cancelada" }) => {
      const { error } = await supabase.rpc("marcar_item_orden", { p_item: id, p_estado: estado });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      toast.success(v.estado === "entregada" ? "Procedimiento realizado" : "Procedimiento cancelado");
      void qc.invalidateQueries({ queryKey: ["procedimientos-pendientes", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["ordenes-medicas", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const editable = puedeEscribir.estadoOrden(roles);

  return (
    <Tarjeta className="overflow-hidden">
      {q.isLoading ? (
        <div className="space-y-3 p-5">{[0, 1].map((i) => <Esqueleto key={i} className="h-16" />)}</div>
      ) : !q.data?.length ? (
        <Vacio icono={<ClipboardCheck />} titulo="Sin procedimientos pendientes" descripcion="Cuando un médico ordene un procedimiento (cura, inyección, nebulización…), aparecerá aquí para realizarlo." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data.map((o) => (
            <li key={o.id} className="px-5 py-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link to={`/pacientes/${o.paciente_id}`} className="text-sm font-semibold hover:underline">
                  {o.paciente ? `${o.paciente.nombres} ${o.paciente.apellidos}` : "Paciente"}
                </Link>
                <span className="font-mono text-xs text-texto-3">{o.numero}</span>
                <span className="text-xs text-texto-3" title={fechaHora(o.creado_en)}>
                  {o.medico?.nombre_completo} · {relativo(o.creado_en)}
                </span>
              </div>
              <ul className="space-y-1.5">
                {o.items.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-superficie-2/60 px-3 py-2">
                    <Syringe className="size-4 text-marca" />
                    <span className="min-w-0 flex-1 text-sm">{it.descripcion}</span>
                    {editable && (
                      <>
                        <Boton tamano="sm" icono={<Check className="size-3.5" />} cargando={marcar.isPending && marcar.variables?.id === it.id} onClick={() => marcar.mutate({ id: it.id, estado: "entregada" })}>
                          Realizado
                        </Boton>
                        <Boton variante="fantasma" tamano="sm" icono={<X className="size-3.5" />} onClick={() => marcar.mutate({ id: it.id, estado: "cancelada" })}>
                          No se hizo
                        </Boton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {o.indicaciones && <p className="mt-2 text-xs whitespace-pre-wrap text-texto-2">{o.indicaciones}</p>}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------------ */
/* Kardex: dosis del turno                                                   */
/* ------------------------------------------------------------------------ */

export interface FilaKardex {
  indicacion_id: string;
  paciente_id: string;
  paciente: string;
  cama: string | null;
  medicamento: string;
  dosis: string;
  via: string;
  pauta: "horario" | "unica" | "si_necesario";
  frecuencia_horas: number | null;
  observaciones: string | null;
  estado_indicacion: "activa" | "suspendida";
  programada_para: string | null;
  administracion_id: string | null;
  estado: "administrada" | "omitida" | "rechazada" | null;
  motivo: string | null;
  registrado_en: string | null;
  registrado_por: string | null;
}

type Turno = "manana" | "tarde" | "noche";
const TURNOS: Record<Turno, { etiqueta: string; inicio: number; horas: number }> = {
  manana: { etiqueta: "Mañana · 7 a 15", inicio: 7, horas: 8 },
  tarde: { etiqueta: "Tarde · 15 a 23", inicio: 15, horas: 8 },
  noche: { etiqueta: "Noche · 23 a 7", inicio: 23, horas: 8 },
};

function turnoActual(d = new Date()): Turno {
  const h = d.getHours();
  return h >= 7 && h < 15 ? "manana" : h >= 15 && h < 23 ? "tarde" : "noche";
}

/** Ventana del turno: la noche que empieza antes de medianoche, o la de anoche si son las 0–7. */
export function ventanaTurno(t: Turno, ahora = new Date()) {
  const desde = new Date(ahora);
  desde.setHours(TURNOS[t].inicio, 0, 0, 0);
  if (t === "noche" && ahora.getHours() < 7) desde.setDate(desde.getDate() - 1);
  const hasta = new Date(desde.getTime() + TURNOS[t].horas * 3_600_000);
  return { desde, hasta };
}

export function useKardex(desde: Date, hasta: Date) {
  const { sistemaId } = useSistema();
  return useQuery({
    queryKey: ["kardex", sistemaId, desde.toISOString(), hasta.toISOString()],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kardex", { p_sistema: sistemaId, p_desde: desde.toISOString(), p_hasta: hasta.toISOString() });
      if (error) throw error;
      return (data ?? []) as unknown as FilaKardex[];
    },
  });
}

/** Estado visible de una dosis programada sin registrar. */
function urgencia(f: FilaKardex, ahora: number) {
  if (f.estado || !f.programada_para) return null;
  const dif = (new Date(f.programada_para).getTime() - ahora) / 60000;
  if (dif < -60) return "atrasada" as const;
  if (dif <= 60) return "ahora" as const;
  if (dif <= 120) return "pronto" as const;
  return "programada" as const;
}

function Kardex() {
  const { roles } = useSistema();
  const [turno, setTurno] = useState<Turno>(turnoActual);
  const { desde, hasta } = useMemo(() => ventanaTurno(turno), [turno]);
  const q = useKardex(desde, hasta);
  const [registrar, setRegistrar] = useState<FilaKardex | null>(null);
  const [suspender, setSuspender] = useState<FilaKardex | null>(null);
  const ahora = Date.now();
  const administrar = puedeEscribir.administrar(roles);

  const programadas = (q.data ?? []).filter((f) => f.pauta !== "si_necesario");
  const sos = (q.data ?? []).filter((f) => f.pauta === "si_necesario");
  const porHora = useMemo(() => {
    const g = new Map<string, FilaKardex[]>();
    for (const f of programadas) {
      const k = f.programada_para ? hora(f.programada_para) : "—";
      g.set(k, [...(g.get(k) ?? []), f]);
    }
    return [...g.entries()];
  }, [programadas]);
  const atrasadas = programadas.filter((f) => urgencia(f, ahora) === "atrasada").length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmentado id="turno" valor={turno} onChange={setTurno} opciones={(Object.keys(TURNOS) as Turno[]).map((t) => ({ valor: t, etiqueta: TURNOS[t].etiqueta }))} />
        {atrasadas > 0 && (
          <Insignia tono="peligro">
            <AlertTriangle className="size-3" /> {atrasadas} {atrasadas === 1 ? "dosis atrasada" : "dosis atrasadas"}
          </Insignia>
        )}
        <span className="ml-auto text-xs text-texto-3">
          {fecha(desde.toISOString())} {hora(desde.toISOString())} – {hora(hasta.toISOString())}
        </span>
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-16 rounded-2xl" />)}</div>
      ) : !programadas.length && !sos.length ? (
        <Tarjeta>
          <Vacio icono={<Pill />} titulo="Sin medicamentos en este turno" descripcion="El médico indica los medicamentos desde el expediente (Órdenes médicas → Indicación de medicamento) o desde Internados." />
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {porHora.map(([h, filas]) => (
            <Tarjeta key={h} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-borde bg-superficie-2/50 px-5 py-2">
                <Clock className="size-4 text-texto-3" />
                <span className="text-sm font-semibold tabular">{h}</span>
                <span className="text-xs text-texto-3">· {filas.length} {filas.length === 1 ? "dosis" : "dosis"}</span>
              </div>
              <ul className="divide-y divide-borde">
                {filas.map((f) => (
                  <FilaDosis key={`${f.indicacion_id}-${f.programada_para}`} f={f} urg={urgencia(f, ahora)} administrar={administrar} onRegistrar={() => setRegistrar(f)} onSuspender={puedeEscribir.indicar(roles) && f.estado_indicacion === "activa" ? () => setSuspender(f) : undefined} />
                ))}
              </ul>
            </Tarjeta>
          ))}

          {sos.length > 0 && (
            <Tarjeta className="overflow-hidden">
              <div className="border-b border-borde bg-superficie-2/50 px-5 py-2 text-sm font-semibold">Si es necesario</div>
              <ul className="divide-y divide-borde">
                {sos.map((f) => (
                  <FilaDosis key={`${f.indicacion_id}-${f.administracion_id ?? "disponible"}`} f={f} urg={null} administrar={administrar} onRegistrar={() => setRegistrar(f)} onSuspender={puedeEscribir.indicar(roles) && f.estado_indicacion === "activa" && !f.administracion_id ? () => setSuspender(f) : undefined} />
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      )}

      <RegistrarDosis fila={registrar} onCerrar={() => setRegistrar(null)} />
      <SuspenderIndicacion fila={suspender} onCerrar={() => setSuspender(null)} />
    </>
  );
}

function FilaDosis({ f, urg, administrar, onRegistrar, onSuspender }: { f: FilaKardex; urg: ReturnType<typeof urgencia>; administrar: boolean; onRegistrar: () => void; onSuspender?: () => void }) {
  const hecho = !!f.estado;
  const sosDisponible = f.pauta === "si_necesario" && !f.administracion_id;
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-5 py-3", urg === "atrasada" && "bg-[color-mix(in_oklab,var(--peligro)_6%,var(--superficie))]")}>
      <span className="w-14 shrink-0 text-xs font-medium text-texto-3">{f.cama ? `Cama ${f.cama}` : "—"}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", f.estado_indicacion === "suspendida" && !hecho && "text-texto-3 line-through")}>
          {f.medicamento} <span className="font-normal text-texto-2">{f.dosis} · {f.via}</span>
        </p>
        <p className="truncate text-xs text-texto-3">
          <Link to={`/pacientes/${f.paciente_id}`} className="hover:underline">
            {f.paciente}
          </Link>
          {f.pauta === "horario" && f.frecuencia_horas ? ` · cada ${f.frecuencia_horas} h` : f.pauta === "unica" ? " · dosis única" : ""}
          {f.observaciones ? ` · ${f.observaciones}` : ""}
        </p>
        {hecho && (
          <p className="text-xs text-texto-3">
            {f.registrado_por} · {f.registrado_en ? hora(f.registrado_en) : ""}
            {f.motivo ? ` · ${f.motivo}` : ""}
          </p>
        )}
      </div>
      {hecho ? (
        <Insignia tono={f.estado === "administrada" ? "exito" : f.estado === "rechazada" ? "peligro" : "aviso"}>
          {f.estado === "administrada" ? "Administrada" : f.estado === "rechazada" ? "Rechazada" : "Omitida"}
        </Insignia>
      ) : f.estado_indicacion === "suspendida" ? (
        <Insignia tono="neutro">Suspendida</Insignia>
      ) : (
        <>
          {urg === "atrasada" && <Insignia tono="peligro">Atrasada</Insignia>}
          {urg === "ahora" && <Insignia tono="aviso">Ahora</Insignia>}
          {administrar && (urg !== "programada" || sosDisponible) && (
            <Boton tamano="sm" variante={urg === "atrasada" || urg === "ahora" || sosDisponible ? "primario" : "secundario"} icono={<Syringe className="size-3.5" />} onClick={onRegistrar}>
              {sosDisponible ? "Administrar ahora" : "Registrar"}
            </Boton>
          )}
          {urg === "programada" && <span className="text-xs text-texto-3">Programada</span>}
        </>
      )}
      {onSuspender && (
        <Menu
          alinear="derecha"
          ancho={200}
          disparador={() => (
            <button type="button" aria-label="Más opciones" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
              <MoreHorizontal className="size-4" />
            </button>
          )}
        >
          {(cerrar) => (
            <ItemMenu peligro icono={<X className="size-4" />} onClick={() => (cerrar(), onSuspender())}>
              Suspender indicación
            </ItemMenu>
          )}
        </Menu>
      )}
    </li>
  );
}

const MOTIVOS_OMISION = ["Paciente en ayunas", "Paciente fuera de la unidad", "Medicamento no disponible", "Indicación del médico", "Signos vitales fuera de rango", "Otro"];

function RegistrarDosis({ fila, onCerrar }: { fila: FilaKardex | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [estado, setEstado] = useState<"administrada" | "omitida" | "rechazada">("administrada");
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const [obs, setObs] = useState("");

  const cerrar = () => {
    setEstado("administrada");
    setMotivo("");
    setOtro("");
    setObs("");
    onCerrar();
  };
  const motivoFinal = estado === "rechazada" ? otro.trim() || "El paciente la rechazó" : motivo === "Otro" ? otro.trim() : motivo;

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("registrar_administracion", {
        p_indicacion: fila!.indicacion_id,
        // "Si es necesario" no tiene hora: va null y el servidor la registra sin hora programada.
        p_programada: fila!.programada_para as string,
        p_estado: estado,
        p_motivo: estado === "administrada" ? undefined : motivoFinal,
        p_observaciones: obs.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(estado === "administrada" ? "Dosis administrada" : "Registrado");
      void qc.invalidateQueries({ queryKey: ["kardex", sistemaId] });
      cerrar();
    },
    onError: (e) => {
      toast.error(mensajeError(e));
      void qc.invalidateQueries({ queryKey: ["kardex", sistemaId] });
    },
  });

  const valido = estado === "administrada" || !!motivoFinal;
  return (
    <Modal
      abierto={!!fila}
      onCerrar={cerrar}
      titulo={fila ? `${fila.medicamento} ${fila.dosis}` : ""}
      descripcion={fila ? `${fila.paciente}${fila.cama ? ` · cama ${fila.cama}` : ""} · ${fila.via}${fila.programada_para ? ` · programada ${hora(fila.programada_para)}` : ""}` : ""}
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton variante={estado === "administrada" ? "primario" : "peligro"} cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            {estado === "administrada" ? "Confirmar administración" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          id="estado-dosis"
          valor={estado}
          onChange={setEstado}
          opciones={[
            { valor: "administrada", etiqueta: "Administrada" },
            { valor: "omitida", etiqueta: "Omitida" },
            { valor: "rechazada", etiqueta: "La rechazó" },
          ]}
        />
        {fila?.observaciones && <p className="rounded-xl bg-superficie-2 px-3 py-2 text-xs text-texto-2">Indicación: {fila.observaciones}</p>}
        {estado === "omitida" && (
          <Selector etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Elige el motivo</option>
            {MOTIVOS_OMISION.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Selector>
        )}
        {(estado === "rechazada" || motivo === "Otro") && estado !== "administrada" && (
          <Entrada etiqueta={estado === "rechazada" ? "¿Qué dijo el paciente? (opcional)" : "Explica el motivo"} value={otro} onChange={(e) => setOtro(e.target.value)} />
        )}
        <AreaTexto etiqueta="Observaciones (opcional)" className="min-h-14" placeholder="Sitio de aplicación, reacción, signos…" value={obs} onChange={(e) => setObs(e.target.value)} />
        <p className="text-xs text-texto-3">Queda firmado con tu nombre y no se puede borrar; si te equivocas, avisa al médico y registra la nota.</p>
      </div>
    </Modal>
  );
}

function SuspenderIndicacion({ fila, onCerrar }: { fila: FilaKardex | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("suspender_indicacion", { p_indicacion: fila!.indicacion_id, p_motivo: motivo.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Indicación suspendida: sus próximas dosis ya no aparecen");
      void qc.invalidateQueries({ queryKey: ["kardex", sistemaId] });
      setMotivo("");
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={!!fila}
      onCerrar={onCerrar}
      titulo="Suspender indicación"
      descripcion={fila ? `${fila.medicamento} ${fila.dosis} · ${fila.paciente}` : ""}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={guardar.isPending} disabled={!motivo.trim()} onClick={() => guardar.mutate()}>
            Suspender
          </Boton>
        </>
      }
    >
      <Entrada etiqueta="Motivo" placeholder="Cambio a vía oral, alergia, alta…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Internados: por cama, con signos, riesgos y la entrega de turno           */
/* ------------------------------------------------------------------------ */

interface Ingresado {
  id: string;
  paciente_id: string;
  motivo: string | null;
  medico_nombre: string | null;
  ingreso_en: string;
  cama: { codigo: string } | null;
  paciente: { nombres: string; apellidos: string; alergias: string | null } | null;
}

interface Riesgo {
  paciente_id: string;
  datos: Record<string, unknown>;
  creado_en: string;
}

function Internados() {
  const { sistemaId, roles } = useSistema();
  const navegar = useNavigate();
  const [signos, setSignos] = useState<{ id: string; nombre: string } | null>(null);
  const [entrada, setEntrada] = useState<{ pacienteId: string; formulario: string } | null>(null);
  const [indicar, setIndicar] = useState<string | null>(null);
  const [entrega, setEntrega] = useState(false);

  const q = useQuery({
    queryKey: ["internados", sistemaId],
    refetchInterval: 60_000,
    queryFn: async () =>
      datos(
        await supabase
          .from("admisiones")
          .select("id, paciente_id, motivo, medico_nombre, ingreso_en, cama:camas!admisiones_sistema_id_cama_id_fkey(codigo), paciente:pacientes!admisiones_sistema_id_paciente_id_fkey(nombres, apellidos, alergias)")
          .eq("sistema_id", sistemaId)
          .eq("estado", "ingresado")
          .order("ingreso_en"),
      ) as unknown as Ingresado[],
  });
  const lista = (q.data ?? []).slice().sort((a, b) => (a.cama?.codigo ?? "").localeCompare(b.cama?.codigo ?? "", "es", { numeric: true }));
  const ids = lista.map((a) => a.paciente_id);
  const hace48 = useMemo(() => new Date(Date.now() - 48 * 3_600_000), []);
  const ultimos = useUltimosSignos(ids, hace48);

  // Últimas escalas de riesgo (Morse/Braden) y última nota de enfermería de cada paciente.
  const riesgos = useQuery({
    queryKey: ["riesgos-internados", sistemaId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const filas = datos(
        await supabase
          .from("historial_clinico")
          .select("paciente_id, datos, creado_en")
          .eq("sistema_id", sistemaId)
          .eq("tipo", "formulario")
          .in("paciente_id", ids)
          .in("datos->>formulario", ["escala_morse", "escala_braden", "nota_enfermeria"])
          .order("creado_en", { ascending: false })
          .limit(500),
      ) as unknown as Riesgo[];
      const m = new Map<string, Partial<Record<"escala_morse" | "escala_braden" | "nota_enfermeria", Riesgo>>>();
      for (const f of filas) {
        const k = String(f.datos?.formulario) as "escala_morse" | "escala_braden" | "nota_enfermeria";
        const x = m.get(f.paciente_id) ?? {};
        if (!x[k]) x[k] = f;
        m.set(f.paciente_id, x);
      }
      return m;
    },
  });

  const { desde, hasta } = useMemo(() => ventanaTurno(turnoActual()), []);
  const kardex = useKardex(desde, hasta);
  const pendientesPorPaciente = useMemo(() => {
    const m = new Map<string, number>();
    const ahora = Date.now();
    for (const f of kardex.data ?? []) {
      const u = urgencia(f, ahora);
      if (u === "atrasada" || u === "ahora") m.set(f.paciente_id, (m.get(f.paciente_id) ?? 0) + 1);
    }
    return m;
  }, [kardex.data]);

  const escribir = puedeEscribir.historial(roles);
  const nombre = (a: Ingresado) => (a.paciente ? `${a.paciente.nombres} ${a.paciente.apellidos}` : "Paciente");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-sm text-texto-2">{lista.length ? `${lista.length} ${lista.length === 1 ? "paciente ingresado" : "pacientes ingresados"}` : ""}</p>
        <div className="ml-auto flex gap-2">
          <Boton variante="secundario" icono={<BedDouble className="size-4" />} onClick={() => navegar("/internamiento")}>
            Camas y admisiones
          </Boton>
          <Boton icono={<Printer className="size-4" />} disabled={!lista.length} onClick={() => setEntrega(true)}>
            Entrega de turno
          </Boton>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Esqueleto key={i} className="h-28 rounded-2xl" />)}</div>
      ) : !lista.length ? (
        <Tarjeta>
          <Vacio icono={<BedDouble />} titulo="Sin pacientes ingresados" descripcion="Las admisiones se registran en Internamiento; aquí enfermería ve a cada paciente por cama." />
        </Tarjeta>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {lista.map((a) => {
            const s = ultimos.data?.get(a.paciente_id);
            const horas = s ? (Date.now() - new Date(s.creado_en).getTime()) / 3_600_000 : null;
            const alertas = s ? alertasSignos(s.datos) : [];
            const r = riesgos.data?.get(a.paciente_id);
            const pend = pendientesPorPaciente.get(a.paciente_id) ?? 0;
            return (
              <Tarjeta key={a.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-marca-suave text-sm font-bold text-marca-texto">{a.cama?.codigo ?? "—"}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/pacientes/${a.paciente_id}`} className="block truncate text-sm font-semibold hover:underline">
                      {nombre(a)}
                    </Link>
                    <p className="truncate text-xs text-texto-3">
                      Ingresó {relativo(a.ingreso_en)}
                      {a.motivo ? ` · ${a.motivo}` : ""}
                      {a.medico_nombre ? ` · ${a.medico_nombre}` : ""}
                    </p>
                  </div>
                  {pend > 0 && (
                    <Insignia tono="peligro">
                      <Pill className="size-3" /> {pend} {pend === 1 ? "dosis" : "dosis"}
                    </Insignia>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {a.paciente?.alergias && (
                    <Insignia tono="peligro">
                      <AlertTriangle className="size-3" /> {a.paciente.alergias}
                    </Insignia>
                  )}
                  {r?.escala_morse && <Insignia tono={String(r.escala_morse.datos.riesgo ?? "").includes("alto") ? "peligro" : "aviso"}>Caídas: {String(r.escala_morse.datos.riesgo ?? "evaluado")}</Insignia>}
                  {r?.escala_braden && <Insignia tono={String(r.escala_braden.datos.riesgo ?? "").includes("alto") ? "peligro" : "aviso"}>Úlceras: {String(r.escala_braden.datos.riesgo ?? "evaluado")}</Insignia>}
                  {!r?.escala_morse && <Insignia tono="neutro">Sin escala de caídas</Insignia>}
                </div>
                <div className="mt-3 rounded-xl bg-superficie-2/70 px-3 py-2">
                  {s ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ResumenSignos s={s} />
                      {horas !== null && horas > 8 && <Insignia tono="aviso">Hace {Math.floor(horas)} h</Insignia>}
                      {alertas.map((x) => (
                        <Insignia key={x.texto} tono={x.grave ? "peligro" : "aviso"}>
                          {x.texto}
                        </Insignia>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-aviso">Sin signos vitales en las últimas 48 horas</span>
                  )}
                </div>
                {escribir && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Boton tamano="sm" variante="secundario" icono={<Thermometer className="size-3.5" />} onClick={() => setSignos({ id: a.paciente_id, nombre: nombre(a) })}>
                      Signos
                    </Boton>
                    <Boton tamano="sm" variante="secundario" icono={<NotebookPen className="size-3.5" />} onClick={() => setEntrada({ pacienteId: a.paciente_id, formulario: "nota_enfermeria" })}>
                      Nota
                    </Boton>
                    <Menu
                      disparador={() => (
                        <Boton tamano="sm" variante="secundario" icono={<Plus className="size-3.5" />}>
                          Más
                        </Boton>
                      )}
                    >
                      {(cerrar) => (
                        <>
                          {[
                            ["control_hidrico", "Control hídrico"],
                            ["oxigenoterapia", "Oxigenoterapia"],
                            ["escala_morse", "Riesgo de caídas (Morse)"],
                            ["escala_braden", "Úlceras por presión (Braden)"],
                            ["aplicacion_medicamento", "Aplicación de medicamento"],
                          ].map(([clave, etiqueta]) => (
                            <ItemMenu key={clave} onClick={() => (cerrar(), setEntrada({ pacienteId: a.paciente_id, formulario: clave }))}>
                              {etiqueta}
                            </ItemMenu>
                          ))}
                        </>
                      )}
                    </Menu>
                    {puedeEscribir.indicar(roles) && (
                      <Boton tamano="sm" variante="secundario" icono={<Stethoscope className="size-3.5" />} onClick={() => setIndicar(a.paciente_id)}>
                        Indicar medicamento
                      </Boton>
                    )}
                  </div>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}

      <SignosRapidos paciente={signos} onCerrar={() => setSignos(null)} />
      <NuevaEntrada abierto={!!entrada} inicial={entrada ? { tipo: "formulario", formulario: entrada.formulario } : undefined} pacienteId={entrada?.pacienteId ?? ""} onCerrar={() => setEntrada(null)} />
      <NuevaIndicacion abierto={!!indicar} pacienteId={indicar} onCerrar={() => setIndicar(null)} />
      {entrega && (
        <EntregaTurno
          onCerrar={() => setEntrega(false)}
          ingresados={lista}
          signos={ultimos.data}
          riesgos={riesgos.data}
          kardex={kardex.data ?? []}
          nombre={nombre}
        />
      )}
    </>
  );
}

function EntregaTurno({
  onCerrar,
  ingresados,
  signos,
  riesgos,
  kardex,
  nombre,
}: {
  onCerrar: () => void;
  ingresados: Ingresado[];
  signos?: Map<string, SignosHoy>;
  riesgos?: Map<string, Partial<Record<"escala_morse" | "escala_braden" | "nota_enfermeria", Riesgo>>>;
  kardex: FilaKardex[];
  nombre: (a: Ingresado) => string;
}) {
  const t = turnoActual();
  const ahora = Date.now();
  return (
    <Documento abierto onCerrar={onCerrar} titulo="Entrega de turno" nombreArchivo={`Entrega de turno ${fecha(new Date().toISOString())}`}>
      <EncabezadoDocumento titulo="Entrega de turno de enfermería" subtitulo={`Turno ${TURNOS[t].etiqueta.toLowerCase()}`} />
      <TablaDocumento
        encabezados={["Cama", "Paciente", "Signos", "Riesgos", "Medicamentos del turno", "Última nota"]}
        filas={ingresados.map((a) => {
          const s = signos?.get(a.paciente_id);
          const r = riesgos?.get(a.paciente_id);
          const dosis = kardex.filter((f) => f.paciente_id === a.paciente_id && f.pauta !== "si_necesario");
          const dadas = dosis.filter((f) => f.estado === "administrada").length;
          const noDadas = dosis.filter((f) => f.estado && f.estado !== "administrada").length;
          const pend = dosis.filter((f) => !f.estado && f.programada_para && new Date(f.programada_para).getTime() <= ahora + 3_600_000).length;
          return [
            a.cama?.codigo ?? "—",
            `${nombre(a)}${a.paciente?.alergias ? ` · ALERGIAS: ${a.paciente.alergias}` : ""}${a.motivo ? ` · ${a.motivo}` : ""}`,
            s ? `${["pa", "fc", "temp", "sat"].map((k) => s.datos?.[k]).filter(Boolean).join(" · ")} (${hora(s.creado_en)})` : "Sin registro",
            [r?.escala_morse && `Caídas: ${r.escala_morse.datos.riesgo ?? "evaluado"}`, r?.escala_braden && `Úlceras: ${r.escala_braden.datos.riesgo ?? "evaluado"}`].filter(Boolean).join(" · ") || "—",
            dosis.length ? `${dadas} dadas${noDadas ? `, ${noDadas} no dadas` : ""}${pend ? `, ${pend} pendientes` : ""}` : "—",
            r?.nota_enfermeria ? `${String(r.nota_enfermeria.datos.valoracion ?? r.nota_enfermeria.datos.cuidados ?? "").slice(0, 140)} (${hora(r.nota_enfermeria.creado_en)})` : "—",
          ];
        })}
      />
      <div className="mt-12 grid grid-cols-2 gap-10 text-center text-[0.75rem]">
        <div className="border-t border-[#101828] pt-1">Entrega</div>
        <div className="border-t border-[#101828] pt-1">Recibe</div>
      </div>
    </Documento>
  );
}
