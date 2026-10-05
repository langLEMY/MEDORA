import { useEffect, useRef } from "react";

/**
 * Atajos de teclado de una pantalla. Claves: "F2", "F9", "Escape", "Mod+Enter"
 * (Mod = Ctrl o ⌘). Las teclas de función funcionan aunque el foco esté en un campo
 * (son las que usa la caja sin soltar el teclado); las letras solas no se disparan
 * mientras se escribe.
 */
export function useAtajos(mapa: Record<string, (e: KeyboardEvent) => void>, activo = true) {
  const ref = useRef(mapa);
  ref.current = mapa;

  useEffect(() => {
    if (!activo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const clave = `${e.ctrlKey || e.metaKey ? "Mod+" : ""}${e.altKey ? "Alt+" : ""}${e.key}`;
      const accion = ref.current[clave];
      if (!accion) return;
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      const especial = /^F\d{1,2}$/.test(e.key) || clave.startsWith("Mod+") || clave.startsWith("Alt+");
      if (escribiendo && !especial) return;
      e.preventDefault();
      accion(e);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [activo]);
}

/** Enfoca (o pulsa) el primer elemento marcado con data-atajo="<nombre>". */
export function irA(nombre: string, accion: "enfocar" | "pulsar" = "enfocar") {
  const raiz = document.querySelector<HTMLElement>(`[data-atajo="${nombre}"]`);
  if (!raiz) return;
  if (accion === "pulsar") (raiz.matches("button") ? raiz : raiz.querySelector<HTMLElement>("button"))?.click();
  else (raiz.matches("input,select,textarea") ? raiz : raiz.querySelector<HTMLElement>("input,select,textarea"))?.focus();
}
