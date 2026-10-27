import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

// Paleta de MEDORA (turquesa y petróleo del logo) con colores de sistema de Apple.
const COLORES = ["#14B8A6", "#0E7490", "var(--marca)", "#34C759", "#FF9F0A", "#FF375F", "#0A84FF", "#BF5AF2", "#FFD60A"];
const PIEZAS = 96;

/**
 * Ráfaga de confeti a pantalla completa para un logro (fin de la bienvenida). Sale desde `origen`
 * (en % de la ventana), sube abriéndose en abanico y cae con gravedad mientras las tiras giran
 * como papel. Dura entre 2.4 y 3 s; solo transform y opacity; con movimiento reducido no se muestra.
 */
export function ConfetiCelebracion({ origen = { x: 50, y: 38 } }: { origen?: { x: number; y: number } }) {
  const reducir = useReducedMotion();
  const piezas = useMemo(() => {
    const alto = typeof window === "undefined" ? 800 : window.innerHeight;
    const ancho = typeof window === "undefined" ? 1200 : window.innerWidth;
    return Array.from({ length: PIEZAS }, (_, i) => {
      // Abanico hacia arriba (−165° a −15°), más denso en el centro.
      const angulo = (-90 + (Math.random() + Math.random() - 1) * 75) * (Math.PI / 180);
      const fuerza = 0.22 + Math.random() * 0.3;
      const subida = Math.sin(angulo) * alto * fuerza;
      const abre = Math.cos(angulo) * ancho * fuerza * 0.9;
      const tipo = i % 5 === 0 ? "circulo" : i % 3 === 0 ? "cuadro" : "tira";
      const lado = 6 + Math.random() * 5;
      return {
        id: i,
        x: [0, abre, abre * 1.25 + (Math.random() - 0.5) * 80],
        y: [0, subida, alto * (0.75 + Math.random() * 0.35)],
        rotate: [0, (Math.random() - 0.5) * 540, (Math.random() - 0.5) * 1080],
        rotateX: tipo === "tira" ? [0, 360, 900 + Math.random() * 540] : 0,
        duracion: 2.4 + Math.random() * 0.6,
        retraso: Math.random() * 0.12,
        ancho: tipo === "tira" ? lado * 0.7 : lado,
        alto: tipo === "tira" ? lado * 1.9 : lado,
        radio: tipo === "circulo" ? 999 : tipo === "cuadro" ? 2 : 1.5,
        color: COLORES[i % COLORES.length],
      };
    });
  }, []);

  if (reducir) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden [perspective:600px]">
      <div className="absolute" style={{ left: `${origen.x}%`, top: `${origen.y}%` }}>
        {piezas.map((p) => (
          <motion.span
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 will-change-transform"
            style={{ width: p.ancho, height: p.alto, borderRadius: p.radio, background: p.color }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
            animate={{ x: p.x, y: p.y, rotate: p.rotate, rotateX: p.rotateX, opacity: [0, 1, 1, 0] }}
            transition={{
              duration: p.duracion,
              delay: p.retraso,
              // Primer tramo: impulso que frena (sale); segundo: cae acelerando (gravedad).
              x: { duration: p.duracion, delay: p.retraso, times: [0, 0.26, 1], ease: ["easeOut", "linear"] },
              y: { duration: p.duracion, delay: p.retraso, times: [0, 0.26, 1], ease: [[0.15, 0.85, 0.35, 1], [0.45, 0, 0.85, 0.6]] },
              rotate: { duration: p.duracion, delay: p.retraso, times: [0, 0.26, 1], ease: "linear" },
              rotateX: { duration: p.duracion, delay: p.retraso, ease: "linear" },
              opacity: { duration: p.duracion, delay: p.retraso, times: [0, 0.04, 0.78, 1], ease: "linear" },
            }}
          />
        ))}
      </div>
    </div>
  );
}
