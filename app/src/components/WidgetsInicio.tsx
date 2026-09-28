import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, DoorOpen, Stethoscope, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, nombrePaciente, useTurnosHoy, type CitaConRelaciones } from "@/lib/consultas";
import { datos, supabase } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn } from "@/lib/utils";
import { ESTADO, type Medico } from "@/paginas/Medicos";
import { useSistema } from "@/sesion/SesionProvider";

/** Prioridad legal primero, luego orden de llegada. */
const ordenCola = (a: CitaConRelaciones, b: CitaConRelaciones) =>
  Number(b.prioridad) - Number(a.prioridad) || (a.turno_en ?? a.inicio).localeCompare(b.turno_en ?? b.inicio);

function useMinuto() {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

function Encabezado({ titulo, ruta, enlace }: { titulo: string; ruta: string; enlace: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-borde px-5 py-4">
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-exito opacity-60" />
        <span className="relative size-2 rounded-full bg-exito" />
      </span>
      <h2 className="text-[0.9375rem] font-semibold">{titulo}</h2>
      <Link to={ruta} className="ml-auto flex items-center gap-1 text-[0.8125rem] font-medium text-marca-texto hover:underline">
        {enlace} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

/** Turnos de hoy en tiempo real: a quién están atendiendo y quién sigue. */
export function TurnosEnVivo() {
  const { sistemaId } = useSistema();
  const turnos = useTurnosHoy(sistemaId);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);
  const ahora = useMinuto();

  const lista = turnos.data ?? [];
  const atendiendo = lista.filter((c) => c.estado === "llamado" || c.estado === "en_consulta");
  const espera = lista.filter((c) => c.estado === "en_espera").sort(ordenCola);
  const enCaja = lista.filter((c) => c.estado === "por_cobrar").length;
  const atendidos = lista.filter((c) => c.estado === "completada").length;
  const destino = (c: CitaConRelaciones) => c.medico?.nombre_completo ?? `${c.especialidad} · cualquiera`;

  return (
    <Tarjeta className="flex flex-col overflow-hidden">
      <Encabezado titulo="Turnos en vivo" ruta="/recepcion" enlace="Recepción" />
      {turnos.isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-10" />
          ))}
        </div>
      ) : atendiendo.length + espera.length === 0 ? (
        <Vacio icono={<DoorOpen />} titulo="Nadie esperando ahora" descripcion={atendidos ? `${atendidos} atendidos hoy` : "Los turnos aparecen aquí al llegar."} />
      ) : (
        <div className="flex-1">
          {atendiendo.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-borde px-5 py-3">
              <AnimatePresence initial={false}>
                {atendiendo.map((c) => (
                  <motion.span
                    key={c.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs",
                      c.estado === "llamado" ? "border-[#2e90fa]/40 bg-[color-mix(in_oklab,#2e90fa_10%,var(--superficie))]" : "border-borde bg-superficie-2",
                    )}
                  >
                    <span className="font-mono text-sm font-bold">{c.turno}</span>
                    <span className="max-w-40 truncate text-texto-2">{c.medico?.nombre_completo}</span>
                    <span className={cn("font-medium", c.estado === "llamado" ? "text-[#2e90fa]" : "text-[#7a5af8]")}>
                      {c.estado === "llamado" ? "Llamando" : "En consulta"}
                    </span>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          )}
          <ul className="divide-y divide-borde">
            <AnimatePresence initial={false}>
              {espera.slice(0, 6).map((c, i) => {
                const min = c.turno_en ? Math.max(0, Math.round((ahora - new Date(c.turno_en).getTime()) / 60000)) : 0;
                return (
                  <motion.li
                    key={c.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="w-5 text-xs text-texto-3 tabular">{i + 1}</span>
                    <span className="w-14 font-mono font-bold text-marca-texto">{c.turno}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {nombrePaciente(c)}
                      </span>
                      <span className="block truncate text-xs text-texto-3">{destino(c)}</span>
                    </span>
                    {c.prioridad && <Insignia tono="aviso">{c.motivo_prioridad ?? "Prioridad"}</Insignia>}
                    <Insignia tono={min > 30 ? "peligro" : min > 15 ? "aviso" : "neutro"}>{min} min</Insignia>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          {espera.length > 6 && <p className="px-5 py-2 text-xs text-texto-3">y {espera.length - 6} más en espera</p>}
        </div>
      )}
      <div className="flex gap-4 border-t border-borde bg-superficie-2/50 px-5 py-2.5 text-xs text-texto-2">
        <span className="flex items-center gap-1.5">
          <DoorOpen className="size-3.5" /> {espera.length} en espera
        </span>
        <span className="flex items-center gap-1.5">
          <Wallet className="size-3.5" /> {enCaja} en caja
        </span>
        <span className="ml-auto">{atendidos} atendidos hoy</span>
      </div>
    </Tarjeta>
  );
}

/** Médicos ahora: quién está libre, quién en consulta y cuántos tiene cada uno en cola. */
export function MedicosAhora() {
  const { sistemaId } = useSistema();
  const q = useQuery({
    queryKey: [...claves.citas(sistemaId), "directorio"],
    refetchInterval: 60_000,
    queryFn: async () => (datos(await supabase.rpc("directorio_medicos", { p_sistema: sistemaId })) ?? []) as Medico[],
  });
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);

  const orden: Record<Medico["estado"], number> = { en_consulta: 0, llamando: 0, disponible: 1, sin_actividad: 2 };
  const medicos = (q.data ?? []).slice().sort((a, b) => orden[a.estado] - orden[b.estado] || b.en_cola + b.cola_especialidad - (a.en_cola + a.cola_especialidad));
  const activos = medicos.filter((m) => m.estado !== "sin_actividad");
  const inactivos = medicos.length - activos.length;
  const maxCola = Math.max(1, ...activos.map((m) => m.en_cola + m.cola_especialidad));

  return (
    <Tarjeta className="flex flex-col overflow-hidden">
      <Encabezado titulo="Médicos ahora" ruta="/medicos" enlace="Directorio" />
      {q.isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-10" />
          ))}
        </div>
      ) : activos.length === 0 ? (
        <Vacio icono={<Stethoscope />} titulo="Ningún médico con actividad hoy" descripcion={`${medicos.length} médicos en el directorio`} />
      ) : (
        <ul className="max-h-[22rem] flex-1 divide-y divide-borde overflow-y-auto">
          {activos.map((m) => {
            const cola = m.en_cola + m.cola_especialidad;
            const e = ESTADO[m.estado];
            return (
              <li key={m.usuario_id} className="flex items-center gap-3 px-5 py-2.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-marca-suave text-xs font-semibold text-marca-texto ring-2 ring-offset-1 ring-offset-superficie", e.anillo)}>
                  {m.nombre
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.nombre}</span>
                  <span className="block truncate text-xs text-texto-3">
                    {m.especialidad}
                    {m.turno_actual ? ` · atendiendo ${m.turno_actual}` : ""}
                  </span>
                </span>
                <Insignia tono={e.tono} punto>
                  {e.etiqueta}
                </Insignia>
                <span className="w-24">
                  <span className="flex items-baseline justify-between text-xs">
                    <span className="text-texto-3">Cola</span>
                    <span className={cn("font-semibold tabular", cola > 0 && "text-aviso")}>{cola}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-superficie-2">
                    <motion.span
                      className="block h-full origin-left rounded-full bg-aviso"
                      initial={false}
                      animate={{ scaleX: cola / maxCola }}
                      transition={{ type: "spring", duration: 0.5, bounce: 0 }}
                    />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-borde bg-superficie-2/50 px-5 py-2.5 text-xs text-texto-2">
        {activos.filter((m) => m.estado === "disponible").length} disponibles ·{" "}
        {activos.filter((m) => m.estado === "en_consulta" || m.estado === "llamando").length} en consulta
        {inactivos > 0 && <span className="text-texto-3"> · {inactivos} sin actividad hoy</span>}
      </div>
    </Tarjeta>
  );
}
