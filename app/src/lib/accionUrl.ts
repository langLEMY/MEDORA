import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Acciones rápidas por URL (paleta Ctrl+K, widgets): "/caja?accion=cobro" abre el
 * cobro al llegar, también si ya estabas en esa pantalla. El parámetro se consume
 * (se quita de la URL) para que atrás/recargar no lo repita.
 */
export function useAccionUrl(acciones: Record<string, () => void>) {
  const [params, setParams] = useSearchParams();
  const actuales = useRef(acciones);
  actuales.current = acciones;
  const accion = params.get("accion");
  useEffect(() => {
    if (!accion) return;
    const siguiente = new URLSearchParams(params);
    siguiente.delete("accion");
    setParams(siguiente, { replace: true });
    actuales.current[accion]?.();
  }, [accion, params, setParams]);
}
