import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Fila } from "@/lib/supabase";
import { cn, moneda } from "@/lib/utils";
import { Boton } from "./ui/boton";
import { Capa, usePosicionFlotante } from "./ui/flotante";
import { Insignia } from "./ui/superficies";

/** Lo que la aseguradora elegida tiene pactado para un servicio. */
export interface Pactado {
  precio: number | null;
  monto_cubierto: number;
}

export const SIN_AREA = "Otros servicios";
export const areaDe = (s: Pick<Fila<"servicios">, "especialidad">) => s.especialidad || SIN_AREA;

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Agregar un servicio al cobro sin una lista enorme: primero el área (chips),
 * luego el servicio. Con aseguradora, marca lo que está en su tarifario (precio
 * pactado y cuánto cubre) y lo muestra primero.
 */
export function SelectorServicio({
  servicios,
  pactados,
  area,
  onArea,
  onElegir,
}: {
  servicios: Fila<"servicios">[];
  pactados: Map<string, Pactado> | null;
  area: string | null;
  onArea: (a: string | null) => void;
  onElegir: (s: Fila<"servicios">) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState(0);
  const ancla = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pos = usePosicionFlotante(ancla, abierto, { anchoMin: 440, alto: 460 });

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!ancla.current?.contains(n) && !panel.current?.contains(n)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const activos = useMemo(() => servicios.filter((s) => s.activo), [servicios]);

  // Áreas con su cantidad de servicios; "Otros servicios" siempre al final.
  const areas = useMemo(() => {
    const c = new Map<string, number>();
    activos.forEach((s) => c.set(areaDe(s), (c.get(areaDe(s)) ?? 0) + 1));
    return [...c.entries()].sort(([a], [b]) => (a === SIN_AREA ? 1 : b === SIN_AREA ? -1 : a.localeCompare(b)));
  }, [activos]);

  const lista = useMemo(() => {
    const t = norm(texto.trim());
    return activos
      .filter((s) => (t ? true : !area || areaDe(s) === area))
      .filter((s) => !t || norm(`${s.nombre} ${s.codigo ?? ""}`).includes(t))
      .sort((a, b) => Number(!!pactados?.has(b.id)) - Number(!!pactados?.has(a.id)) || a.nombre.localeCompare(b.nombre))
      .slice(0, 80);
  }, [activos, area, texto, pactados]);

  useEffect(() => setIndice(0), [texto, area]);

  const elegir = (s: Fila<"servicios">) => {
    onElegir(s);
    setTexto("");
    setAbierto(false);
  };

  return (
    <div ref={ancla}>
      <Boton variante="secundario" icono={<Plus className="size-4" />} onClick={() => setAbierto((a) => !a)}>
        Agregar servicio
      </Boton>
      <Capa>
        <AnimatePresence>
          {abierto && pos && (
            <motion.div
              ref={panel}
              initial={{ opacity: 0, y: pos.arriba ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ type: "spring", duration: 0.22, bounce: 0.1 }}
              style={pos.estilo}
              className="z-[60] flex flex-col overflow-hidden rounded-xl border border-borde bg-superficie shadow-lg"
            >
              <div className="flex items-center gap-2 border-b border-borde px-3">
                <Search className="size-4 text-texto-3" />
                <input
                  autoFocus
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") setIndice((i) => Math.min(i + 1, lista.length - 1));
                    if (e.key === "ArrowUp") setIndice((i) => Math.max(i - 1, 0));
                    if (e.key === "Enter" && lista[indice]) {
                      e.preventDefault();
                      elegir(lista[indice]);
                    }
                    if (e.key === "Escape") setAbierto(false);
                  }}
                  placeholder="Buscar en todos los servicios…"
                  className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-texto-3"
                />
              </div>

              {!texto.trim() && (
                <div className="flex flex-wrap gap-1.5 border-b border-borde p-2.5">
                  <Chip activo={!area} onClick={() => onArea(null)}>
                    Todas
                  </Chip>
                  {areas.map(([a, n]) => (
                    <Chip key={a} activo={area === a} onClick={() => onArea(area === a ? null : a)}>
                      {a} <span className="text-texto-3">{n}</span>
                    </Chip>
                  ))}
                </div>
              )}

              <ul className="min-h-0 flex-1 overflow-y-auto p-1">
                {lista.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-texto-3">No hay servicios que coincidan.</li>
                ) : (
                  lista.map((s, i) => {
                    const p = pactados?.get(s.id);
                    const precio = p?.precio ?? Number(s.precio);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setIndice(i)}
                          onClick={() => elegir(s)}
                          className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm", i === indice && "bg-superficie-2")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{s.nombre}</span>
                            <span className="block truncate text-xs text-texto-3">{[s.codigo, texto.trim() && areaDe(s)].filter(Boolean).join(" · ")}</span>
                          </span>
                          {p && (
                            <Insignia tono="info">
                              <ShieldCheck className="size-3" /> cubre {moneda(Math.min(p.monto_cubierto, precio))}
                            </Insignia>
                          )}
                          <span className="w-24 text-right font-medium tabular">{moneda(precio)}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </Capa>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150",
        activo ? "border-marca bg-marca-suave text-marca-texto" : "border-borde text-texto-2 hover:border-borde-fuerte hover:text-texto",
      )}
    >
      {children}
    </button>
  );
}
