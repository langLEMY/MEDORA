import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variante = "primario" | "secundario" | "fantasma" | "peligro" | "suave";
type Tamano = "sm" | "md" | "lg" | "icono";

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-marca text-white shadow-sm hover:brightness-110 active:brightness-95 [box-shadow:inset_0_1px_0_rgb(255_255_255/0.15),var(--sombra-sm)]",
  secundario: "bg-superficie text-texto border border-borde shadow-sm hover:bg-superficie-2 hover:border-borde-fuerte",
  fantasma: "text-texto-2 hover:bg-superficie-2 hover:text-texto",
  peligro: "bg-peligro text-white shadow-sm hover:brightness-110",
  suave: "bg-marca-suave text-marca-texto hover:brightness-[0.97]",
};

const TAMANOS: Record<Tamano, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-[10px]",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icono: "h-9 w-9 rounded-[10px] justify-center",
};

export interface BotonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  icono?: ReactNode;
  children?: ReactNode;
}

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { variante = "primario", tamano = "md", cargando, icono, children, className, disabled, type = "button", ...resto },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      // Feedback táctil sutil: el botón "cede" al presionarlo.
      whileTap={disabled || cargando ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      disabled={disabled || cargando}
      className={cn(
        "relative inline-flex items-center font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,filter,opacity] duration-150 disabled:opacity-50 disabled:pointer-events-none",
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...resto}
    >
      <span className={cn("inline-flex items-center gap-[inherit]", cargando && "invisible")}>
        {icono}
        {children}
      </span>
      {cargando && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </motion.button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
