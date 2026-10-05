import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CalendarClock, FlaskConical, History, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Insignia } from "@/components/ui/superficies";
import { datos, supabase } from "@/lib/supabase";
import { cn, fecha, fechaHora, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Lo esencial del paciente sin cambiar de pestaña: próxima cita, última visita,
 * lo que debe (si ve caja) y el último resultado de laboratorio (si ve la historia).
 * Cada dato respeta el RLS: lo que el rol no puede leer simplemente no aparece.
 */
export function ResumenPaciente({ pacienteId, verCobros, verHistorial }: { pacienteId: string; verCobros: boolean; verHistorial: boolean }) {
  const { sistemaId } = useSistema();

  const q = useQuery({
    queryKey: ["resumen-paciente", sistemaId, pacienteId, verCobros, verHistorial],
    queryFn: async () => {
      const ahora = new Date().toISOString();
      const [proxima, ultima, deuda, anticipo, lab] = await Promise.all([
        supabase
          .from("citas")
          .select("inicio, medico:perfiles!citas_medico_perfil_fk(nombre_completo), especialidad")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", pacienteId)
          .in("estado", ["programada", "confirmada"])
          .gte("inicio", ahora)
          .order("inicio")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("citas")
          .select("inicio, medico:perfiles!citas_medico_perfil_fk(nombre_completo), especialidad")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", pacienteId)
          .eq("estado", "completada")
          .order("inicio", { ascending: false })
          .limit(1)
          .maybeSingle(),
        verCobros ? supabase.from("cuentas_por_cobrar").select("pendiente_paciente").eq("sistema_id", sistemaId).eq("paciente_id", pacienteId) : null,
        verCobros ? supabase.from("saldos_anticipo").select("anticipado, aplicado").eq("sistema_id", sistemaId).eq("paciente_id", pacienteId).maybeSingle() : null,
        verHistorial
          ? supabase
              .from("resultados_laboratorio")
              .select("laboratorio, fecha_resultado, recibido_en, resultados")
              .eq("sistema_id", sistemaId)
              .eq("paciente_id", pacienteId)
              .order("recibido_en", { ascending: false })
              .limit(1)
              .maybeSingle()
          : null,
      ]);
      return {
        proxima: datos(proxima),
        ultima: datos(ultima),
        debe: deuda ? (datos(deuda) ?? []).reduce((s, f) => s + Number(f.pendiente_paciente ?? 0), 0) : null,
        anticipo: anticipo?.data ? Number(anticipo.data.anticipado) - Number(anticipo.data.aplicado) : 0,
        lab: lab ? datos(lab) : null,
      };
    },
  });

  const d = q.data;
  const medico = (c: { medico: { nombre_completo: string } | null; especialidad: string | null } | null) =>
    c ? [c.medico?.nombre_completo, c.especialidad].filter(Boolean).join(" · ") : "";

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Dato icono={<CalendarClock />} titulo="Próxima cita" cargando={q.isLoading}>
        {d?.proxima ? (
          <>
            <span className="font-semibold">{fechaHora(d.proxima.inicio)}</span>
            <span className="block truncate text-xs text-texto-3">{medico(d.proxima)}</span>
          </>
        ) : (
          <span className="text-texto-3">Sin citas pendientes</span>
        )}
      </Dato>
      <Dato icono={<History />} titulo="Última visita" cargando={q.isLoading}>
        {d?.ultima ? (
          <>
            <span className="font-semibold">{fecha(d.ultima.inicio)}</span>
            <span className="block truncate text-xs text-texto-3">{medico(d.ultima)}</span>
          </>
        ) : (
          <span className="text-texto-3">Primera vez</span>
        )}
      </Dato>
      {verCobros && (
        <Dato icono={<Wallet />} titulo="Saldo" cargando={q.isLoading} tono={(d?.debe ?? 0) > 0.004 ? "aviso" : undefined}>
          {(d?.debe ?? 0) > 0.004 ? (
            <span className="font-semibold text-aviso tabular">Debe {moneda(d!.debe)}</span>
          ) : (
            <span className="font-semibold text-exito">Al día</span>
          )}
          {(d?.anticipo ?? 0) > 0.004 && <span className="block text-xs text-texto-3 tabular">Adelanto disponible: {moneda(d!.anticipo)}</span>}
        </Dato>
      )}
      {verHistorial && (
        <Dato icono={<FlaskConical />} titulo="Último laboratorio" cargando={q.isLoading}>
          {d?.lab ? (
            <>
              <span className="font-semibold">{fecha(d.lab.fecha_resultado ?? d.lab.recibido_en)}</span>
              <span className="block truncate text-xs text-texto-3">
                {d.lab.laboratorio} · {Array.isArray(d.lab.resultados) ? d.lab.resultados.length : 0} pruebas
              </span>
            </>
          ) : (
            <span className="text-texto-3">Sin resultados</span>
          )}
        </Dato>
      )}
    </div>
  );
}

function Dato({ icono, titulo, children, cargando, tono }: { icono: ReactNode; titulo: string; children: ReactNode; cargando?: boolean; tono?: "aviso" }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-borde bg-superficie px-3.5 py-3", tono === "aviso" && "border-aviso/40")}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-superficie-2 text-texto-2 [&>svg]:size-4">{icono}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-xs font-medium text-texto-3">{titulo}</p>
        {cargando ? <span className="mt-1 block h-4 w-24 animate-pulse rounded bg-superficie-2" /> : <div className="mt-0.5">{children}</div>}
      </div>
    </div>
  );
}

/**
 * Barra fija con nombre y alergias que aparece al bajar en el expediente, cuando la
 * tarjeta del paciente ya no se ve: las alergias nunca quedan fuera de la vista.
 */
export function BarraPacienteFija({
  ancla,
  nombre,
  expediente,
  alergias,
}: {
  ancla: RefObject<HTMLElement | null>;
  nombre: string;
  expediente: string;
  alergias: string | null;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ancla.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ancla]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="sticky top-0 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-borde bg-superficie/95 px-4 py-2 shadow-sm backdrop-blur"
        >
          <span className="text-sm font-semibold">{nombre}</span>
          <Insignia tono="marca">{expediente}</Insignia>
          {alergias ? (
            <Insignia tono="peligro">
              <AlertTriangle className="size-3" /> Alergias: {alergias}
            </Insignia>
          ) : (
            <span className="text-xs text-texto-3">Sin alergias registradas</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
