import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { CircleHelp } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { enEscritorio, enviar, escuchar } from "@/lib/escritorio";
import { useAgenteSoporte, usePendientesSoporte } from "@/lib/soporte";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";

/**
 * Botón de Ayuda de la barra superior. Abre Ayuda con la pantalla actual (para sugerir
 * sus guías y adjuntarla si se pide soporte). El globo rojo cuenta las conversaciones con
 * algo nuevo: respuestas de soporte o, para el superadmin, mensajes de los hospitales.
 *
 * Cuando ese número sube y MEDORA no está al frente, avisa con una notificación de
 * Windows (launcher) o del navegador si ya tiene permiso; al tocarla se abre Ayuda.
 */
export function BotonAyuda() {
  const { sistema } = useSesion();
  const agente = useAgenteSoporte();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const pendientes = usePendientesSoporte(!!sistema);
  const n = pendientes.data ?? 0;
  const anterior = useRef<number | null>(null);

  // En vivo: cualquier cambio en una solicitud visible (el RLS filtra) recalcula el globo.
  useEffect(() => {
    if (!sistema) return;
    const canal = supabase
      .channel(`soporte-globo-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes_soporte" }, () => {
        void qc.invalidateQueries({ queryKey: ["soporte", "pendientes"] });
      })
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [qc, sistema]);

  // Tocar el aviso de Windows trae la ventana y abre la ruta (solo rutas internas de Ayuda).
  useEffect(
    () =>
      escuchar((m) => {
        if (m.tipo === "abrir-ruta" && m.ruta.startsWith("/ayuda")) navigate(m.ruta);
      }),
    [navigate],
  );

  useEffect(() => {
    if (pendientes.data === undefined) return;
    const antes = anterior.current;
    anterior.current = n;
    if (antes === null || n <= antes) return;
    const titulo = agente ? "Nuevo mensaje en Ayuda" : "Soporte MEDORA te respondió";
    const texto = agente
      ? n === 1
        ? "Tienes 1 conversación por responder."
        : `Tienes ${n} conversaciones por responder.`
      : "Toca para ver la respuesta.";
    if (enEscritorio) {
      enviar("notificar", { titulo, texto, ruta: "/ayuda" });
    } else if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      const aviso = new Notification(titulo, { body: texto, tag: "medora-soporte" });
      aviso.onclick = () => {
        window.focus();
        navigate("/ayuda");
        aviso.close();
      };
    }
  }, [n, pendientes.data, agente, navigate]);

  if (!sistema) return null;
  const enAyuda = pathname === "/ayuda";

  return (
    <button
      type="button"
      onClick={() => !enAyuda && navigate(`/ayuda?desde=${encodeURIComponent(pathname)}`)}
      title="Ayuda y soporte"
      aria-label={n ? `Ayuda y soporte, ${n} sin leer` : "Ayuda y soporte"}
      className={cn("relative grid size-9 place-items-center rounded-full transition-colors hover:bg-superficie-2", enAyuda ? "text-texto" : "text-texto-2")}
    >
      <CircleHelp className="size-[19px]" />
      <AnimatePresence>
        {n > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.35 }}
            className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-peligro px-1 text-[0.6875rem] font-semibold text-white tabular-nums ring-2 ring-superficie"
          >
            {n > 9 ? "9+" : n}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
