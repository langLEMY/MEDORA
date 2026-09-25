import type { Transition, Variants } from "motion/react";

/**
 * Vocabulario de movimiento de MEDORA. Reglas:
 * - Solo transform y opacity (nunca layout) salvo layout animations de Motion.
 * - Entradas rápidas (≤ 300 ms) con curva de salida fuerte; nada de ease-in.
 * - Nunca escalar desde 0: los elementos "aparecen" desde 0.96–0.98.
 * - prefers-reduced-motion lo respeta <MotionConfig reducedMotion="user"> en main.tsx.
 */
export const EASE_SALIDA = [0.23, 1, 0.32, 1] as const;

export const resorte: Transition = { type: "spring", duration: 0.35, bounce: 0.12 };
export const resorteSuave: Transition = { type: "spring", duration: 0.5, bounce: 0.08 };
export const rapido: Transition = { duration: 0.18, ease: EASE_SALIDA };

export const pagina: Variants = {
  inicial: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_SALIDA } },
  salida: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

export const contenedorEscalonado: Variants = {
  inicial: {},
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};

export const itemEscalonado: Variants = {
  inicial: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_SALIDA } },
};
