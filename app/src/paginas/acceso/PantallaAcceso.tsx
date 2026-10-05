import { motion } from "motion/react";
import { ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Isotipo, Logotipo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";

const PUNTOS = [
  { icono: Stethoscope, texto: "Tus pacientes, la agenda y la consulta en un solo lugar" },
  { icono: Wallet, texto: "Caja, facturación y seguros al día, sin papeles" },
  { icono: ShieldCheck, texto: "Tu cuenta protegida, con verificación en dos pasos" },
];

/** Conectado / sin conexión, en vivo. */
function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const si = () => setEnLinea(true);
    const no = () => setEnLinea(false);
    window.addEventListener("online", si);
    window.addEventListener("offline", no);
    return () => {
      window.removeEventListener("online", si);
      window.removeEventListener("offline", no);
    };
  }, []);
  return enLinea;
}

/**
 * Diseño partido: panel de marca a la izquierda, formulario a la derecha. Solo la
 * marca MEDORA: el login no muestra el nombre de ningún hospital.
 */
export function PantallaAcceso({ children }: { children: ReactNode }) {
  const enLinea = useEnLinea();
  return (
    <div className="grid h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#06201d] lg:block">
        {/* Aurora: dos manchas de color que derivan lentamente. Solo transform. */}
        <motion.div
          className="absolute -top-40 -left-40 size-[620px] rounded-full bg-[radial-gradient(circle,#14b8a6_0%,transparent_65%)] opacity-50 blur-2xl"
          animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-32 -bottom-48 size-[560px] rounded-full bg-[radial-gradient(circle,#0e7490_0%,transparent_65%)] opacity-60 blur-2xl"
          animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-[size:44px_44px]" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <Isotipo className="size-9" />
            <span className="text-lg font-semibold tracking-[0.1em]">MEDORA</span>
          </div>

          <div className="max-w-md">
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              className="text-[2.375rem] leading-[1.1] font-semibold tracking-[-0.03em]"
            >
              La gestión hospitalaria,
              <br />
              <span className="bg-gradient-to-r from-[#5eead4] to-[#67e8f9] bg-clip-text text-transparent">
                en calma.
              </span>
            </motion.h1>
            <motion.ul
              initial="i"
              animate="v"
              variants={{ v: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } } }}
              className="mt-8 space-y-4"
            >
              {PUNTOS.map(({ icono: Icono, texto }) => (
                <motion.li
                  key={texto}
                  variants={{ i: { opacity: 0, x: -8 }, v: { opacity: 1, x: 0, transition: { duration: 0.4 } } }}
                  className="flex items-center gap-3 text-[0.9375rem] text-white/75"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icono className="size-4 text-[#5eead4]" />
                  </span>
                  {texto}
                </motion.li>
              ))}
            </motion.ul>
          </div>

          <EstadoPie enLinea={enLinea} className="text-white/45" />
        </div>
      </div>

      <div className="flex flex-col overflow-y-auto bg-superficie p-6">
        <div className="flex flex-1 items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-[380px]"
          >
            <Logotipo className="mb-10 lg:hidden" />
            {children}
          </motion.div>
        </div>
        <EstadoPie enLinea={enLinea} className="mt-6 justify-center text-texto-3 lg:hidden" />
      </div>
    </div>
  );
}

/** Versión y conexión: lo primero que pregunta soporte. */
function EstadoPie({ enLinea, className }: { enLinea: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <span>MEDORA {__VERSION_APP__}</span>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1.5" role="status">
        <span className={cn("size-1.5 rounded-full", enLinea ? "bg-[#34d399]" : "bg-[#f87171]")} />
        {enLinea ? "Conectado" : "Sin conexión a internet"}
      </span>
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
