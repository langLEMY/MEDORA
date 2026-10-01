import { AnimatePresence, motion } from "motion/react";
import { Lock, LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { usePreferencias } from "@/lib/preferencias";
import { mensajeError, supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/superficies";
import { useSesion } from "@/sesion/SesionProvider";

/**
 * Bloqueo por inactividad: tras los minutos elegidos en Mi perfil, cubre la
 * pantalla y pide la contraseña para seguir, sin cerrar la sesión ni perder lo
 * que esté a medias. La sesión sigue viva: desbloquear solo vuelve a verificar
 * la contraseña. Útil cuando alguien deja la caja o el consultorio sin atender.
 * La última actividad se guarda en este equipo, así que recargar no lo evade.
 */
const CLAVE_ACTIVIDAD = "medora.ultima-actividad";
const EVENTOS = ["mousedown", "keydown", "touchstart", "pointerdown", "scroll"] as const;

export function BloqueoSesion() {
  const { bloqueo } = usePreferencias();
  const { sesion, perfil, cerrarSesion } = useSesion();
  const minutos = bloqueo === "nunca" ? 0 : Number(bloqueo);
  const [bloqueado, setBloqueado] = useState(false);

  const marcar = useCallback(() => {
    try {
      localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()));
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  // Temporizador de inactividad + registro de actividad.
  useEffect(() => {
    if (!minutos || !sesion) return;
    const limite = minutos * 60_000;
    // Al montar, si ya pasó el tiempo desde la última actividad, bloquear.
    try {
      const ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD) ?? 0);
      if (ultima && Date.now() - ultima >= limite) setBloqueado(true);
    } catch {
      /* ignore */
    }

    let timer: ReturnType<typeof setTimeout>;
    const reiniciar = () => {
      clearTimeout(timer);
      if (!bloqueado) marcar();
      timer = setTimeout(() => setBloqueado(true), limite);
    };
    const actividad = () => {
      if (!bloqueado) reiniciar();
    };
    for (const e of EVENTOS) window.addEventListener(e, actividad, { passive: true });
    // Si vuelve a la pestaña tras estar fuera más del límite, bloquear.
    const visibilidad = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD) ?? 0);
        if (ultima && Date.now() - ultima >= limite) setBloqueado(true);
        else if (!bloqueado) reiniciar();
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("visibilitychange", visibilidad);
    reiniciar();
    return () => {
      clearTimeout(timer);
      for (const e of EVENTOS) window.removeEventListener(e, actividad);
      document.removeEventListener("visibilitychange", visibilidad);
    };
  }, [minutos, sesion, bloqueado, marcar]);

  const correo = sesion?.user.email ?? "";
  const nombre = perfil?.nombre_completo ?? "";

  const desbloquear = useCallback(async () => {
    marcar();
    setBloqueado(false);
  }, [marcar]);

  return (
    <AnimatePresence>
      {bloqueado && sesion && <PantallaBloqueo correo={correo} nombre={nombre} onDesbloquear={desbloquear} onSalir={cerrarSesion} />}
    </AnimatePresence>
  );
}

function PantallaBloqueo({ correo, nombre, onDesbloquear, onSalir }: { correo: string; nombre: string; onDesbloquear: () => void; onSalir: () => void }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const intentar = async () => {
    if (!clave) return;
    setError(null);
    setVerificando(true);
    try {
      // La sesión sigue viva; solo revalidamos la contraseña (no perdemos el trabajo en curso).
      const { error: e } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
      if (e) {
        setError("Contraseña incorrecta.");
        setClave("");
        return;
      }
      onDesbloquear();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setVerificando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] grid place-items-center bg-[color-mix(in_oklab,var(--fondo)_70%,black)] backdrop-blur-md"
      role="dialog"
      aria-modal
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", duration: 0.38, bounce: 0.24 }}
        className="w-full max-w-sm rounded-3xl border border-borde bg-superficie p-7 text-center shadow-lg"
      >
        <div className="relative mx-auto mb-4 w-fit">
          <Avatar nombre={nombre} tamano={64} />
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-marca text-white ring-4 ring-superficie">
            <Lock className="size-3.5" />
          </span>
        </div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Sesión bloqueada</h2>
        <p className="mt-1 text-sm text-texto-2">
          {nombre ? `Hola, ${nombre.split(" ")[0]}. ` : ""}Escribe tu contraseña para seguir trabajando.
        </p>
        <div className="mt-5 space-y-3 text-left">
          <Entrada
            ref={input}
            type="password"
            autoComplete="current-password"
            placeholder="Tu contraseña"
            value={clave}
            onChange={(e) => {
              setClave(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void intentar()}
            error={error ?? undefined}
          />
          <Boton className="w-full justify-center" tamano="lg" cargando={verificando} disabled={!clave} onClick={() => void intentar()}>
            Desbloquear
          </Boton>
          <button
            type="button"
            onClick={() => void onSalir()}
            className="mx-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-texto-3 transition-colors hover:text-texto"
          >
            <LogOut className="size-3.5" /> Cerrar sesión
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
