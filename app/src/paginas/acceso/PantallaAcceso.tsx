import { motion } from "motion/react";
import { Activity, HeartPulse, ShieldCheck, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import { Isotipo, Logotipo } from "@/components/layout/Logo";

const PUNTOS = [
  { icono: Stethoscope, texto: "Historia clínica, agenda y recepción en un solo lugar" },
  { icono: Activity, texto: "Varios sistemas hospitalarios y sedes desde una sola app" },
  { icono: ShieldCheck, texto: "Cada sistema aislado a nivel de base de datos, con bitácora completa" },
];

/** Diseño partido: panel de marca a la izquierda, formulario a la derecha. */
export function PantallaAcceso({ children }: { children: ReactNode }) {
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
              className="text-[38px] leading-[1.1] font-semibold tracking-[-0.03em]"
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
                  className="flex items-center gap-3 text-[15px] text-white/75"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icono className="size-4 text-[#5eead4]" />
                  </span>
                  {texto}
                </motion.li>
              ))}
            </motion.ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/40">
            <HeartPulse className="size-3.5" /> Sistema de gestión hospitalaria
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center overflow-y-auto bg-superficie p-6">
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
    </div>
  );
}

export function Splash() {
  return (
    <div className="grid h-full place-items-center bg-fondo">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
        className="flex flex-col items-center gap-5"
      >
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Isotipo className="size-14" />
        </motion.div>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-superficie-2">
          <motion.div
            className="h-full w-1/2 rounded-full bg-[#14b8a6]"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: [0.77, 0, 0.175, 1] }}
          />
        </div>
      </motion.div>
    </div>
  );
}
