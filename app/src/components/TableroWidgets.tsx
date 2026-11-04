import { AnimatePresence, motion, Reorder } from "motion/react";
import { Check, GripVertical, LayoutGrid, Minus, Plus, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Boton } from "@/components/ui/boton";
import { cambiarPreferencias, usePreferencias } from "@/lib/preferencias";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";

export interface DefWidget {
  id: string;
  titulo: string;
  icono: LucideIcon;
  nodo: ReactNode;
}

type Vista = "operacion" | "medico";

/**
 * Tablero de inicio personalizable estilo iOS: el usuario arrastra para reordenar
 * sus widgets, los quita (−) y los vuelve a añadir desde la bandeja. El orden y lo
 * oculto se guardan en su perfil (preferencias.widgets[vista]) y lo siguen a
 * cualquier computadora. Solo transform/opacity; la "vibración" respeta
 * prefers-reduced-motion por el MotionConfig global.
 */
export function TableroWidgets({ vista, widgets }: { vista: Vista; widgets: DefWidget[] }) {
  const { perfil } = useSesion();
  const prefs = usePreferencias();
  const [editar, setEditar] = useState(false);

  const porId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const ids = useMemo(() => widgets.map((w) => w.id), [widgets]);

  const guardado = prefs.widgets[vista] ?? { orden: [], ocultos: [] };
  // Solo ids que aún existen en el registro (descarta widgets retirados en una versión nueva).
  const ocultos = useMemo(() => guardado.ocultos.filter((id) => porId.has(id)), [guardado.ocultos, porId]);
  const visibles = useMemo(() => {
    const enOrden = guardado.orden.filter((id) => porId.has(id) && !ocultos.includes(id));
    // Widgets nuevos (no estaban cuando se guardó el orden) van al final.
    const faltan = ids.filter((id) => !enOrden.includes(id) && !ocultos.includes(id));
    return [...enOrden, ...faltan];
  }, [guardado.orden, ocultos, ids, porId]);

  const disponibles = useMemo(() => ids.filter((id) => ocultos.includes(id)), [ids, ocultos]);

  const guardar = (orden: string[], ocultos: string[]) =>
    cambiarPreferencias({ widgets: { ...prefs.widgets, [vista]: { orden, ocultos } } }, perfil?.id);

  const reordenar = (nuevo: string[]) => guardar(nuevo, ocultos);
  const quitar = (id: string) => guardar(visibles.filter((x) => x !== id), [...ocultos, id]);
  const anadir = (id: string) => guardar([...visibles, id], ocultos.filter((x) => x !== id));
  const restablecer = () => {
    setEditar(false);
    guardar([], []);
  };

  const personalizado = guardado.orden.length > 0 || ocultos.length > 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        {editar && personalizado && (
          <Boton variante="fantasma" tamano="sm" onClick={restablecer}>
            Restablecer
          </Boton>
        )}
        <Boton
          variante={editar ? "primario" : "secundario"}
          tamano="sm"
          icono={editar ? <Check className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
          onClick={() => setEditar((v) => !v)}
        >
          {editar ? "Listo" : "Personalizar"}
        </Boton>
      </div>

      <Reorder.Group axis="y" values={visibles} onReorder={reordenar} className="space-y-4" as="div">
        {visibles.map((id) => {
          const w = porId.get(id);
          if (!w) return null;
          return (
            <Reorder.Item
              key={id}
              value={id}
              as="div"
              dragListener={editar}
              whileDrag={{ scale: 1.015, boxShadow: "var(--sombra-lg)", zIndex: 30, cursor: "grabbing" }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="relative"
            >
              <motion.div
                animate={editar ? { rotate: [-0.35, 0.35] } : { rotate: 0 }}
                transition={editar ? { duration: 0.22, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.2 }}
              >
                {editar && (
                  <div className="absolute -top-2 -left-2 z-20 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => quitar(id)}
                      aria-label={`Quitar ${w.titulo}`}
                      className="grid size-6 place-items-center rounded-full bg-peligro text-white shadow-md ring-2 ring-superficie transition-transform active:scale-90"
                    >
                      <Minus className="size-3.5" strokeWidth={3} />
                    </button>
                  </div>
                )}
                {editar && (
                  <div className="pointer-events-none absolute top-1/2 right-3 z-20 -translate-y-1/2 text-texto-3/70">
                    <GripVertical className="size-5" />
                  </div>
                )}
                <div className={cn(editar && "cursor-grab select-none ring-1 ring-borde-fuerte/60 rounded-2xl")}>{w.nodo}</div>
              </motion.div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {/* Bandeja para volver a añadir lo oculto (solo en modo personalizar) */}
      <AnimatePresence>
        {editar && disponibles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="mt-4 rounded-2xl border border-dashed border-borde-fuerte bg-superficie-2/40 p-4"
          >
            <p className="mb-3 text-xs font-medium text-texto-2">Añadir de nuevo</p>
            <div className="flex flex-wrap gap-2">
              {disponibles.map((id) => {
                const w = porId.get(id);
                if (!w) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => anadir(id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-2 text-sm font-medium transition-colors hover:border-marca hover:text-marca-texto"
                  >
                    <w.icono className="size-4" />
                    {w.titulo}
                    <Plus className="size-3.5 text-texto-3" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {visibles.length === 0 && !editar && (
        <p className="py-10 text-center text-sm text-texto-3">
          Ocultaste todos los widgets.{" "}
          <button type="button" onClick={() => setEditar(true)} className="font-medium text-marca-texto hover:underline">
            Personalizar
          </button>
        </p>
      )}
    </div>
  );
}
