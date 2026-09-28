import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, DoorOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { nombrePaciente } from "@/lib/consultas";
import { supabase } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn } from "@/lib/utils";
import { soloLoPropio, useSesion } from "@/sesion/SesionProvider";

/**
 * Llamados de los médicos en vivo para quien atiende la sala (caja, recepción):
 * - FranjaLlamados: "Llamando ahora" arriba de Caja y Recepción.
 * - AvisoLlamados: aviso con sonido en cualquier pantalla cuando un médico toca
 *   "Llamar siguiente" o "Volver a llamar".
 * Datos: pantalla_llamados (la misma función que la TV de la sala) + el nombre
 * del paciente, que el personal sí puede ver (la TV nunca lo muestra).
 */

interface Llamado {
  id: string;
  turno: string | null;
  estado: "llamado" | "en_consulta";
  llamado_en: string;
  llamado_veces: number;
  consultorio: string | null;
  medico: string | null;
  especialidad: string | null;
  paciente: string;
}

/** Pasados estos minutos sin que el médico inicie la consulta, el paciente "no aparece". */
export const MINUTOS_SIN_PRESENTARSE = 2;

export function useLlamados(sistemaId: string | undefined) {
  useTiempoReal("citas", sistemaId ?? "-", [["llamados", sistemaId]]);
  return useQuery({
    queryKey: ["llamados", sistemaId],
    enabled: !!sistemaId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Llamado[]> => {
      const { data, error } = await supabase.rpc("pantalla_llamados", { p_sistema: sistemaId! });
      if (error) throw error;
      const llamados = ((data as { llamados?: Omit<Llamado, "paciente">[] } | null)?.llamados ?? []).filter((l) => l.llamado_en);
      if (!llamados.length) return [];
      const { data: citas } = await supabase
        .from("citas")
        .select("id, cedula_llegada, paciente:pacientes!citas_sistema_id_paciente_id_fkey(nombres, apellidos)")
        .in(
          "id",
          llamados.map((l) => l.id),
        );
      const nombres = new Map((citas ?? []).map((c) => [c.id, nombrePaciente(c as never)]));
      return llamados.map((l) => ({ ...l, paciente: nombres.get(l.id) ?? "" }));
    },
  });
}

const destino = (l: Pick<Llamado, "consultorio" | "especialidad">) => (l.consultorio ? `Consultorio ${l.consultorio}` : (l.especialidad ?? "Consulta"));
const minutos = (iso: string, ahora: number) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));

function useAhora(cadaMs = 15_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

/** Franja "Llamando ahora": los llamados pendientes y, atenuados, los que ya entraron hace poco. */
export function FranjaLlamados() {
  const { sistema } = useSesion();
  const q = useLlamados(sistema?.id);
  const ahora = useAhora();
  const pendientes = (q.data ?? []).filter((l) => l.estado === "llamado");
  const entraron = (q.data ?? []).filter((l) => l.estado === "en_consulta" && minutos(l.llamado_en, ahora) < 5);
  const visibles = [...pendientes, ...entraron].slice(0, 4);
  if (!visibles.length) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--aviso)_35%,var(--borde))] bg-superficie">
      <div className="flex items-center gap-2 border-b border-borde px-4 py-2">
        <BellRing className="size-4 text-aviso" />
        <span className="text-[0.8125rem] font-semibold">Llamando ahora</span>
        <span className="ml-auto text-xs text-texto-3">Lleva a cada paciente a su consultorio</span>
      </div>
      <div className="grid divide-y divide-borde sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
        <AnimatePresence initial={false}>
          {visibles.map((l) => {
            const min = minutos(l.llamado_en, ahora);
            const tarde = l.estado === "llamado" && min >= MINUTOS_SIN_PRESENTARSE;
            return (
              <motion.div
                key={`${l.id}-${l.llamado_veces}`}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className={cn("flex items-center gap-3 px-4 py-3", l.estado === "en_consulta" && "opacity-55")}
              >
                <span
                  className={cn(
                    "grid h-11 min-w-16 place-items-center rounded-xl px-2 font-mono text-lg font-black tracking-wide",
                    l.estado === "en_consulta"
                      ? "bg-superficie-2 text-texto-2"
                      : tarde
                        ? "bg-[color-mix(in_oklab,var(--peligro)_14%,var(--superficie))] text-peligro"
                        : "bg-[color-mix(in_oklab,var(--aviso)_16%,var(--superficie))] text-aviso",
                  )}
                >
                  {l.turno ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <DoorOpen className="size-3.5 shrink-0 text-texto-3" />
                    <span className="truncate">{destino(l)}</span>
                  </p>
                  <p className="truncate text-xs text-texto-2">{l.paciente || "Paciente"}</p>
                  <p className={cn("truncate text-[0.6875rem]", tarde ? "font-medium text-peligro" : "text-texto-3")}>
                    {l.estado === "en_consulta"
                      ? "Ya entró"
                      : tarde
                        ? `No aparece · ${min} min`
                        : `${min < 1 ? "Ahora" : `Hace ${min} min`}${l.llamado_veces > 1 ? ` · ${l.llamado_veces}.ª vez` : ""}`}
                    {l.medico ? ` · ${l.medico}` : ""}
                  </p>
                </div>
                {l.estado === "llamado" && !tarde && <span className="size-2 shrink-0 animate-pulse rounded-full bg-aviso" />}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Dos tonos suaves (sin archivos de audio). */
function sonar() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [
      [880, 0],
      [660, 0.18],
    ].forEach(([f, t]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* sin audio disponible */
  }
}

/**
 * Aviso global (montado en AppShell) para quien atiende la sala: caja y
 * recepción. No avisa de lo que ya estaba llamado al abrir la app.
 */
export function AvisoLlamados() {
  const { sistema, roles } = useSesion();
  const atiendeSala = (roles.includes("caja") || roles.includes("recepcion")) && !soloLoPropio(roles);
  const q = useLlamados(atiendeSala ? sistema?.id : undefined);
  const vistos = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const claves = q.data.filter((l) => l.estado === "llamado").map((l) => `${l.id}-${l.llamado_veces}`);
    if (vistos.current === null) {
      vistos.current = new Set(claves);
      return;
    }
    const nuevos = q.data.filter((l) => l.estado === "llamado" && !vistos.current!.has(`${l.id}-${l.llamado_veces}`));
    for (const l of nuevos) {
      vistos.current.add(`${l.id}-${l.llamado_veces}`);
      toast(`${l.turno ?? "Turno"} → ${destino(l)}`, {
        description: `${l.paciente || "Paciente"}${l.medico ? ` · ${l.medico}` : ""}${l.llamado_veces > 1 ? ` · ${l.llamado_veces}.ª llamada` : ""}`,
        icon: <BellRing className="size-4 text-aviso" />,
        duration: 12_000,
      });
    }
    if (nuevos.length) sonar();
  }, [q.data]);

  useEffect(() => {
    vistos.current = null;
  }, [sistema?.id]);

  return null;
}
