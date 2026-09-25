import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Menú desplegable anclado a su disparador. Escala desde el borde del que nace
 * (transform-origin), no desde el centro: se lee como "sale de aquí".
 */
export function Menu({
  disparador,
  children,
  alinear = "izquierda",
  ancho = 240,
  className,
}: {
  disparador: (abierto: boolean) => ReactNode;
  children: (cerrar: () => void) => ReactNode;
  alinear?: "izquierda" | "derecha";
  ancho?: number;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className={cn("relative", className)}>
      <div onClick={() => setAbierto((a) => !a)}>{disparador(abierto)}</div>
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ type: "spring", duration: 0.25, bounce: 0.1 }}
            style={{ width: ancho, transformOrigin: alinear === "izquierda" ? "top left" : "top right" }}
            className={cn(
              "absolute top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-borde bg-superficie p-1 shadow-lg",
              alinear === "izquierda" ? "left-0" : "right-0",
            )}
          >
            {children(() => setAbierto(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ItemMenu({
  icono,
  children,
  onClick,
  peligro,
  activo,
  derecha,
}: {
  icono?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  peligro?: boolean;
  activo?: boolean;
  derecha?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-100 [&>svg]:size-4 [&>svg]:shrink-0",
        peligro ? "text-peligro hover:bg-[color-mix(in_oklab,var(--peligro)_8%,transparent)]" : "text-texto hover:bg-superficie-2",
        activo && "bg-superficie-2",
      )}
    >
      {icono}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {derecha}
    </button>
  );
}

export const SeparadorMenu = () => <div className="my-1 h-px bg-borde" />;
