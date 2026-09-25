import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn, iniciales } from "@/lib/utils";
import { itemEscalonado } from "./movimiento";

export function Tarjeta({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-borde bg-superficie shadow-sm", className)} {...p} />;
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-texto">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-texto-2">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

const TONOS = {
  neutro: "bg-superficie-2 text-texto-2 ring-borde",
  marca: "bg-marca-suave text-marca-texto ring-[color-mix(in_oklab,var(--marca)_20%,transparent)]",
  exito: "bg-[color-mix(in_oklab,var(--exito)_10%,var(--superficie))] text-exito ring-[color-mix(in_oklab,var(--exito)_20%,transparent)]",
  aviso: "bg-[color-mix(in_oklab,var(--aviso)_10%,var(--superficie))] text-aviso ring-[color-mix(in_oklab,var(--aviso)_20%,transparent)]",
  peligro: "bg-[color-mix(in_oklab,var(--peligro)_10%,var(--superficie))] text-peligro ring-[color-mix(in_oklab,var(--peligro)_20%,transparent)]",
  info: "bg-[color-mix(in_oklab,#2e90fa_10%,var(--superficie))] text-[#1570ef] ring-[color-mix(in_oklab,#2e90fa_20%,transparent)] dark:text-[#84caff]",
  violeta: "bg-[color-mix(in_oklab,#7a5af8_10%,var(--superficie))] text-[#6941c6] ring-[color-mix(in_oklab,#7a5af8_20%,transparent)] dark:text-[#bdb4fe]",
} as const;
export type Tono = keyof typeof TONOS;

export function Insignia({
  tono = "neutro",
  punto,
  children,
  className,
}: {
  tono?: Tono;
  punto?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONOS[tono],
        className,
      )}
    >
      {punto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn("esqueleto rounded-lg", className)} />;
}

export function FilasEsqueleto({ filas = 6 }: { filas?: number }) {
  return (
    <div className="divide-y divide-borde">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ opacity: 1 - i * 0.12 }}>
          <Esqueleto className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Esqueleto className="h-3 w-1/3" />
            <Esqueleto className="h-2.5 w-1/5" />
          </div>
          <Esqueleto className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function Vacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-borde bg-superficie-2 text-texto-2 shadow-sm [&>svg]:size-5">
        {icono}
      </div>
      <p className="text-[15px] font-semibold text-texto">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-sm text-texto-2">{descripcion}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </motion.div>
  );
}

const PALETA_AVATAR = ["#0e9384", "#1570ef", "#6938ef", "#c11574", "#dc6803", "#079455", "#0086c9", "#e04f16"];

export function Avatar({ nombre, tamano = 32, className }: { nombre?: string | null; tamano?: number; className?: string }) {
  const n = nombre ?? "";
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = PALETA_AVATAR[h % PALETA_AVATAR.length];
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{
        width: tamano,
        height: tamano,
        fontSize: tamano * 0.38,
        background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, black))`,
      }}
      aria-hidden
    >
      {iniciales(n)}
    </span>
  );
}

/** Número que cuenta hasta su valor al entrar en pantalla. */
export function NumeroAnimado({ valor, formato }: { valor: number; formato?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const texto = useTransform(mv, (v) => (formato ? formato(v) : Math.round(v).toLocaleString("es-DO")));

  useEffect(() => {
    if (!visible) return;
    const c = animate(mv, valor, { duration: 0.9, ease: [0.23, 1, 0.32, 1] });
    return () => c.stop();
  }, [valor, visible, mv]);

  return (
    <motion.span ref={ref} className="tabular">
      {texto}
    </motion.span>
  );
}

export function FilaAnimada({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div variants={itemEscalonado} className={className} onClick={onClick}>
      {children}
    </motion.div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-borde bg-superficie-2 px-1 font-sans text-[11px] font-medium text-texto-3">
      {children}
    </kbd>
  );
}
