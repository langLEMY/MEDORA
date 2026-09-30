import { AnimatePresence, motion } from "motion/react";
import { CloudOff, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEnLinea } from "@/lib/sinConexion";

/**
 * Aviso arriba de la app cuando se cae el internet (y un "Conexión restablecida"
 * breve al volver). Lo que se ve mientras tanto es la copia guardada en el equipo.
 */
export function FranjaSinConexion() {
  const enLinea = useEnLinea();
  const [volvio, setVolvio] = useState(false);
  const antes = useRef(enLinea);

  useEffect(() => {
    if (!antes.current && enLinea) {
      setVolvio(true);
      const t = setTimeout(() => setVolvio(false), 3500);
      return () => clearTimeout(t);
    }
    antes.current = enLinea;
  }, [enLinea]);
  useEffect(() => {
    antes.current = enLinea;
  });

  return (
    <AnimatePresence initial={false}>
      {(!enLinea || volvio) && (
        <motion.div
          key={enLinea ? "volvio" : "sin"}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          role="status"
          className={
            enLinea
              ? "flex items-center justify-center gap-2 bg-exito px-4 py-1.5 text-xs font-medium text-white"
              : "flex items-center justify-center gap-2 bg-[color-mix(in_oklab,var(--aviso)_92%,black)] px-4 py-1.5 text-xs font-medium text-white"
          }
        >
          {enLinea ? (
            <>
              <Wifi className="size-3.5" /> Conexión restablecida · todo al día
            </>
          ) : (
            <>
              <CloudOff className="size-3.5" /> Sin conexión a internet · ves lo último guardado en este equipo; los cambios se podrán hacer cuando vuelva
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
