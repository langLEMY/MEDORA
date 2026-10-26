import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type HTMLAttributes, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Widgets estilo iOS para tableros: tarjeta de esquinas amplias, cifras grandes con números
 * tabulares, curva suave con degradado y tooltip translúcido (el control segmentado es
 * `Segmentado` de campos.tsx).
 * Solo SVG (sin librería de gráficos) y solo tokens de color, así sirven en claro, oscuro y sepia.
 */

/** Tarjeta de widget. `interactiva`: se levanta al pasar el mouse y cede al tocarla. */
export function Widget({ className, interactiva, ...p }: HTMLAttributes<HTMLElement> & { interactiva?: boolean }) {
  return (
    <section
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-borde/70 bg-superficie p-5 shadow-sm",
        interactiva &&
          "cursor-pointer transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:border-borde-fuerte hover:shadow-md active:translate-y-0 active:scale-[0.99]",
        className,
      )}
      {...p}
    />
  );
}

/** Cifra principal de un widget: grande, compacta y con números tabulares. */
export function CifraWidget({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[2rem] leading-none font-semibold tracking-[-0.035em] tabular-nums", className)}>{children}</div>;
}

/** Mide el ancho y alto de un contenedor (para dibujar el SVG a su tamaño exacto). */
function useTamano() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      setT((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, t] as const;
}

/**
 * Trazo suave por los puntos, monótono (método de Steffen): nunca se pasa por encima ni por
 * debajo de los valores reales, así un día en 0 no dibuja montos negativos.
 */
export function trazoSuave(P: [number, number][]) {
  const n = P.length;
  if (n < 2) return "";
  const m = P.slice(1).map((q, i) => (q[1] - P[i][1]) / (q[0] - P[i][0] || 1));
  const t = P.map((_, i) => {
    if (i === 0) return m[0];
    if (i === n - 1) return m[n - 2];
    const h0 = P[i][0] - P[i - 1][0], h1 = P[i + 1][0] - P[i][0];
    const p = (m[i - 1] * h1 + m[i] * h0) / (h0 + h1 || 1);
    return (Math.sign(m[i - 1]) + Math.sign(m[i])) * Math.min(Math.abs(m[i - 1]), Math.abs(m[i]), 0.5 * Math.abs(p));
  });
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (P[i + 1][0] - P[i][0]) / 3;
    d += `C${P[i][0] + h},${P[i][1] + t[i] * h} ${P[i + 1][0] - h},${P[i + 1][1] - t[i + 1] * h} ${P[i + 1][0]},${P[i + 1][1]}`;
  }
  return d;
}

/** Saltos "redondos" del eje (1, 2, 2.5, 5 × 10ⁿ) para unas 4 líneas guía. */
function pasoEje(max: number) {
  const bruto = max / 4 || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= bruto) ?? bruto;
}

const compacto = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v));

export interface PuntoCurva {
  etiqueta: string;
  valor: number;
}

/**
 * Curva de área con degradado, líneas guía y lectura al pasar el mouse.
 * `compacta`: sin ejes ni interacción (minigráfico de un indicador).
 */
export function CurvaArea({
  puntos,
  color = "var(--marca)",
  formato = (n) => n.toLocaleString("es-DO"),
  nombre,
  compacta,
  className,
}: {
  puntos: PuntoCurva[];
  color?: string;
  formato?: (n: number) => string;
  nombre?: string;
  compacta?: boolean;
  className?: string;
}) {
  const [ref, { w: W, h: H }] = useTamano();
  const [foco, setFoco] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  const vals = puntos.map((p) => p.valor);
  const max = Math.max(1, ...vals);
  const paso = pasoEje(max);
  const tope = compacta ? max : Math.ceil(max / paso) * paso;
  const [izq, der, arr, aba] = compacta ? [2, 2, 3, 3] : [6, 40, 14, 22];
  const X = (i: number) => izq + (vals.length > 1 ? (i / (vals.length - 1)) * (W - izq - der) : 0);
  const Y = (v: number) => arr + (1 - v / tope) * (H - arr - aba);
  const P = vals.map((v, i) => [X(i), Y(v)] as [number, number]);
  const d = W && P.length > 1 ? trazoSuave(P) : "";
  const guias = compacta ? [] : Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const ultimo = P[P.length - 1];

  const mover = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - izq) / (W - izq - der)) * (vals.length - 1));
    setFoco(Math.max(0, Math.min(vals.length - 1, i)));
  };

  return (
    <div ref={ref} className={cn("relative min-h-0", className)}>
      {W > 0 && H > 0 && d && (
        <motion.svg
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          width={W}
          height={H}
          className="block"
          role="img"
          aria-label={nombre ? `${nombre}: ${puntos.map((p) => `${p.etiqueta} ${formato(p.valor)}`).join(", ")}` : undefined}
        >
          <defs>
            <linearGradient id={`${id}a`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={compacta ? 0.28 : 0.22} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${id}l`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={color} stopOpacity={0.55} />
              <stop offset="1" stopColor={color} />
            </linearGradient>
          </defs>
          {guias.map((v) => (
            <g key={v}>
              <line x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke="var(--borde)" strokeDasharray={v ? "3 4" : undefined} />
              {v > 0 && (
                <text x={W - 4} y={Y(v) - 5} textAnchor="end" fontSize={10} fill="var(--texto-3)" className="tabular-nums">
                  {compacto(v)}
                </text>
              )}
            </g>
          ))}
          {!compacta &&
            puntos.map((p, i) =>
              i % Math.ceil(puntos.length / 7) === 0 || i === puntos.length - 1 ? (
                <text key={i} x={X(i)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--texto-3)">
                  {p.etiqueta}
                </text>
              ) : null,
            )}
          <path d={`${d}L${ultimo[0]},${Y(0)}L${P[0][0]},${Y(0)}Z`} fill={`url(#${id}a)`} />
          <path d={d} fill="none" stroke={`url(#${id}l)`} strokeWidth={compacta ? 1.75 : 2.5} strokeLinecap="round" />
          {!compacta && <circle cx={ultimo[0]} cy={ultimo[1]} r={4.5} fill={color} stroke="var(--superficie)" strokeWidth={2} />}
          {foco !== null && (
            <>
              <line x1={P[foco][0]} x2={P[foco][0]} y1={arr - 6} y2={Y(0)} stroke="var(--borde-fuerte)" />
              <circle cx={P[foco][0]} cy={P[foco][1]} r={4.5} fill={color} stroke="var(--superficie)" strokeWidth={2} />
            </>
          )}
          {!compacta && <rect width={W} height={H} fill="transparent" onPointerMove={mover} onPointerLeave={() => setFoco(null)} />}
        </motion.svg>
      )}
      {foco !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 rounded-xl border border-borde bg-[color-mix(in_oklab,var(--superficie)_85%,transparent)] px-2.5 py-2 text-xs whitespace-nowrap shadow-lg backdrop-blur-md"
          style={{
            left: P[foco][0],
            top: P[foco][1],
            transform: `translate(${P[foco][0] > W * 0.7 ? "calc(-100% - 12px)" : "12px"}, calc(-100% - 8px))`,
          }}
        >
          <div className="mb-0.5 text-texto-3">{puntos[foco].etiqueta}</div>
          <div className="flex items-center gap-1.5 font-semibold text-texto tabular-nums">
            <i className="inline-block size-2 rounded-[2px]" style={{ background: color }} />
            {formato(puntos[foco].valor)}
          </div>
        </div>
      )}
    </div>
  );
}

export interface PuntoEspejo {
  etiqueta: string;
  arriba: number;
  abajo: number;
}

/**
 * Curva espejo: una serie hacia arriba y otra hacia abajo de la línea central, con la misma
 * escala para compararlas (p. ej. lo que entró y lo que salió). Rayas punteadas: el promedio
 * de cada lado. `onElegir` recibe el índice del punto tocado.
 */
export function CurvaEspejo({
  puntos: entrada,
  colores,
  nombres,
  formato,
  extraTooltip,
  promedios,
  onElegir,
  className,
}: {
  puntos: PuntoEspejo[];
  /** Degradado de izquierda a derecha de cada lado. */
  colores: { arriba: [string, string]; abajo: [string, string] };
  nombres: { arriba: string; abajo: string };
  formato: (n: number) => string;
  /** Renglón extra del tooltip (p. ej. lo que quedó). */
  extraTooltip?: (p: PuntoEspejo) => { etiqueta: string; valor: string; color?: string };
  /** Promedios de cada lado (si no, el de todos los puntos). */
  promedios?: { arriba: number; abajo: number };
  onElegir?: (i: number) => void;
  className?: string;
}) {
  const [ref, { w: W, h: H }] = useTamano();
  const [foco, setFoco] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Un solo período (p. ej. "hoy"): se dibuja plano de lado a lado.
  const unico = entrada.length === 1;
  const puntos = unico ? [entrada[0], entrada[0]] : entrada;
  const n = puntos.length;
  const max = Math.max(1, ...puntos.flatMap((p) => [p.arriba, p.abajo]));
  const [izq, der, arr, ejeX] = [22, 22, 12, 24];
  const alto = H - ejeX;
  const medio = arr + (alto - arr) / 2;
  const amp = (alto - arr) / 2 - 4;
  const X = (i: number) => izq + (n > 1 ? (i / (n - 1)) * (W - izq - der) : (W - izq - der) / 2);
  const Ya = (v: number) => medio - 2 - (v / max) * amp;
  const Yb = (v: number) => medio + 2 + (v / max) * amp;
  const Pa = puntos.map((p, i) => [X(i), Ya(p.arriba)] as [number, number]);
  const Pb = puntos.map((p, i) => [X(i), Yb(p.abajo)] as [number, number]);
  const prom = (k: "arriba" | "abajo") => promedios?.[k] ?? (n ? puntos.reduce((s, p) => s + p[k], 0) / n : 0);
  const paso = Math.max(1, Math.ceil(n / 8));
  const marcas = Array.from({ length: 9 }, (_, i) => arr + ((alto - arr) * i) / 8);

  const indice = (e: MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - izq) / (W - izq - der)) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  const area = (P: [number, number][], base: number) => `${trazoSuave(P)}L${P[n - 1][0]},${base}L${P[0][0]},${base}Z`;

  return (
    <div ref={ref} className={cn("relative min-h-0", className)}>
      {W > 0 && H > 0 && n > 1 && (
        <motion.svg
          initial={{ opacity: 0, scaleY: 0.92 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          style={{ transformOrigin: `50% ${medio}px` }}
          width={W}
          height={H}
          className={cn("block", onElegir && "cursor-pointer")}
          role="img"
          aria-label={`${nombres.arriba} y ${nombres.abajo}: ${puntos.map((p) => `${p.etiqueta} ${formato(p.arriba)} / ${formato(p.abajo)}`).join(", ")}`}
        >
          <defs>
            {(["arriba", "abajo"] as const).map((k) => (
              <g key={k}>
                <linearGradient id={`${id}${k}l`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0.1" stopColor={colores[k][0]} />
                  <stop offset="0.9" stopColor={colores[k][1]} />
                </linearGradient>
                <linearGradient id={`${id}${k}a`} x1="0" x2="0" y1={k === "arriba" ? "1" : "0"} y2={k === "arriba" ? "0" : "1"}>
                  <stop offset="0" stopColor={colores[k][1]} stopOpacity={0} />
                  <stop offset="1" stopColor={colores[k][1]} stopOpacity={0.16} />
                </linearGradient>
              </g>
            ))}
          </defs>

          {/* Marcas a los lados, como una regla. */}
          {marcas.map((y) => (
            <g key={y} stroke="var(--borde-fuerte)">
              <line x1={6} x2={12} y1={y} y2={y} />
              <line x1={W - 12} x2={W - 6} y1={y} y2={y} />
            </g>
          ))}
          <line x1={izq} x2={W - der} y1={medio} y2={medio} stroke="var(--borde)" />

          <path d={area(Pa, medio)} fill={`url(#${id}arribaa)`} />
          <path d={area(Pb, medio)} fill={`url(#${id}abajoa)`} />
          <line x1={izq} x2={W - der} y1={Ya(prom("arriba"))} y2={Ya(prom("arriba"))} stroke={colores.arriba[1]} strokeOpacity={0.45} strokeDasharray="4 4" />
          <line x1={izq} x2={W - der} y1={Yb(prom("abajo"))} y2={Yb(prom("abajo"))} stroke={colores.abajo[1]} strokeOpacity={0.45} strokeDasharray="4 4" />
          <path d={trazoSuave(Pa)} fill="none" stroke={`url(#${id}arribal)`} strokeWidth={2.5} strokeLinecap="round" />
          <path d={trazoSuave(Pb)} fill="none" stroke={`url(#${id}abajol)`} strokeWidth={2.5} strokeLinecap="round" />

          {puntos.map((p, i) =>
            (unico ? i === 0 : i % paso === 0 || i === n - 1) ? (
              <text key={i} x={unico ? W / 2 : X(i)} y={H - 6} textAnchor="middle" fontSize={10.5} fill={foco === i ? "var(--texto)" : "var(--texto-3)"}>
                {p.etiqueta}
              </text>
            ) : null,
          )}

          {foco !== null && (
            <>
              <line x1={X(foco)} x2={X(foco)} y1={arr - 4} y2={alto + 2} stroke="var(--borde-fuerte)" />
              <circle cx={Pa[foco][0]} cy={Pa[foco][1]} r={4} fill={colores.arriba[1]} stroke="var(--superficie)" strokeWidth={2} />
              <circle cx={Pb[foco][0]} cy={Pb[foco][1]} r={4} fill={colores.abajo[1]} stroke="var(--superficie)" strokeWidth={2} />
            </>
          )}
          <rect
            width={W}
            height={H}
            fill="transparent"
            onPointerMove={(e) => setFoco(indice(e))}
            onPointerLeave={() => setFoco(null)}
            onClick={onElegir ? (e) => onElegir(unico ? 0 : indice(e)) : undefined}
          />
        </motion.svg>
      )}
      {foco !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl border border-borde bg-[color-mix(in_oklab,var(--superficie)_85%,transparent)] px-2.5 py-2 text-xs whitespace-nowrap shadow-lg backdrop-blur-md"
          style={{ left: X(foco), transform: `translateX(${X(foco) > W * 0.65 ? "calc(-100% - 12px)" : "12px"})` }}
        >
          <div className="mb-1 text-texto-3">{puntos[foco].etiqueta}</div>
          {[
            { etiqueta: nombres.arriba, valor: formato(puntos[foco].arriba), color: colores.arriba[1] },
            { etiqueta: nombres.abajo, valor: formato(puntos[foco].abajo), color: colores.abajo[1] },
            ...(extraTooltip ? [extraTooltip(puntos[foco])] : []),
          ].map((r) => (
            <div key={r.etiqueta} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-texto-2">
                {r.color && <i className="inline-block size-2 rounded-[2px]" style={{ background: r.color }} />}
                {r.etiqueta}
              </span>
              <b className="font-semibold text-texto tabular-nums">{r.valor}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
