import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FormCita, useCambiarEstadoCita } from "@/components/FormCita";
import { Boton } from "@/components/ui/boton";
import { Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, ESTADO_CITA, useCitas, useMedicos, type CitaConRelaciones } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import type { EstadoCita } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn, hora, isoDia } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const HORA_INICIO = 7;
const HORA_FIN = 21;
const ALTO_HORA = 68;

const COLOR_ESTADO: Record<EstadoCita, string> = {
  programada: "border-l-[var(--borde-fuerte)]",
  confirmada: "border-l-[#2e90fa]",
  en_espera: "border-l-[var(--aviso)]",
  en_consulta: "border-l-[#7a5af8]",
  completada: "border-l-[var(--exito)]",
  cancelada: "border-l-[var(--peligro)] opacity-50",
  no_asistio: "border-l-[var(--peligro)] opacity-50",
};

export default function Agenda() {
  const { sistemaId, roles } = useSistema();
  const [params, setParams] = useSearchParams();
  const [dia, setDia] = useState(isoDia());
  const [direccion, setDireccion] = useState(0);
  const [medico, setMedico] = useState("");
  const [nueva, setNueva] = useState<{ medico?: string; hora?: string } | null>(params.get("nueva") ? {} : null);
  const [detalle, setDetalle] = useState<CitaConRelaciones | null>(null);
  const scroll = useRef<HTMLDivElement>(null);

  const medicos = useMedicos(sistemaId);
  const [desde, hasta] = useMemo(() => {
    const d = new Date(dia + "T00:00:00");
    const h = new Date(d);
    h.setDate(h.getDate() + 1);
    return [d.toISOString(), h.toISOString()];
  }, [dia]);
  const citas = useCitas(sistemaId, desde, hasta);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);

  const columnas = (medicos.data ?? []).filter((m) => !medico || m.usuario_id === medico);
  const escribir = puedeEscribir.citas(roles);
  const esHoy = dia === isoDia();

  useEffect(() => {
    // Lleva la vista a la hora actual (o a las 8:00) al abrir.
    const h = esHoy ? Math.max(new Date().getHours() - 1, HORA_INICIO) : 8;
    scroll.current?.scrollTo({ top: (h - HORA_INICIO) * ALTO_HORA, behavior: "smooth" });
  }, [dia, esHoy]);

  const mover = (dias: number) => {
    const d = new Date(dia + "T00:00:00");
    d.setDate(d.getDate() + dias);
    setDireccion(dias);
    setDia(isoDia(d));
  };

  const titulo = new Intl.DateTimeFormat("es-DO", { weekday: "long", day: "numeric", month: "long" }).format(new Date(dia + "T00:00:00"));
  const ahora = new Date();
  const lineaAhora = esHoy ? ((ahora.getHours() - HORA_INICIO) * 60 + ahora.getMinutes()) * (ALTO_HORA / 60) : null;

  return (
    <>
      <EncabezadoPagina
        titulo="Agenda"
        acciones={
          <>
            <Selector value={medico} onChange={(e) => setMedico(e.target.value)} contenedor="w-56">
              <option value="">Todos los médicos</option>
              {medicos.data?.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.perfil?.nombre_completo}
                </option>
              ))}
            </Selector>
            {escribir && (
              <Boton icono={<CalendarPlus className="size-4" />} onClick={() => setNueva({})}>
                Programar cita
              </Boton>
            )}
          </>
        }
      />

      <Tarjeta className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
          <Boton variante="secundario" tamano="icono" onClick={() => mover(-1)} aria-label="Día anterior">
            <ChevronLeft className="size-4" />
          </Boton>
          <Boton variante="secundario" tamano="icono" onClick={() => mover(1)} aria-label="Día siguiente">
            <ChevronRight className="size-4" />
          </Boton>
          <div className="relative ml-2 h-6 flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={direccion} mode="popLayout">
              <motion.h2
                key={dia}
                custom={direccion}
                initial={{ opacity: 0, x: direccion * 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direccion * -16 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="absolute text-[15px] font-semibold first-letter:uppercase"
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
        </div>

        {medicos.isLoading ? (
          <Esqueleto className="m-4 h-96 rounded-xl" />
        ) : columnas.length === 0 ? (
          <Vacio
            icono={<Stethoscope />}
            titulo="No hay médicos en este sistema"
            descripcion="Agrega personal con el rol Médico desde Personal para poder agendar."
          />
        ) : (
          <div ref={scroll} className="max-h-[calc(100vh-240px)] overflow-auto">
            <div className="flex min-w-fit">
              {/* Columna de horas */}
              <div className="sticky left-0 z-20 w-16 shrink-0 border-r border-borde bg-superficie">
                <div className="sticky top-0 z-10 h-12 border-b border-borde bg-superficie" />
                {Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => (
                  <div key={i} className="relative text-right text-[11px] text-texto-3 tabular" style={{ height: ALTO_HORA }}>
                    {i > 0 && <span className="absolute -top-2 right-2">{`${HORA_INICIO + i}:00`}</span>}
                  </div>
                ))}
              </div>

              {columnas.map((m) => {
                const suyas = citas.data?.filter((c) => c.medico_id === m.usuario_id) ?? [];
                return (
                  <div key={m.usuario_id} className="min-w-[220px] flex-1 border-r border-borde last:border-r-0">
                    <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-borde bg-superficie/95 px-3 backdrop-blur">
                      <Avatar nombre={m.perfil?.nombre_completo} tamano={24} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{m.perfil?.nombre_completo}</p>
                        {m.especialidad && <p className="truncate text-[11px] text-texto-3">{m.especialidad}</p>}
                      </div>
                      <span className="ml-auto text-xs text-texto-3 tabular">{suyas.filter((c) => c.estado !== "cancelada").length}</span>
                    </div>
                    <div className="relative" style={{ height: (HORA_FIN - HORA_INICIO) * ALTO_HORA }}>
                      {Array.from({ length: (HORA_FIN - HORA_INICIO) * 2 }, (_, i) => (
                        <button
                          key={i}
                          disabled={!escribir}
                          onClick={() => {
                            const minutos = HORA_INICIO * 60 + i * 30;
                            setNueva({
                              medico: m.usuario_id,
                              hora: `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`,
                            });
                          }}
                          className={cn(
                            "block w-full transition-colors hover:bg-marca-suave/60",
                            i % 2 === 1 ? "border-b border-borde" : "border-b border-dashed border-borde/60",
                          )}
                          style={{ height: ALTO_HORA / 2 }}
                          aria-label="Agendar en este horario"
                        />
                      ))}
                      {lineaAhora !== null && lineaAhora > 0 && (
                        <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-peligro" style={{ top: lineaAhora }}>
                          <span className="absolute -top-1 -left-1 size-2 rounded-full bg-peligro" />
                        </div>
                      )}
                      <AnimatePresence>
                        {suyas.map((c, i) => {
                          const ini = new Date(c.inicio);
                          const fin = new Date(c.fin);
                          const top = ((ini.getHours() - HORA_INICIO) * 60 + ini.getMinutes()) * (ALTO_HORA / 60);
                          const alto = Math.max(((fin.getTime() - ini.getTime()) / 60000) * (ALTO_HORA / 60) - 3, 26);
                          return (
                            <motion.button
                              key={c.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ delay: i * 0.025, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                              whileHover={{ y: -1 }}
                              onClick={() => setDetalle(c)}
                              className={cn(
                                "absolute inset-x-1.5 z-[5] overflow-hidden rounded-lg border border-l-[3px] border-borde bg-superficie px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-md",
                                COLOR_ESTADO[c.estado],
                              )}
                              style={{ top: top + 1, height: alto }}
                            >
                              <p className="truncate text-xs font-semibold">
                                {c.paciente?.nombres} {c.paciente?.apellidos}
                              </p>
                              {alto > 40 && (
                                <p className="truncate text-[11px] text-texto-3">
                                  {hora(c.inicio)} · {c.servicio?.nombre ?? c.motivo ?? "Consulta"}
                                </p>
                              )}
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
      titulo={`${c.paciente?.nombres} ${c.paciente?.apellidos}`}
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
        <Link to={`/pacientes/${c.paciente_id}`} className="inline-block pt-1 font-medium text-marca-texto hover:underline">
          Abrir ficha del paciente →
        </Link>
      </dl>
    </Modal>
  );
}
