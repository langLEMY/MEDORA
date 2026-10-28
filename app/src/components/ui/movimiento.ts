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

// Cambiar de pantalla es lo que más se repite en el día: la entrada es corta para que
// la pantalla nueva se sienta inmediata.
export const pagina: Variants = {
  inicial: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_SALIDA } },
  salida: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

/** Solo las primeras filas entran escalonadas; el resto llega con la sexta. Así una
 *  lista de 25 o 100 renglones termina de aparecer en ≤ 0,35 s y no en más de un segundo. */
const ESCALON_S = 0.025;
const ESCALONES = 6;
export const contenedorEscalonado: Variants = {
  inicial: {},
  visible: { transition: { delayChildren: (i: number) => Math.min(i, ESCALONES) * ESCALON_S } },
};

export const itemEscalonado: Variants = {
  inicial: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_SALIDA } },
};
