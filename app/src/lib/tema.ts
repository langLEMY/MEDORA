export type Tema = "claro" | "oscuro" | "sistema";

const CLAVE = "medora.tema";

export function temaGuardado(): Tema {
  try {
    return (localStorage.getItem(CLAVE) as Tema) || "sistema";
  } catch {
    return "sistema";
  }
}

export function aplicarTema(tema: Tema) {
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    /* almacenamiento no disponible */
  }
  const oscuro = tema === "oscuro" || (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = oscuro ? "oscuro" : "claro";
}

/**
 * Cambio de tema pulido: un único fundido de toda la pantalla (View Transitions,
 * solo opacidad) en vez de que cada botón/tarjeta anime su color a destiempo con
 * su propio `transition-colors`. Durante el cambio se apagan esas transiciones.
 * Sin soporte o con "reducir movimiento" el cambio es instantáneo y limpio.
 */
export function cambiarTemaAnimado(tema: Tema) {
  const raiz = document.documentElement;
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  raiz.classList.add("cambiando-tema");
  const terminar = () => requestAnimationFrame(() => raiz.classList.remove("cambiando-tema"));
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || reducir) {
    aplicarTema(tema);
    terminar();
    return;
  }
  doc.startViewTransition(() => aplicarTema(tema)).finished.finally(terminar);
}

/** Cada sistema hospitalario tiñe la interfaz con su color de marca. */
export function aplicarColorMarca(color?: string | null) {
  document.documentElement.style.setProperty(
    "--marca",
    color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#0f766e",
  );
}
