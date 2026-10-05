import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, ChevronLeft, ChevronRight, Minus, Plus, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FormCita, useCambiarEstadoCita } from "@/components/FormCita";
import { Boton } from "@/components/ui/boton";
import { Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, ESTADO_CITA, nombrePaciente, SIN_ESPECIALIDAD, useCitas, useMedicos, type CitaConRelaciones } from "@/lib/consultas";
import { OpcionesMedicos } from "@/components/OpcionesMedicos";
import { puedeEscribir } from "@/lib/permisos";
import type { EstadoCita } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn, hora, horaCorta, isoDia } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { useAccionUrl } from "@/lib/accionUrl";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";

const HORA_INICIO = 8;
const HORA_FIN = 17;
const ANCHO_MEDICO = 190; // columna fija de la izquierda (médico)
const ALTO_FILA = 66;
const PX_MIN = 64;
const PX_MAX = 260;
const PX_DEFECTO = 120; // píxeles por hora al abrir
const CLAVE_ZOOM = "medora.agenda-zoom";

const COLUMNAS_AGENDA: ColumnaDatos<CitaConRelaciones>[] = [
  { titulo: "Hora", valor: (c) => `${hora(c.inicio)} – ${hora(c.fin)}` },
  { titulo: "Profesional", valor: (c) => c.medico?.nombre_completo },
  { titulo: "Paciente", valor: (c) => nombrePaciente(c) },
  { titulo: "Expediente", valor: (c) => c.paciente?.expediente },
  { titulo: "Servicio / motivo", valor: (c) => c.servicio?.nombre ?? c.motivo },
  { titulo: "Estado", valor: (c) => ESTADO_CITA[c.estado].etiqueta },
];

// Color base de cada estado (para los bloques de la línea de tiempo).
const COLOR: Record<EstadoCita, string> = {
  programada: "var(--texto-3)",
  confirmada: "#2e90fa",
  por_cobrar: "var(--aviso)",
  en_espera: "var(--aviso)",
  llamado: "#53b1fd",
  en_consulta: "#7a5af8",
  completada: "var(--exito)",
  cancelada: "var(--peligro)",
  no_asistio: "var(--peligro)",
};
const minutosDia = (d: Date) => d.getHours() * 60 + d.getMinutes();

export default function Agenda() {
  const { sistemaId, roles, soloPropio } = useSistema();
  const yo = useSesion().sesion!.user.id;
  const [params, setParams] = useSearchParams();
  // ?fecha=YYYY-MM-DD abre ese día (enlaces de "Pregúntale a MEDORA").
  const [dia, setDia] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get("fecha") ?? "") ? params.get("fecha")! : isoDia()));
  const [direccion, setDireccion] = useState(0);
  const [px, setPx] = useState(() => {
    try {
      return Math.min(PX_MAX, Math.max(PX_MIN, Number(localStorage.getItem(CLAVE_ZOOM)) || PX_DEFECTO));
    } catch {
      return PX_DEFECTO;
    }
  });
  const [medico, setMedico] = useState(soloPropio ? yo : "");
  const [nueva, setNueva] = useState<{ medico?: string; hora?: string } | null>(params.get("nueva") ? {} : null);
  const [detalle, setDetalle] = useState<CitaConRelaciones | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useAccionUrl({ nueva: () => setNueva(soloPropio ? { medico: yo } : {}) });

  const medicos = useMedicos(sistemaId);
  const [desde, hasta] = useMemo(() => {
    const d = new Date(dia + "T00:00:00");
    const h = new Date(d);
    h.setDate(h.getDate() + 1);
    return [d.toISOString(), h.toISOString()];
  }, [dia]);
  const citas = useCitas(sistemaId, desde, hasta);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);

  const esp = medico.startsWith("esp:") ? medico.slice(4) : null;
  const columnas = (medicos.data ?? []).filter((m) =>
    !medico ? true : esp ? (m.especialidad?.trim() || SIN_ESPECIALIDAD) === esp : m.usuario_id === medico,
  );
  const idsVisibles = new Set(columnas.map((m) => m.usuario_id));
  const escribir = puedeEscribir.citas(roles);
  const esHoy = dia === isoDia();

  const horas = HORA_FIN - HORA_INICIO;
  const anchoPista = horas * px;

  // Estados presentes hoy (para la leyenda).
  const presentes = useMemo(() => {
    const vistos = new Set<EstadoCita>();
    for (const c of citas.data ?? []) if (!c.medico_id || idsVisibles.has(c.medico_id)) vistos.add(c.estado);
    return [...vistos];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citas.data, medico]);

  const guardarZoom = (v: number) => {
    setPx(v);
    try {
      localStorage.setItem(CLAVE_ZOOM, String(v));
    } catch {
      /* sin almacenamiento */
    }
  };

  useEffect(() => {
    // Lleva la vista a la hora actual (o a las 8:00) al abrir o cambiar de día/zoom.
    const h = esHoy ? Math.max(new Date().getHours() - 1, HORA_INICIO) : 8;
    scroll.current?.scrollTo({ left: (h - HORA_INICIO) * px - 24, behavior: "smooth" });
  }, [dia, esHoy, px]);

  const mover = (dias: number) => {
    const d = new Date(dia + "T00:00:00");
    d.setDate(d.getDate() + dias);
    setDireccion(dias);
    setDia(isoDia(d));
  };

  const titulo = new Intl.DateTimeFormat("es-DO", { weekday: "long", day: "numeric", month: "long" }).format(new Date(dia + "T00:00:00"));
  const ahora = new Date();
  const ahoraMin = minutosDia(ahora);
  const ahoraX = esHoy && ahoraMin >= HORA_INICIO * 60 && ahoraMin <= HORA_FIN * 60 ? ((ahoraMin - HORA_INICIO * 60) / 60) * px : null;

  return (
    <>
      <EncabezadoPagina
        titulo={soloPropio ? "Mi agenda" : "Agenda"}
        acciones={
          <>
            {!soloPropio && (
              <Selector value={medico} onChange={(e) => setMedico(e.target.value)} contenedor="w-64">
                <option value="">Todos los médicos</option>
                <OpcionesMedicos medicos={medicos.data ?? []} especialidades />
              </Selector>
            )}
            <AccionesDatos
              titulo={`Agenda del ${titulo}`}
              columnas={COLUMNAS_AGENDA}
              obtener={async () => (citas.data ?? []).filter((c) => !medico || (!!c.medico_id && idsVisibles.has(c.medico_id)))}
            />
            {escribir && (
              <Boton icono={<CalendarPlus className="size-4" />} onClick={() => setNueva(soloPropio ? { medico: yo } : {})}>
                Programar cita
              </Boton>
            )}
          </>
        }
      />

      <Tarjeta className="overflow-hidden">
        {/* Barra: navegación de día, fecha, leyenda y zoom */}
        <div className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3">
          <Boton variante="secundario" tamano="icono" onClick={() => mover(-1)} aria-label="Día anterior">
            <ChevronLeft className="size-4" />
          </Boton>
          <Boton variante="secundario" tamano="icono" onClick={() => mover(1)} aria-label="Día siguiente">
            <ChevronRight className="size-4" />
          </Boton>
          <div className="relative ml-1 h-6 w-56 overflow-hidden">
            <AnimatePresence initial={false} custom={direccion} mode="popLayout">
              <motion.h2
                key={dia}
                custom={direccion}
                initial={{ opacity: 0, x: direccion * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direccion * -16 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="absolute text-[0.9375rem] font-semibold first-letter:uppercase"
              >
                {titulo}
              </motion.h2>
            </AnimatePresence>
          </div>
          {!esHoy && (
            <Boton variante="suave" tamano="sm" onClick={() => (setDireccion(dia > isoDia() ? -1 : 1), setDia(isoDia()))}>
              Hoy
            </Boton>
          )}
          <input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && setDia(e.target.value)}
            className="h-8 rounded-lg border border-borde bg-superficie px-2 text-sm"
          />

          {/* Leyenda de estados */}
          {presentes.length > 0 && (
            <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 lg:flex">
              {presentes.map((e) => (
                <span key={e} className="flex items-center gap-1.5 text-xs text-texto-2">
                  <span className="size-2.5 rounded-[3px]" style={{ background: COLOR[e] }} />
                  {ESTADO_CITA[e].etiqueta}
                </span>
              ))}
            </div>
          )}

          {/* Zoom */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => guardarZoom(Math.max(PX_MIN, px - 24))}
              className="grid size-7 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
              aria-label="Alejar"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="range"
              min={PX_MIN}
              max={PX_MAX}
              step={4}
              value={px}
              onChange={(e) => guardarZoom(Number(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-[var(--marca)]"
              aria-label="Nivel de zoom"
            />
            <button
              onClick={() => guardarZoom(Math.min(PX_MAX, px + 24))}
              className="grid size-7 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
              aria-label="Acercar"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {medicos.isLoading ? (
          <Esqueleto className="m-4 h-96 rounded-xl" />
        ) : columnas.length === 0 ? (
          <Vacio
            icono={<Stethoscope />}
            titulo="No hay profesionales con agenda"
            descripcion="En Personal, activa “Atiende citas” para médicos, psicología, nutricion o terapia."
          />
        ) : (
          <div ref={scroll} className="max-h-[calc(100vh-250px)] overflow-auto">
            <div style={{ width: ANCHO_MEDICO + anchoPista }}>
              {/* Encabezado: horas */}
              <div className="sticky top-0 z-30 flex border-b border-borde bg-superficie">
                <div className="sticky left-0 z-10 shrink-0 border-r border-borde bg-superficie px-4 py-2 text-xs font-medium text-texto-3" style={{ width: ANCHO_MEDICO }}>
                  Médicos
                </div>
                <div className="relative" style={{ width: anchoPista, height: 34 }}>
                  {Array.from({ length: horas + 1 }, (_, i) => (
                    <span key={i} className="absolute top-2 -translate-x-1/2 text-[0.6875rem] text-texto-3 tabular" style={{ left: i * px }}>
                      {i < horas && horaCorta(HORA_INICIO + i)}
                    </span>
                  ))}
                  {ahoraX !== null && (
                    <span className="absolute top-1 z-10 -translate-x-1/2 rounded-md bg-peligro px-1.5 py-0.5 text-[0.625rem] font-semibold text-white tabular" style={{ left: ahoraX }}>
                      Ahora {hora(ahora)}
                    </span>
                  )}
                </div>
              </div>

              {/* Filas por médico */}
              {columnas.map((m) => {
                const suyas = citas.data?.filter((c) => c.medico_id === m.usuario_id) ?? [];
                const activas = suyas.filter((c) => c.estado !== "cancelada" && c.estado !== "no_asistio");
                return (
                  <div key={m.usuario_id} className="flex border-b border-borde last:border-b-0">
                    {/* Médico (fijo a la izquierda) */}
                    <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-borde bg-superficie px-3" style={{ width: ANCHO_MEDICO, height: ALTO_FILA }}>
                      <Avatar nombre={m.perfil?.nombre_completo} foto={m.perfil?.foto} tamano={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] font-semibold">{m.perfil?.nombre_completo}</p>
                        <p className="truncate text-[0.6875rem] text-texto-3">{m.especialidad || "—"}</p>
                      </div>
                      {activas.length > 0 && (
                        <span className="shrink-0 rounded-full bg-superficie-2 px-1.5 py-0.5 text-[0.625rem] font-semibold text-texto-2 tabular">{activas.length}</span>
                      )}
                    </div>

                    {/* Pista de tiempo */}
                    <div className="relative" style={{ width: anchoPista, height: ALTO_FILA }}>
                      {/* Celdas de media hora para agendar + líneas de hora */}
                      {Array.from({ length: horas * 2 }, (_, i) => {
                        const minutos = HORA_INICIO * 60 + i * 30;
                        return (
                          <button
                            key={i}
                            disabled={!escribir}
                            onClick={() =>
                              setNueva({ medico: m.usuario_id, hora: `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}` })
                            }
                            className={cn("absolute inset-y-0 transition-colors enabled:hover:bg-marca-suave/50", i % 2 === 0 ? "border-l border-borde" : "border-l border-dashed border-borde/50")}
                            style={{ left: (i * px) / 2, width: px / 2 }}
                            aria-label="Agendar en este horario"
                          />
                        );
                      })}

                      {ahoraX !== null && <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-peligro" style={{ left: ahoraX }} />}

                      <AnimatePresence>
                        {suyas.map((c, i) => {
                          const ini = new Date(c.inicio);
                          const fin = new Date(c.fin);
                          const left = ((minutosDia(ini) - HORA_INICIO * 60) / 60) * px;
                          const ancho = Math.max(((fin.getTime() - ini.getTime()) / 3_600_000) * px - 3, 40);
                          const color = COLOR[c.estado];
                          const apagada = c.estado === "cancelada" || c.estado === "no_asistio";
                          return (
                            <motion.button
                              key={c.id}
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                              whileHover={{ y: -1 }}
                              onClick={() => setDetalle(c)}
                              title={`${nombrePaciente(c)} · ${hora(c.inicio)} · ${ESTADO_CITA[c.estado].etiqueta}`}
                              className={cn("absolute top-1.5 z-[5] overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-md", apagada && "opacity-55")}
                              style={{
                                left: left + 1,
                                width: ancho,
                                height: ALTO_FILA - 12,
                                borderLeftColor: color,
                                background: `color-mix(in oklab, ${color} 14%, var(--superficie))`,
                              }}
                            >
                              <p className={cn("truncate text-xs font-semibold", apagada && "line-through")}>{nombrePaciente(c)}</p>
                              <p className="truncate text-[0.6875rem] text-texto-2">
                                {hora(c.inicio)}
                                {ancho > 120 ? ` · ${c.servicio?.nombre ?? c.motivo ?? "Consulta"}` : ""}
                              </p>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Tarjeta>

      <FormCita
        abierto={!!nueva}
        onCerrar={() => {
          setNueva(null);
          if (params.has("nueva")) setParams({}, { replace: true });
        }}
        dia={dia}
        medicoInicial={nueva?.medico}
        horaInicial={nueva?.hora}
      />
      <DetalleCita cita={detalle} onCerrar={() => setDetalle(null)} escribir={escribir} />
    </>
  );
}

function DetalleCita({ cita, onCerrar, escribir }: { cita: CitaConRelaciones | null; onCerrar: () => void; escribir: boolean }) {
  const cambiar = useCambiarEstadoCita();
  const [ultima, setUltima] = useState(cita);
  useEffect(() => {
    if (cita) setUltima(cita);
  }, [cita]);
  const c = cita ?? ultima;
  if (!c) return null;

  const accion = (estado: EstadoCita) => {
    cambiar.mutate({ id: c.id, estado });
    onCerrar();
  };
  const activa = !["completada", "cancelada", "no_asistio"].includes(c.estado);

  return (
    <Modal
      abierto={!!cita}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={nombrePaciente(c)}
      descripcion={`${hora(c.inicio)} – ${hora(c.fin)} · ${c.medico?.nombre_completo}`}
      pie={
        escribir && activa ? (
          <>
            <Boton variante="fantasma" className="mr-auto text-peligro" onClick={() => accion("cancelada")}>
              Cancelar cita
            </Boton>
            {c.estado === "programada" && (
              <Boton variante="secundario" onClick={() => accion("confirmada")}>
                Confirmar
              </Boton>
            )}
            {(c.estado === "programada" || c.estado === "confirmada") && <Boton onClick={() => accion("en_espera")}>Registrar llegada</Boton>}
          </>
        ) : undefined
      }
    >
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-texto-3">Estado</dt>
          <dd>
            <Insignia tono={ESTADO_CITA[c.estado].tono}>{ESTADO_CITA[c.estado].etiqueta}</Insignia>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-texto-3">Servicio</dt>
          <dd>{c.servicio?.nombre ?? "Consulta general"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-texto-3">Expediente</dt>
          <dd className="tabular">{c.paciente?.expediente}</dd>
        </div>
        {c.motivo && (
          <div>
            <dt className="text-texto-3">Motivo</dt>
            <dd className="mt-1">{c.motivo}</dd>
          </div>
        )}
        {c.paciente_id ? (
          <Link to={`/pacientes/${c.paciente_id}`} className="inline-block pt-1 font-medium text-marca-texto hover:underline">
            Abrir ficha del paciente →
          </Link>
        ) : (
          <p className="pt-1 text-texto-3">Paciente por identificar en caja o recepción.</p>
        )}
      </dl>
    </Modal>
  );
}
