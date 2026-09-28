import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface PosicionFlotante {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  /** Alto disponible (para el contenedor con scroll). */
  maxHeight: number;
  /** Se abrió hacia arriba por falta de espacio abajo. */
  arriba: boolean;
}

const MARGEN = 8;
const SEPARACION = 6;

/**
 * Posición `fixed` de un desplegable respecto a su ancla. Vive fuera de su
 * contenedor (ver <Capa>), así que ni el scroll de un modal ni un
 * `overflow-hidden` lo recortan. Si no cabe abajo se abre hacia arriba; sigue
 * al ancla al hacer scroll o cambiar el tamaño de la ventana.
 */
export function usePosicionFlotante(
  ancla: RefObject<HTMLElement | null>,
  activo: boolean,
  { ancho, anchoMin = 0, alinear = "izquierda", alto = 320 }: { ancho?: number; anchoMin?: number; alinear?: "izquierda" | "derecha"; alto?: number } = {},
) {
  const [pos, setPos] = useState<PosicionFlotante | null>(null);

  useLayoutEffect(() => {
    if (!activo) return;
    const calcular = () => {
      const r = ancla.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(ancho ?? Math.max(r.width, anchoMin), innerWidth - MARGEN * 2);
      const abajo = innerHeight - r.bottom - MARGEN - SEPARACION;
      const encima = r.top - MARGEN - SEPARACION;
      const arriba = abajo < Math.min(alto, 200) && encima > abajo;
      const left = Math.min(Math.max(alinear === "derecha" ? r.right - width : r.left, MARGEN), innerWidth - width - MARGEN);
      setPos({
        left,
        width,
        arriba,
        maxHeight: Math.max(120, Math.min(alto, arriba ? encima : abajo)),
        ...(arriba ? { bottom: innerHeight - r.top + SEPARACION } : { top: r.bottom + SEPARACION }),
      });
    };
    calcular();
    window.addEventListener("scroll", calcular, true);
    window.addEventListener("resize", calcular);
    return () => {
      window.removeEventListener("scroll", calcular, true);
      window.removeEventListener("resize", calcular);
    };
  }, [activo, ancla, ancho, anchoMin, alinear, alto]);

  if (!activo || !pos) return null;
  const { arriba, maxHeight, ...caja } = pos;
  const estilo: CSSProperties = { ...caja, maxHeight, position: "fixed", transformOrigin: arriba ? "bottom" : "top" };
  return { estilo, arriba, maxHeight };
}

/** Capa por encima de todo (modales incluidos) para desplegables. */
export function Capa({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
