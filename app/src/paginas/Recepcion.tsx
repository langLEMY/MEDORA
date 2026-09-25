import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRight, Check, Clock, DoorOpen, MoreHorizontal, Stethoscope, UserPlus, UserX, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FormCita, useCambiarEstadoCita } from "@/components/FormCita";
import { Boton } from "@/components/ui/boton";
import { Selector } from "@/components/ui/campos";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, Tarjeta } from "@/components/ui/superficies";
import { claves, ESTADO_CITA, useCitas, useMedicos, type CitaConRelaciones } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import type { EstadoCita } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn, hora } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const COLUMNAS: { clave: string; titulo: string; estados: EstadoCita[]; icono: typeof Clock }[] = [
  { clave: "llegar", titulo: "Por llegar", estados: ["programada", "confirmada"], icono: Clock },
  { clave: "espera", titulo: "Sala de espera", estados: ["en_espera"], icono: DoorOpen },
  { clave: "consulta", titulo: "En consulta", estados: ["en_consulta"], icono: Stethoscope },
  { clave: "listo", titulo: "Atendidos", estados: ["completada"], icono: Check },
];

function useAhora(ms = 30_000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}

export default function Recepcion() {
  const { sistemaId, roles } = useSistema();
  const [medico, setMedico] = useState("");
  const [llegada, setLlegada] = useState(false);
  const medicos = useMedicos(sistemaId);
  const cambiar = useCambiarEstadoCita();
  const ahora = useAhora();

  const [desde, hasta] = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const h = new Date(d);
    h.setDate(h.getDate() + 1);
    return [d.toISOString(), h.toISOString()];
  }, []);
  const citas = useCitas(sistemaId, desde, hasta, medico || undefined);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)], ["dashboard", sistemaId]]);

  const escribir = puedeEscribir.citas(roles);
  const ausentes = citas.data?.filter((c) => c.estado === "cancelada" || c.estado === "no_asistio").length ?? 0;

  return (
    <>
      <EncabezadoPagina
        titulo="Recepción"
        descripcion="Flujo de pacientes de hoy. Se actualiza en vivo en todas las estaciones."
        acciones={
          <>
            <Selector value={medico} onChange={(e) => setMedico(e.target.value)} contenedor="w-56">
              <option value="">Todos los profesionales</option>
              {medicos.data?.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.perfil?.nombre_completo}
                </option>
              ))}
            </Selector>
            {escribir && (
              <Boton icono={<UserPlus className="size-4" />} onClick={() => setLlegada(true)}>
                Llegada sin cita
              </Boton>
            )}
          </>
        }
      />

      <LayoutGroup>
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNAS.map((col) => {
            const items = citas.data?.filter((c) => col.estados.includes(c.estado)) ?? [];
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

      <FormCita abierto={llegada} onCerrar={() => setLlegada(false)} llegadaDirecta />
    </>
  );
}

function TarjetaCita({
  c,
  ahora,
  escribir,
  onEstado,
}: {
  c: CitaConRelaciones;
  ahora: number;
  escribir: boolean;
  onEstado: (e: EstadoCita) => void;
}) {
  const esperando = c.estado === "en_espera" && c.llegada_en ? Math.max(0, Math.round((ahora - new Date(c.llegada_en).getTime()) / 60000)) : null;
  const siguiente: { estado: EstadoCita; etiqueta: string } | null =
    c.estado === "programada" || c.estado === "confirmada"
      ? { estado: "en_espera", etiqueta: "Llegó" }
      : c.estado === "en_espera"
        ? { estado: "en_consulta", etiqueta: "Pasar a consulta" }
        : c.estado === "en_consulta"
          ? { estado: "completada", etiqueta: "Finalizar" }
          : null;

  return (
    <motion.div
      layout
      layoutId={c.id}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
    >
      <Tarjeta className="p-3.5">
        <div className="flex items-start gap-2.5">
          <Avatar nombre={`${c.paciente?.nombres} ${c.paciente?.apellidos}`} tamano={30} />
          <div className="min-w-0 flex-1">
            <Link to={`/pacientes/${c.paciente_id}`} className="block truncate text-sm font-semibold hover:underline">
              {c.paciente?.nombres} {c.paciente?.apellidos}
            </Link>
            <p className="truncate text-xs text-texto-3">
              {hora(c.inicio)} · {c.medico?.nombre_completo}
            </p>
          </div>
          {escribir && c.estado !== "completada" && (
            <Menu
              alinear="derecha"
              ancho={200}
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
                  <ItemMenu icono={<UserX />} onClick={() => (onEstado("no_asistio"), cerrar())}>
                    No asistió
                  </ItemMenu>
                  <ItemMenu icono={<XCircle />} peligro onClick={() => (onEstado("cancelada"), cerrar())}>
                    Cancelar cita
                  </ItemMenu>
                </>
              )}
            </Menu>
          )}
        </div>
        {(c.servicio || c.motivo) && <p className="mt-2 line-clamp-2 text-xs text-texto-2">{c.servicio?.nombre ?? c.motivo}</p>}
        <div className="mt-3 flex items-center gap-2">
          {esperando !== null ? (
            <Insignia tono={esperando > 30 ? "peligro" : esperando > 15 ? "aviso" : "neutro"} punto>
              {esperando} min
            </Insignia>
          ) : (
            <Insignia tono={ESTADO_CITA[c.estado].tono}>{ESTADO_CITA[c.estado].etiqueta}</Insignia>
          )}
          {escribir && siguiente && (
            <button
              onClick={() => onEstado(siguiente.estado)}
              className={cn(
                "group ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                "bg-marca-suave text-marca-texto hover:brightness-95",
              )}
            >
              {siguiente.etiqueta}
              <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </Tarjeta>
    </motion.div>
  );
}
