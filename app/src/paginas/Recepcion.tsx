import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowRight,
  BellRing,
  Check,
  Clock,
  DoorOpen,
  FolderOpen,
  Megaphone,
  MoreHorizontal,
  Printer,
  Repeat,
  Stethoscope,
  Tv,
  UserCheck,
  UserPlus,
  UserX,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCambiarEstadoCita } from "@/components/FormCita";
import { OpcionesMedicos } from "@/components/OpcionesMedicos";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { SelectorServicio } from "@/components/SelectorServicio";
import { destinoTurno, TicketTurno } from "@/components/TicketTurno";
import { Boton } from "@/components/ui/boton";
import { Campo, Interruptor, Selector } from "@/components/ui/campos";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import {
  claves,
  ESTADO_CITA,
  MOTIVOS_PRIORIDAD,
  nombrePaciente,
  SELECT_CITA,
  useCitas,
  useMedicos,
  useServicios,
  useTurnosHoy,
  type CitaConRelaciones,
} from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type EstadoCita, type Fila } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn, hora } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { useAccionUrl } from "@/lib/accionUrl";

const COLUMNAS: { clave: string; titulo: string; estados: EstadoCita[]; icono: typeof Clock }[] = [
  { clave: "llegar", titulo: "Por llegar", estados: ["programada", "confirmada"], icono: Clock },
  { clave: "cobrar", titulo: "En caja", estados: ["por_cobrar"], icono: Wallet },
  { clave: "espera", titulo: "En espera", estados: ["en_espera"], icono: DoorOpen },
  { clave: "consulta", titulo: "En consulta", estados: ["llamado", "en_consulta"], icono: Stethoscope },
  { clave: "listo", titulo: "Atendidos", estados: ["completada"], icono: Check },
];

/** Cola: prioridad legal primero, después orden de llegada. */
const ordenCola = (a: CitaConRelaciones, b: CitaConRelaciones) =>
  Number(b.prioridad) - Number(a.prioridad) || (a.turno_en ?? a.inicio).localeCompare(b.turno_en ?? b.inicio);

function useAhora(ms = 30_000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}

const minutosDesde = (iso: string | null, ahora: number) => (iso ? Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000)) : null);

export default function Recepcion() {
  const { soloPropio } = useSistema();
  return soloPropio ? <MiConsulta /> : <TableroRecepcion />;
}

// ---------------------------------------------------------------------------
// Recepción: todas las colas del día
// ---------------------------------------------------------------------------
function TableroRecepcion() {
  const { sistemaId, roles } = useSistema();
  const navigate = useNavigate();
  const [medico, setMedico] = useState("");
  const [llegada, setLlegada] = useState<CitaConRelaciones | "nueva" | null>(null);
  const [reasignar, setReasignar] = useState<CitaConRelaciones | null>(null);
  const [ticket, setTicket] = useState<CitaConRelaciones | null>(null);
  const [identificar, setIdentificar] = useState<CitaConRelaciones | null>(null);
  const medicos = useMedicos(sistemaId);
  const cambiar = useCambiarEstadoCita();
  const ahora = useAhora();
  useAccionUrl({ llegada: () => setLlegada("nueva") });

  const [desde, hasta] = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const h = new Date(d);
    h.setDate(h.getDate() + 1);
    return [d.toISOString(), h.toISOString()];
  }, []);
  const citas = useCitas(sistemaId, desde, hasta);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)], ["dashboard", sistemaId]]);

  // "" = todos; "esp:<nombre>" = una especialidad; si no, un médico.
  const esp = medico.startsWith("esp:") ? medico.slice(4) : null;
  const visibles = (citas.data ?? []).filter((c) =>
    !medico
      ? true
      : esp
        ? c.especialidad === esp || medicos.data?.find((m) => m.usuario_id === c.medico_id)?.especialidad === esp
        : c.medico_id === medico,
  );
  const escribir = puedeEscribir.citas(roles);
  const ausentes = visibles.filter((c) => c.estado === "cancelada" || c.estado === "no_asistio").length;

  return (
    <>
      <EncabezadoPagina
        titulo="Recepción"
        descripcion="Llegadas, caja y turnos de hoy. Se actualiza en vivo en todas las estaciones."
        acciones={
          <>
            <Selector value={medico} onChange={(e) => setMedico(e.target.value)} contenedor="w-64">
              <option value="">Todos los médicos</option>
              <OpcionesMedicos medicos={medicos.data ?? []} especialidades />
            </Selector>
            <Boton variante="secundario" icono={<Tv className="size-4" />} onClick={() => navigate("/pantalla")} title="Pantalla de llamados para el TV de la sala (Esc para volver)">
              Pantalla de sala
            </Boton>
            {escribir && (
              <Boton icono={<UserPlus className="size-4" />} onClick={() => setLlegada("nueva")}>
                Registrar llegada
              </Boton>
            )}
          </>
        }
      />

      <LayoutGroup>
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMNAS.map((col) => {
            const items = visibles.filter((c) => col.estados.includes(c.estado));
            if (col.clave === "espera") items.sort(ordenCola);
            return (
              <div key={col.clave} className="flex min-h-[60vh] flex-col rounded-2xl border border-borde bg-superficie-2/50">
                <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                  <col.icono className="size-4 text-texto-3" />
                  <span className="text-sm font-semibold">{col.titulo}</span>
                  <motion.span
                    key={items.length}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}
                    className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-superficie px-1.5 text-xs font-semibold text-texto-2 shadow-sm tabular"
                  >
                    {items.length}
                  </motion.span>
                </div>
                <div className="flex-1 space-y-2.5 px-3 pb-3">
                  {citas.isLoading ? (
                    <>
                      <Esqueleto className="h-24 rounded-xl" />
                      <Esqueleto className="h-24 rounded-xl opacity-60" />
                    </>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {items.map((c) => (
                        <TarjetaCita
                          key={c.id}
                          c={c}
                          ahora={ahora}
                          escribir={escribir}
                          onEstado={(estado) => cambiar.mutate({ id: c.id, estado })}
                          onLlego={() => setLlegada(c)}
                          onReasignar={() => setReasignar(c)}
                          onTicket={() => setTicket(c)}
                          onIdentificar={() => setIdentificar(c)}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </LayoutGroup>

      {ausentes > 0 && (
        <p className="mt-4 text-sm text-texto-3">
          {ausentes} cita{ausentes > 1 ? "s" : ""} cancelada{ausentes > 1 ? "s" : ""} o sin asistencia hoy ·{" "}
          <Link to="/agenda" className="font-medium text-marca-texto hover:underline">
            ver agenda
          </Link>
        </p>
      )}

      <RegistrarLlegada cita={llegada} onCerrar={() => setLlegada(null)} onTurno={setTicket} />
      <Reasignar cita={reasignar} onCerrar={() => setReasignar(null)} />
      <IdentificarPaciente cita={identificar} onCerrar={() => setIdentificar(null)} />
      <TicketTurno
        cita={ticket}
        delante={ticket ? visibles.filter((x) => x.estado === "en_espera" && ordenCola(x, ticket) < 0 && x.id !== ticket.id).length : undefined}
        onCerrar={() => setTicket(null)}
      />
    </>
  );
}

function TarjetaCita({
  c,
  ahora,
  escribir,
  onEstado,
  onLlego,
  onReasignar,
  onTicket,
  onIdentificar,
}: {
  c: CitaConRelaciones;
  ahora: number;
  escribir: boolean;
  onEstado: (e: EstadoCita) => void;
  onLlego: () => void;
  onReasignar: () => void;
  onTicket: () => void;
  onIdentificar: () => void;
}) {
  const esperando = c.estado === "en_espera" ? minutosDesde(c.turno_en, ahora) : c.estado === "por_cobrar" ? minutosDesde(c.llegada_en, ahora) : null;
  const activa = !["completada", "cancelada", "no_asistio"].includes(c.estado);

  return (
    <motion.div
      layout
      layoutId={c.id}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
    >
      <Tarjeta className={cn("p-3.5", c.prioridad && activa && "ring-1 ring-aviso/60")}>
        <div className="flex items-start gap-2.5">
          {c.turno ? (
            <span className="grid h-8 min-w-12 place-items-center rounded-lg bg-marca-suave px-1.5 font-mono text-[0.8125rem] font-bold text-marca-texto">{c.turno}</span>
          ) : (
            <Avatar nombre={nombrePaciente(c)} tamano={30} />
          )}
          <div className="min-w-0 flex-1">
            {c.paciente_id ? (
              <Link to={`/pacientes/${c.paciente_id}`} className="block truncate text-sm font-semibold hover:underline">
                {nombrePaciente(c)}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold text-aviso">{nombrePaciente(c)}</p>
            )}
            <p className="truncate text-xs text-texto-3">
              {c.estado === "programada" || c.estado === "confirmada" ? `${hora(c.inicio)} · ` : ""}
              {destinoTurno(c)}
            </p>
          </div>
          {escribir && activa && (
            <Menu
              alinear="derecha"
              ancho={210}
              disparador={() => (
                <button className="-mr-1 grid size-7 place-items-center rounded-md text-texto-3 hover:bg-superficie-2 hover:text-texto">
                  <MoreHorizontal className="size-4" />
                </button>
              )}
            >
              {(cerrar) => (
                <>
                  {c.estado === "programada" && (
                    <ItemMenu icono={<Check />} onClick={() => (onEstado("confirmada"), cerrar())}>
                      Confirmar
                    </ItemMenu>
                  )}
                  {!c.paciente_id && (
                    <ItemMenu icono={<UserCheck />} onClick={() => (onIdentificar(), cerrar())}>
                      Identificar paciente
                    </ItemMenu>
                  )}
                  {["por_cobrar", "en_espera"].includes(c.estado) && (
                    <ItemMenu icono={<Repeat />} onClick={() => (onReasignar(), cerrar())}>
                      Cambiar de médico
                    </ItemMenu>
                  )}
                  {c.turno && (
                    <ItemMenu icono={<Printer />} onClick={() => (onTicket(), cerrar())}>
                      Imprimir turno
                    </ItemMenu>
                  )}
                  <ItemMenu icono={<UserX />} onClick={() => (onEstado("no_asistio"), cerrar())}>
                    No asistió / se fue
                  </ItemMenu>
                  <ItemMenu icono={<XCircle />} peligro onClick={() => (onEstado("cancelada"), cerrar())}>
                    Cancelar
                  </ItemMenu>
                </>
              )}
            </Menu>
          )}
        </div>
        {(c.servicio || (c.motivo && c.motivo !== "Llegada sin cita")) && (
          <p className="mt-2 line-clamp-2 text-xs text-texto-2">{c.servicio?.nombre ?? c.motivo}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {esperando !== null ? (
            <Insignia tono={esperando > 30 ? "peligro" : esperando > 15 ? "aviso" : "neutro"} punto>
              {esperando} min
            </Insignia>
          ) : (
            <Insignia tono={ESTADO_CITA[c.estado].tono}>
              {ESTADO_CITA[c.estado].etiqueta}
              {c.estado === "llamado" && c.llamado_veces > 1 ? ` ×${c.llamado_veces}` : ""}
            </Insignia>
          )}
          {c.prioridad && activa && <Insignia tono="aviso">{c.motivo_prioridad ?? "Prioridad"}</Insignia>}
          {c.motivo_exoneracion && <Insignia tono="violeta">Exonerado</Insignia>}
          {escribir && (c.estado === "programada" || c.estado === "confirmada") && (
            <button
              onClick={onLlego}
              className="group ml-auto inline-flex h-7 items-center gap-1 rounded-lg bg-marca-suave px-2.5 text-xs font-medium whitespace-nowrap text-marca-texto transition-colors hover:brightness-95"
            >
              Llegó
              <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          )}
          {c.estado === "por_cobrar" && <span className="ml-auto text-xs text-texto-3">Pasar por caja</span>}
        </div>
      </Tarjeta>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Registrar llegada (con o sin cita) → caja → turno
// ---------------------------------------------------------------------------
export function RegistrarLlegada({
  cita,
  medicoInicial,
  onCerrar,
  onTurno,
}: {
  cita: CitaConRelaciones | "nueva" | null;
  /** Médico ya elegido (p. ej. desde el directorio de médicos). */
  medicoInicial?: string;
  onCerrar: () => void;
  onTurno: (c: CitaConRelaciones) => void;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const medicos = useMedicos(sistemaId);
  const servicios = useServicios(sistemaId);
  const existente = cita && cita !== "nueva" ? cita : null;
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [destino, setDestino] = useState("");
  const [servicio, setServicio] = useState<Fila<"servicios"> | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [prioridad, setPrioridad] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS_PRIORIDAD[0]);

  useEffect(() => {
    if (!cita) return;
    setPaciente(existente?.paciente ? { ...existente.paciente } : null);
    setDestino(existente?.medico_id ?? (existente?.especialidad ? `esp:${existente.especialidad}` : (medicoInicial ?? "")));
    setServicio(servicios.data?.find((s) => s.id === existente?.servicio_id) ?? null);
    setArea(null);
    setPrioridad(false);
    setMotivo(MOTIVOS_PRIORIDAD[0]);
  }, [cita, existente, servicios.data, medicoInicial]);

  // Al elegir médico, el catálogo se abre en su área.
  useEffect(() => {
    const m = medicos.data?.find((x) => x.usuario_id === destino);
    setArea(destino.startsWith("esp:") ? destino.slice(4) : (m?.especialidad ?? null));
  }, [destino, medicos.data]);

  const m = useMutation({
    mutationFn: async () => {
      const esp = destino.startsWith("esp:") ? destino.slice(4) : undefined;
      const r = datos(
        await supabase.rpc("registrar_llegada", {
          p_sistema: sistemaId,
          p_paciente: paciente!.id,
          p_medico: esp ? undefined : destino || undefined,
          p_especialidad: esp,
          p_servicio: servicio?.id,
          p_cita: existente?.id,
          p_prioridad: prioridad,
          p_motivo_prioridad: prioridad ? motivo : undefined,
        }),
      ) as { id: string; estado: EstadoCita; turno: string | null };
      return r;
    },
    onSuccess: async (r) => {
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      onCerrar();
      if (r.turno) {
        toast.success(`Turno ${r.turno} asignado`);
        const c = datos(await supabase.from("citas").select(SELECT_CITA).eq("id", r.id).single()) as unknown as CitaConRelaciones;
        onTurno(c);
      } else {
        toast.success("Enviado a caja: al cobrar recibe su turno");
      }
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!cita}
      onCerrar={onCerrar}
      titulo={existente ? "Llegó a su cita" : "Registrar llegada"}
      descripcion="Pasa por caja y, al cobrar, recibe su número de turno."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!paciente || !destino} onClick={() => m.mutate()}>
            {existente ? "Confirmar llegada" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {existente ? (
          <Campo etiqueta="Paciente">
            {() => (
              <p className="flex h-9 items-center rounded-[10px] border border-borde bg-superficie-2 px-3 text-sm font-medium">
                {nombrePaciente(existente)}
              </p>
            )}
          </Campo>
        ) : (
          <SelectorPaciente valor={paciente} onChange={setPaciente} />
        )}
        <Selector etiqueta="¿Con quién?" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Seleccionar…</option>
          <OpcionesMedicos medicos={medicos.data ?? []} especialidades etiquetaEspecialidad={(e) => `Cualquier médico de ${e}`} />
        </Selector>
        <Campo etiqueta="Servicio (para cobrarlo en caja)">
          {() => (
            <div className="flex items-center gap-2">
              <span className={cn("min-w-0 flex-1 truncate text-sm", !servicio && "text-texto-3")}>{servicio?.nombre ?? "Sin elegir: caja lo agrega"}</span>
              <SelectorServicio servicios={servicios.data ?? []} pactados={null} area={area} onArea={setArea} onElegir={setServicio} />
            </div>
          )}
        </Campo>
        <div className="space-y-2 rounded-xl border border-borde p-3">
          <Interruptor activo={prioridad} onChange={setPrioridad} etiqueta="Atención preferencial (pasa primero)" />
          {prioridad && (
            <Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_PRIORIDAD.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Selector>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Turno del quiosco sin paciente: se busca por la cédula que escribió (o se
 * registra ahí mismo) y queda enlazado. Caja también lo hace al cobrar.
 */
export function IdentificarPaciente({ cita, onCerrar, onListo }: { cita: CitaConRelaciones | null; onCerrar: () => void; onListo?: (p: PacienteBreve) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  useEffect(() => {
    if (cita) setPaciente(null);
  }, [cita]);
  const m = useMutation({
    mutationFn: async () => datos(await supabase.rpc("identificar_turno", { p_cita: cita!.id, p_paciente: paciente!.id })),
    onSuccess: () => {
      toast.success(`Turno ${cita?.turno ?? ""} a nombre de ${paciente!.nombres} ${paciente!.apellidos}`);
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      onListo?.(paciente!);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={!!cita}
      onCerrar={onCerrar}
      titulo="Identificar paciente"
      descripcion={cita ? `Turno ${cita.turno ?? ""} tomado en el quiosco${cita.cedula_llegada ? ` con la cédula ${nombrePaciente(cita).replace("Por identificar · ", "")}` : " sin cédula"}. Búscalo o regístralo.` : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!paciente} onClick={() => m.mutate()}>
            Enlazar al turno
          </Boton>
        </>
      }
    >
      <SelectorPaciente valor={paciente} onChange={setPaciente} textoInicial={cita?.cedula_llegada ?? undefined} />
    </Modal>
  );
}

function Reasignar({ cita, onCerrar }: { cita: CitaConRelaciones | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const medicos = useMedicos(sistemaId);
  const [destino, setDestino] = useState("");
  useEffect(() => {
    if (cita) setDestino(cita.medico_id ?? (cita.especialidad ? `esp:${cita.especialidad}` : ""));
  }, [cita]);

  const m = useMutation({
    mutationFn: async () => {
      const esp = destino.startsWith("esp:") ? destino.slice(4) : null;
      const med = esp ? null : medicos.data?.find((x) => x.usuario_id === destino);
      const { error } = await supabase
        .from("citas")
        .update({ medico_id: esp ? null : destino, especialidad: esp ?? med?.especialidad?.trim() ?? cita!.especialidad })
        .eq("id", cita!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Paciente reasignado");
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!cita}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Cambiar de médico"
      descripcion={cita ? `${cita.turno ? `${cita.turno} · ` : ""}${nombrePaciente(cita)}. Conserva su lugar en la fila.` : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!destino} onClick={() => m.mutate()}>
            Reasignar
          </Boton>
        </>
      }
    >
      <Selector etiqueta="Pasar a" value={destino} onChange={(e) => setDestino(e.target.value)}>
        <OpcionesMedicos medicos={medicos.data ?? []} especialidades etiquetaEspecialidad={(e) => `Cualquier médico de ${e}`} />
      </Selector>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Mi consulta (vista del médico)
// ---------------------------------------------------------------------------
function MiConsulta() {
  const { sistemaId } = useSistema();
  const yo = useSesion().sesion!.user.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const turnos = useTurnosHoy(sistemaId);
  const cambiar = useCambiarEstadoCita();
  const ahora = useAhora();
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)], ["dashboard", sistemaId]]);

  const lista = turnos.data ?? [];
  const actual = lista.find((c) => c.medico_id === yo && (c.estado === "llamado" || c.estado === "en_consulta"));
  const cola = lista.filter((c) => c.estado === "en_espera").sort(ordenCola);
  const atendidos = lista.filter((c) => c.medico_id === yo && c.estado === "completada").length;
  const refrescar = () => void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });

  const llamar = useMutation({
    mutationFn: async (cita?: string) =>
      (cita ? datos(await supabase.rpc("llamar_turno", { p_cita: cita })) : datos(await supabase.rpc("llamar_siguiente", { p_sistema: sistemaId }))) as {
        turno: string;
      } | null,
    onSuccess: (r) => {
      if (r) toast.success(`Llamando al turno ${r.turno}`);
      else toast.info("No hay pacientes esperando");
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const nombre = nombrePaciente;

  return (
    <>
      <EncabezadoPagina titulo="Mi consulta" descripcion={`Tus pacientes de hoy, en vivo · ${atendidos} atendido${atendidos === 1 ? "" : "s"}`} />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Tarjeta className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
          {turnos.isLoading ? (
            <Esqueleto className="h-40 w-full" />
          ) : actual ? (
            <>
              <Insignia tono={ESTADO_CITA[actual.estado].tono} punto>
                {actual.estado === "llamado" ? `Llamado${actual.llamado_veces > 1 ? ` ×${actual.llamado_veces}` : ""}` : "En consulta"}
              </Insignia>
              <p className="font-mono text-6xl font-black tracking-wide text-marca">{actual.turno}</p>
              <div>
                <p className="text-xl font-semibold">{nombre(actual)}</p>
                <p className="text-sm text-texto-3">
                  Exp. {actual.paciente?.expediente}
                  {actual.servicio ? ` · ${actual.servicio.nombre}` : ""}
                  {actual.prioridad ? ` · ${actual.motivo_prioridad ?? "Prioridad"}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {actual.estado === "llamado" ? (
                  <>
                    <Boton variante="secundario" icono={<Megaphone className="size-4" />} cargando={llamar.isPending} onClick={() => llamar.mutate(actual.id)}>
                      Volver a llamar
                    </Boton>
                    <Boton variante="secundario" icono={<UserX className="size-4" />} onClick={() => cambiar.mutate({ id: actual.id, estado: "no_asistio" })}>
                      No se presentó
                    </Boton>
                    <Boton
                      icono={<Stethoscope className="size-4" />}
                      onClick={() => {
                        cambiar.mutate({ id: actual.id, estado: "en_consulta" });
                        if (actual.paciente_id) navigate(`/pacientes/${actual.paciente_id}`);
                      }}
                    >
                      Iniciar consulta
                    </Boton>
                  </>
                ) : (
                  <>
                    <Boton variante="secundario" icono={<FolderOpen className="size-4" />} disabled={!actual.paciente_id} onClick={() => navigate(`/pacientes/${actual.paciente_id}`)}>
                      Abrir expediente
                    </Boton>
                    <Boton icono={<Check className="size-4" />} onClick={() => cambiar.mutate({ id: actual.id, estado: "completada" })}>
                      Terminar consulta
                    </Boton>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="grid size-14 place-items-center rounded-2xl bg-marca-suave text-marca">
                <BellRing className="size-7" />
              </span>
              <div>
                <p className="text-lg font-semibold">{cola.length ? `${cola.length} paciente${cola.length > 1 ? "s" : ""} esperando` : "Nadie esperando"}</p>
                <p className="text-sm text-texto-3">Los que ya pasaron por caja aparecen aquí automáticamente.</p>
              </div>
              <Boton tamano="lg" icono={<Megaphone className="size-5" />} disabled={!cola.length} cargando={llamar.isPending} onClick={() => llamar.mutate(undefined)}>
                Llamar siguiente
              </Boton>
            </>
          )}
        </Tarjeta>

        <Tarjeta className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-borde px-5 py-3">
            <DoorOpen className="size-4 text-texto-3" />
            <span className="text-sm font-semibold">En espera</span>
            <span className="ml-auto text-xs text-texto-3">Prioridad primero, luego por llegada</span>
          </div>
          {cola.length === 0 ? (
            <Vacio icono={<DoorOpen />} titulo="Sala vacía" />
          ) : (
            <ul className="divide-y divide-borde">
              {cola.map((c) => {
                const espera = minutosDesde(c.turno_en, ahora) ?? 0;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-14 font-mono font-bold text-marca-texto">{c.turno}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nombre(c)}</span>
                      <span className="block truncate text-xs text-texto-3">
                        {c.medico_id ? "Pidió por ti" : `Cola de ${c.especialidad}`}
                        {c.servicio ? ` · ${c.servicio.nombre}` : ""}
                      </span>
                    </span>
                    {c.prioridad && <Insignia tono="aviso">{c.motivo_prioridad ?? "Prioridad"}</Insignia>}
                    <Insignia tono={espera > 30 ? "peligro" : espera > 15 ? "aviso" : "neutro"}>{espera} min</Insignia>
                    {!actual && (
                      <button
                        onClick={() => llamar.mutate(c.id)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-marca-texto hover:bg-marca-suave"
                        title="Llamar a este paciente fuera de orden"
                      >
                        Llamar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
