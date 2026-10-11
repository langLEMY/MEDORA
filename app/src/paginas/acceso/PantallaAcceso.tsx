import { motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Isotipo } from "@/components/layout/Logo";
import { cambiarPreferencias, usePreferencias } from "@/lib/preferencias";
import type { Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const SALIDA_SUAVE = [0.23, 1, 0.32, 1] as const;

/**
 * Marco de las pantallas de acceso (login, registro, contraseña, dos pasos, avisos): una sola columna
 * centrada sobre el fondo, con la marca MEDORA arriba y una tarjeta limpia. Nunca muestra el nombre ni
 * el logo de un hospital. El halo de fondo es estático (sin animación continua) y respeta los temas.
 */
export function PantallaAcceso({ children, ancho = "angosto" }: { children: ReactNode; ancho?: "angosto" | "amplio" }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-y-auto bg-fondo">
      {/* Fondo con la paleta de MEDORA (turquesa #14B8A6 y petróleo #0E7490 del logo, nunca el color de un
          hospital): dos halos muy suaves y una retícula que se desvanece. Estático, sin animación continua. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-24rem] left-1/2 size-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,#14b8a6_18%,transparent),transparent)]" />
        <div className="absolute -right-48 -bottom-56 size-[40rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,#0e7490_12%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--texto)_5%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--texto)_5%,transparent)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_55%_45%_at_50%_0%,black,transparent)] bg-[size:48px_48px]" />
      </div>

      <div className="relative flex justify-end px-5 pt-5">
        <SelectorTema />
      </div>

      <main className="relative flex flex-1 items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: SALIDA_SUAVE }}
          className={cn("w-full", ancho === "amplio" ? "max-w-[460px]" : "max-w-[400px]")}
        >
          <div className="mb-7 flex flex-col items-center gap-3">
            <Isotipo className="size-11 drop-shadow-[0_8px_20px_color-mix(in_oklab,#14b8a6_30%,transparent)]" />
            <span className="text-[0.9375rem] font-semibold tracking-[0.22em] text-texto">MEDORA</span>
          </div>
          <div className="rounded-2xl border border-borde bg-superficie p-7 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_12px_32px_-12px_rgb(16_24_40/0.18)] sm:p-8">
            {children}
          </div>
        </motion.div>
      </main>

      <footer className="relative px-4 pb-6 text-center text-xs text-texto-3">
        MEDORA · Gestión hospitalaria · v{__VERSION_APP__}
      </footer>
    </div>
  );
}

const TEMAS: { tema: Tema; icono: typeof Sun; etiqueta: string }[] = [
  { tema: "claro", icono: Sun, etiqueta: "Claro" },
  { tema: "oscuro", icono: Moon, etiqueta: "Oscuro" },
  { tema: "sistema", icono: Monitor, etiqueta: "Como Windows" },
];

/** Claro / oscuro / sistema, también antes de iniciar sesión (se guarda en el equipo). */
function SelectorTema() {
  const { tema } = usePreferencias();
  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-full border border-borde bg-superficie/80 p-0.5 backdrop-blur">
      {TEMAS.map(({ tema: t, icono: Icono, etiqueta }) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tema === t}
          aria-label={etiqueta}
          title={etiqueta}
          onClick={() => cambiarPreferencias({ tema: t })}
          className={cn(
            "relative grid size-7 place-items-center rounded-full transition-colors",
            tema === t ? "text-texto" : "text-texto-3 hover:text-texto-2",
          )}
        >
          {tema === t && (
            <motion.span layoutId="tema-acceso" className="absolute inset-0 rounded-full bg-superficie-2 ring-1 ring-borde" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
          )}
          <Icono className="relative size-3.5" />
        </button>
      ))}
    </div>
  );
}

const SALIDA = [0.23, 1, 0.32, 1] as const;

/**
 * Arranque de MEDORA. El logo hace un "pop" corto (1 → 1.09 → 1) y la "M" se dibuja sola; el nombre entra letra por letra y un halo late
 * detrás mientras carga la sesión. Al salir se abre (crece y se desvanece) hacia el
 * login o la app. index.html pinta el mismo logo estático desde el primer cuadro,
 * así nunca se ve la ventana vacía. Con movimiento reducido todo aparece quieto.
 */
export function Splash() {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-fondo">
      {/* Resplandor de marca de fondo: solo opacidad. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute size-[36rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,#14b8a6_22%,transparent),transparent)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.6] }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      />

      <motion.div
        className="relative flex flex-col items-center"
        exit={{ opacity: 0, scale: 1.06, transition: { duration: 0.28, ease: SALIDA } }}
      >
        <div className="relative grid size-20 place-items-center">
          {/* Halo que late mientras carga (transform + opacidad). */}
          {[0, 0.9].map((retraso) => (
            <motion.span
              key={retraso}
              aria-hidden
              className="absolute inset-0 rounded-[1.4rem] border-2 border-[#14b8a6]"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0, 0.45, 0], scale: [1, 1.45] }}
              transition={{ duration: 1.8, delay: 0.7 + retraso, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
          {/* Arranca igual que el logo estático de index.html (sin parpadeo) y hace el "pop". */}
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.09, 0.98, 1] }}
            transition={{ duration: 0.6, times: [0, 0.35, 0.7, 1], ease: SALIDA }}
            className="drop-shadow-[0_12px_28px_rgba(20,184,166,0.35)]"
          >
            <IsotipoAnimado />
          </motion.div>
        </div>

        <p className="mt-6 flex overflow-hidden text-[1.375rem] font-semibold tracking-[0.3em] text-texto" aria-label="MEDORA">
          {"MEDORA".split("").map((letra, i) => (
            <motion.span
              key={i}
              aria-hidden
              initial={{ opacity: 0, y: "60%" }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 + i * 0.045, ease: SALIDA }}
            >
              {letra}
            </motion.span>
          ))}
        </p>
        <motion.p
          className="mt-1.5 text-[0.8125rem] tracking-wide text-texto-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.75 }}
        >
          Gestión hospitalaria
        </motion.p>
      </motion.div>
    </div>
  );
}

/** Isotipo con la "M" que se dibuja (pathLength). */
function IsotipoAnimado() {
  return (
    <svg viewBox="0 0 64 64" className="size-20" aria-hidden>
      <defs>
        <linearGradient id="medora-splash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#0E7490" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#medora-splash)" />
      <motion.path
        d="M16 44V22l10 12 6-8 6 8 10-12v22"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
