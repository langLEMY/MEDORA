import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const BASE =
  "w-full rounded-[10px] border border-borde bg-superficie px-3 text-sm text-texto placeholder:text-texto-3 shadow-sm transition-[border-color,box-shadow] duration-150 outline-none hover:border-borde-fuerte focus:border-marca focus:[box-shadow:0_0_0_4px_var(--anillo)] disabled:opacity-60 aria-[invalid=true]:border-peligro aria-[invalid=true]:focus:[box-shadow:0_0_0_4px_color-mix(in_oklab,var(--peligro)_25%,transparent)]";

interface CampoProps {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  className?: string;
  children: (id: string) => ReactNode;
}

export function Campo({ etiqueta, ayuda, error, className, children }: CampoProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta && (
        <label htmlFor={id} className="text-[13px] font-medium text-texto-2">
          {etiqueta}
        </label>
      )}
      {children(id)}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="e"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="text-xs text-peligro"
          >
            {error}
          </motion.p>
        ) : ayuda ? (
          <p className="text-xs text-texto-3">{ayuda}</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type EntradaProps = InputHTMLAttributes<HTMLInputElement> & {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  icono?: ReactNode;
  contenedor?: string;
};

export const Entrada = forwardRef<HTMLInputElement, EntradaProps>(function Entrada(
  { etiqueta, ayuda, error, icono, className, contenedor, ...resto },
  ref,
) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={contenedor}>
      {(id) => (
        <div className="relative">
          {icono && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3 [&>svg]:size-4">
              {icono}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            aria-invalid={!!error}
            className={cn(BASE, "h-9", icono && "pl-9", className)}
            {...resto}
          />
        </div>
      )}
    </Campo>
  );
});

type SelectorProps = SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  contenedor?: string;
};

export const Selector = forwardRef<HTMLSelectElement, SelectorProps>(function Selector(
  { etiqueta, ayuda, error, className, contenedor, children, ...resto },
  ref,
) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={contenedor}>
      {(id) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-invalid={!!error}
            className={cn(BASE, "h-9 appearance-none pr-9", className)}
            {...resto}
          >
            {children}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-texto-3"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
          </svg>
        </div>
      )}
    </Campo>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiqueta?: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  contenedor?: string;
};

export const AreaTexto = forwardRef<HTMLTextAreaElement, AreaProps>(function AreaTexto(
  { etiqueta, ayuda, error, className, contenedor, ...resto },
  ref,
) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} className={contenedor}>
      {(id) => (
        <textarea
          ref={ref}
          id={id}
          aria-invalid={!!error}
          className={cn(BASE, "min-h-24 resize-y py-2 leading-relaxed", className)}
          {...resto}
        />
      )}
    </Campo>
  );
});

/** Selector segmentado con indicador que se desliza (layoutId compartido). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  id,
}: {
  opciones: { valor: T; etiqueta: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="inline-flex rounded-[10px] border border-borde bg-superficie-2 p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cn(
            "relative h-7 rounded-lg px-3 text-[13px] font-medium transition-colors duration-150",
            valor === o.valor ? "text-texto" : "text-texto-2 hover:text-texto",
          )}
        >
          {valor === o.valor && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-lg bg-superficie shadow-sm"
              transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
            />
          )}
          <span className="relative">{o.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}

export function Interruptor({
  activo,
  onChange,
  etiqueta,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  etiqueta?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onChange(!activo)}
      className="inline-flex items-center gap-2.5 text-sm text-texto-2"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-200",
          activo ? "bg-marca" : "bg-borde-fuerte",
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm"
          animate={{ x: activo ? 16 : 0 }}
          transition={{ type: "spring", duration: 0.25, bounce: 0.2 }}
        />
      </span>
      {etiqueta}
    </button>
  );
}
