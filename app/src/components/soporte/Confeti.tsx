import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

const COLORES = ["var(--marca)", "var(--exito)", "#ff9f0a", "#ff375f", "#0a84ff", "#bf5af2"];
const PIEZAS = 34;

/**
 * Lluvia breve de confeti (como el efecto de Mensajes) al resolver una solicitud.
 * Solo transform y opacity; con movimiento reducido no se muestra. Cambiar `disparo`
 * la repite.
 */
export function Confeti({ disparo }: { disparo: number }) {
  const reducir = useReducedMotion();
  const piezas = useMemo(
    () =>
      Array.from({ length: PIEZAS }, (_, i) => ({
        id: `${disparo}-${i}`,
        x: (Math.random() - 0.5) * 520,
        y: 260 + Math.random() * 260,
        giro: (Math.random() - 0.5) * 720,
        retraso: Math.random() * 0.15,
        ancho: 6 + Math.random() * 5,
        redondo: Math.random() < 0.3,
        color: COLORES[i % COLORES.length],
      })),
    [disparo],
  );
  if (!disparo || reducir) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center overflow-visible">
      {piezas.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y, rotate: p.giro, opacity: 0 }}
          transition={{ duration: 1.5, delay: p.retraso, ease: [0.2, 0.7, 0.4, 1] }}
          className="absolute top-0"
          style={{ width: p.ancho, height: p.redondo ? p.ancho : p.ancho * 1.6, borderRadius: p.redondo ? 999 : 2, background: p.color }}
        />
      ))}
    </div>
  );
}
