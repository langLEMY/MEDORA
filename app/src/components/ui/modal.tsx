import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  children?: ReactNode;
  pie?: ReactNode;
  ancho?: "sm" | "md" | "lg" | "xl";
  /** Panel lateral (desde la derecha) en vez de diálogo centrado. */
  lateral?: boolean;
}

const ANCHOS = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Modal({ abierto, onCerrar, titulo, descripcion, children, pie, ancho = "md", lateral }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const anterior = useRef<HTMLElement | null>(null);
  // En ref: los padres suelen pasar una función inline y no queremos re-enfocar en cada render.
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    if (!abierto) return;
    anterior.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cerrar.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Enfoca el primer campo del formulario, no el botón de cerrar.
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,[data-autofocus]");
      (el ?? panel.current)?.focus();
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
      anterior.current?.focus?.();
    };
  }, [abierto]);

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[rgb(10_13_18/0.45)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCerrar}
          />
          <div
            className={cn(
              "pointer-events-none absolute inset-0 flex",
              lateral ? "justify-end" : "items-start justify-center overflow-y-auto p-4 pt-[8vh]",
            )}
          >
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal
              tabIndex={-1}
              // Pop: nace un poco más pequeño y con un rebote leve; se va rápido.
              initial={lateral ? { x: "100%" } : { opacity: 0, scale: 0.94, y: 12 }}
              animate={lateral ? { x: 0 } : { opacity: 1, scale: 1, y: 0 }}
              exit={
                lateral
                  ? { x: "100%", transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }
                  : { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] } }
              }
              transition={lateral ? { type: "spring", duration: 0.42, bounce: 0.05 } : { type: "spring", duration: 0.38, bounce: 0.24 }}
              className={cn(
                "pointer-events-auto flex w-full flex-col bg-superficie shadow-lg outline-none",
                lateral
                  ? "h-full max-w-xl border-l border-borde"
                  : cn("max-h-[84vh] rounded-2xl border border-borde", ANCHOS[ancho]),
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-borde px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.01em]">{titulo}</h2>
                  {descripcion && <p className="mt-0.5 text-sm text-texto-2">{descripcion}</p>}
                </div>
                <button
                  onClick={onCerrar}
                  className="-mr-2 grid size-8 place-items-center rounded-lg text-texto-3 transition-colors hover:bg-superficie-2 hover:text-texto"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
              </div>
              {children != null && children !== false && (
                <motion.div
                  className="flex-1 overflow-y-auto px-6 py-5"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
                >
                  {children}
                </motion.div>
              )}
              {pie && (
                <div className="flex items-center justify-end gap-2 border-t border-borde bg-superficie-2/50 px-6 py-3.5">
                  {pie}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
