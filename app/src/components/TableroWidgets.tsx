import { AnimatePresence, motion, Reorder, useAnimationControls } from "motion/react";
import { Check, Minus, Plus, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { cambiarPreferencias, usePreferencias } from "@/lib/preferencias";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import type { LucideIcon } from "lucide-react";

export interface DefWidget {
  id: string;
  titulo: string;
  icono: LucideIcon;
  nodo: ReactNode;
  /** Para la galería de "Añadir widget" (y su búsqueda). */
  descripcion?: string;
}

type Vista = "operacion" | "medico";

/** Tiempo que hay que mantener presionado un widget para entrar a editar (como iOS, pero con mouse). */
export const SOSTENER_MS = 2000;
// Si el puntero se mueve más que esto mientras se sostiene, no es un "mantener presionado" (es scroll o arrastre).
const TOLERANCIA_PX = 8;

const resorte = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 } as const;
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Tablero de inicio estilo iOS:
 * - Mantener presionado un widget 2 s entra a editar (se comprime levemente mientras se sostiene).
 * - En edición, cada widget "vibra" con su propio ritmo (desfasados, como la pantalla de inicio de iOS).
 * - Arrastrar lo levanta (escala + sombra) y el resto se reacomoda con resorte.
 * - (−) lo quita encogiéndolo; (+) abre una galería con búsqueda para añadir.
 * - Listo, Escape o un clic fuera del tablero terminan la edición.
 * Orden y ocultos se guardan en el perfil (preferencias.widgets[vista]). Solo transform/opacity;
 * con "Reducir animaciones" el MotionConfig global apaga la vibración.
 */
export function TableroWidgets({ vista, widgets }: { vista: Vista; widgets: DefWidget[] }) {
  const { perfil } = useSesion();
  const prefs = usePreferencias();
  const [editar, setEditar] = useState(false);
  const [galeria, setGaleria] = useState(false);
  const [recien, setRecien] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const porId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const ids = useMemo(() => widgets.map((w) => w.id), [widgets]);

  const guardado = prefs.widgets[vista] ?? { orden: [], ocultos: [] };
  const ocultos = useMemo(() => guardado.ocultos.filter((id) => porId.has(id)), [guardado.ocultos, porId]);
  const visibles = useMemo(() => {
    const enOrden = guardado.orden.filter((id) => porId.has(id) && !ocultos.includes(id));
    // Widgets nuevos (no existían cuando se guardó el orden) van al final.
    return [...enOrden, ...ids.filter((id) => !enOrden.includes(id) && !ocultos.includes(id))];
  }, [guardado.orden, ocultos, ids, porId]);

  const guardar = (orden: string[], ocultos: string[]) => cambiarPreferencias({ widgets: { ...prefs.widgets, [vista]: { orden, ocultos } } }, perfil?.id);
  const quitar = (id: string) => guardar(visibles.filter((x) => x !== id), [...ocultos, id]);
  const anadir = (id: string) => {
    setRecien(id);
    guardar([...visibles, id], ocultos.filter((x) => x !== id));
    setGaleria(false);
    // Que se vea dónde quedó.
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>(`[data-widget="${id}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }));
  };
  const personalizado = guardado.orden.length > 0 || ocultos.length > 0;

  // Salir de la edición: Escape, o un clic fuera del tablero (y fuera de la galería).
  useEffect(() => {
    if (!editar) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && !galeria && setEditar(false);
    const fuera = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (galeria || !t || raiz.current?.contains(t) || t.closest("[role='dialog']")) return;
      setEditar(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [editar, galeria]);

  return (
    <div ref={raiz}>
      <div className="mb-3 flex min-h-8 items-center gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {editar ? (
            <motion.div
              key="edicion"
              className="flex w-full items-center gap-2"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <Boton tamano="sm" variante="secundario" icono={<Plus className="size-3.5" />} onClick={() => setGaleria(true)}>
                Añadir widget
              </Boton>
              {personalizado && (
                <Boton tamano="sm" variante="fantasma" icono={<RotateCcw className="size-3.5" />} onClick={() => guardar([], [])}>
                  Restablecer
                </Boton>
              )}
              <span className="ml-auto hidden text-xs text-texto-3 sm:inline">Arrastra para ordenar</span>
              <Boton tamano="sm" icono={<Check className="size-3.5" />} onClick={() => setEditar(false)}>
                Listo
              </Boton>
            </motion.div>
          ) : (
            <motion.p
              key="pista"
              className="ml-auto text-xs text-texto-3 select-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              Mantén presionado un widget para editar
              {/* Alternativa para teclado y lectores de pantalla (no se mantiene presionado con el teclado). */}
              <button type="button" className="sr-only focus:not-sr-only focus:ml-2 focus:underline" onClick={() => setEditar(true)}>
                Editar widgets
              </button>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <Reorder.Group axis="y" values={visibles} onReorder={(nuevo) => guardar(nuevo, ocultos)} className="space-y-4" as="div">
        <AnimatePresence initial={false}>
          {visibles.map((id, i) => {
            const w = porId.get(id);
            return w ? (
              <ItemWidget
                key={id}
                w={w}
                indice={i}
                editar={editar}
                nuevo={recien === id}
                onSostenido={() => setEditar(true)}
                onQuitar={() => quitar(id)}
              />
            ) : null;
          })}
        </AnimatePresence>
      </Reorder.Group>

      {visibles.length === 0 && (
        <div className="rounded-2xl border border-dashed border-borde-fuerte py-10 text-center text-sm text-texto-3">
          Quitaste todos los widgets.{" "}
          <button
            type="button"
            className="font-medium text-marca-texto hover:underline"
            onClick={() => {
              setEditar(true);
              setGaleria(true);
            }}
          >
            Añadir widget
          </button>
        </div>
      )}

      <GaleriaWidgets abierto={galeria} onCerrar={() => setGaleria(false)} widgets={widgets} visibles={visibles} onAnadir={anadir} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Un widget: mantener presionado, vibración, arrastre y quitar              */
/* ------------------------------------------------------------------------ */

function ItemWidget({
  w,
  indice,
  editar,
  nuevo,
  onSostenido,
  onQuitar,
}: {
  w: DefWidget;
  indice: number;
  editar: boolean;
  nuevo: boolean;
  onSostenido: () => void;
  onQuitar: () => void;
}) {
  const presion = useAnimationControls();
  const temporizador = useRef<number | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [sosteniendo, setSosteniendo] = useState(false);
  const [levantado, setLevantado] = useState(false);

  // Cada widget vibra con su propio ritmo y fase (determinista por posición: no "salta" al re-renderizar).
  const ritmo = useMemo(() => {
    const s = ((indice * 9301 + 49297) % 233280) / 233280;
    return { duracion: 0.24 + s * 0.08, retraso: s * 0.18, sentido: indice % 2 === 0 ? 1 : -1 };
  }, [indice]);

  const cancelar = () => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = null;
    inicio.current = null;
    if (sosteniendo) {
      setSosteniendo(false);
      void presion.start({ scale: 1, transition: resorte });
    }
  };
  useEffect(() => () => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
  }, []);

  const alPresionar = (e: React.PointerEvent) => {
    // Solo el botón principal (clic derecho o central no cuentan).
    if (editar || e.button > 0) return;
    inicio.current = { x: e.clientX, y: e.clientY };
    setSosteniendo(true);
    // Se comprime levemente durante los 2 s: así se nota que "algo va a pasar".
    void presion.start({ scale: 0.97, transition: { duration: SOSTENER_MS / 1000, ease: "linear" } });
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      inicio.current = null;
      setSosteniendo(false);
      void presion.start({ scale: 1, transition: { type: "spring", stiffness: 600, damping: 22 } });
      onSostenido();
    }, SOSTENER_MS);
  };
  const alMover = (e: React.PointerEvent) => {
    const o = inicio.current;
    if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > TOLERANCIA_PX) cancelar();
  };

  return (
    <Reorder.Item
      value={w.id}
      as="div"
      data-widget={w.id}
      dragListener={editar}
      // Sin "y": el eje y lo maneja el arrastre de Reorder.
      initial={nuevo ? { opacity: 0, scale: 0.88 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
      whileDrag={{ scale: 1.035, zIndex: 40, cursor: "grabbing" }}
      onDragStart={() => setLevantado(true)}
      onDragEnd={() => setLevantado(false)}
      transition={resorte}
      className={cn("relative rounded-2xl", editar && "cursor-grab touch-none")}
    >
      {/* Sombra de "levantado": capa fija a la que solo se le anima la opacidad (no box-shadow). */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_24px_48px_-12px_rgb(0_0_0/0.35)]"
        initial={false}
        animate={{ opacity: levantado ? 1 : 0 }}
        transition={{ duration: 0.18 }}
      />
      <motion.div
        // Vibración iOS: rotación mínima (los widgets son anchos: unos décimos de grado bastan) + leve rebote vertical.
        animate={
          editar
            ? { rotate: [-0.45 * ritmo.sentido, 0.45 * ritmo.sentido], y: [0, -0.6, 0] }
            : { rotate: 0, y: 0 }
        }
        transition={
          editar
            ? {
                rotate: { duration: ritmo.duracion, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: ritmo.retraso },
                y: { duration: ritmo.duracion * 2, repeat: Infinity, ease: "easeInOut", delay: ritmo.retraso },
              }
            : { duration: 0.18 }
        }
      >
        <motion.div
          animate={presion}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={cancelar}
          onPointerLeave={cancelar}
          onPointerCancel={cancelar}
          onContextMenu={(e) => (editar || sosteniendo) && e.preventDefault()}
          // En edición los widgets no responden a clics (enlaces, gráficas): solo se mueven o se quitan.
          onClickCapture={(e) => {
            if (editar) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className={cn("relative", (editar || sosteniendo) && "select-none")}
        >
          <div className={cn(editar && "pointer-events-none")}>{w.nodo}</div>
        </motion.div>

        <AnimatePresence>
          {editar && (
            <motion.button
              type="button"
              onClick={onQuitar}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Quitar ${w.titulo}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 600, damping: 28 }}
              whileTap={{ scale: 0.88 }}
              className="absolute -top-2.5 -left-2.5 z-20 grid size-7 place-items-center rounded-full bg-[color-mix(in_oklab,var(--texto-2)_85%,transparent)] text-superficie shadow-md ring-2 ring-superficie backdrop-blur"
            >
              <Minus className="size-4" strokeWidth={3} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </Reorder.Item>
  );
}

/* ------------------------------------------------------------------------ */
/* Galería para añadir, con búsqueda                                          */
/* ------------------------------------------------------------------------ */

function GaleriaWidgets({
  abierto,
  onCerrar,
  widgets,
  visibles,
  onAnadir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  widgets: DefWidget[];
  visibles: string[];
  onAnadir: (id: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  useEffect(() => {
    if (abierto) setBusqueda("");
  }, [abierto]);

  const t = sinTildes(busqueda.trim());
  const lista = widgets
    .filter((w) => !t || sinTildes(`${w.titulo} ${w.descripcion ?? ""}`).includes(t))
    // Primero lo que se puede añadir.
    .sort((a, b) => Number(visibles.includes(a.id)) - Number(visibles.includes(b.id)));

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Añadir widget" descripcion="Busca y toca uno para ponerlo al final de tu inicio.">
      <div className="space-y-3">
        <Entrada
          autoFocus
          icono={<Search className="size-4" />}
          placeholder="Buscar widgets"
          aria-label="Buscar widgets"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-texto-3">Ningún widget coincide con «{busqueda}».</p>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {lista.map((w) => {
                const puesto = visibles.includes(w.id);
                return (
                  <motion.li key={w.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}>
                    <button
                      type="button"
                      disabled={puesto}
                      onClick={() => onAnadir(w.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        puesto ? "cursor-default border-transparent bg-superficie-2/50" : "border-borde bg-superficie hover:border-marca hover:bg-marca-suave/40 active:scale-[0.99]",
                      )}
                    >
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", puesto ? "bg-superficie-2 text-texto-3" : "bg-marca-suave text-marca")}>
                        <w.icono className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium", puesto && "text-texto-2")}>{w.titulo}</span>
                        {w.descripcion && <span className="block truncate text-xs text-texto-3">{w.descripcion}</span>}
                      </span>
                      {puesto ? (
                        <span className="flex items-center gap-1 text-xs text-texto-3">
                          <Check className="size-3.5" /> En tu inicio
                        </span>
                      ) : (
                        <span className="grid size-7 place-items-center rounded-full bg-marca text-white">
                          <Plus className="size-4" />
                        </span>
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Modal>
  );
}
