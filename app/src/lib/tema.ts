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
 * Cambio de tema limpio (View Transitions). La pantalla vieja queda quieta debajo
 * y la nueva aparece encima con un fundido (index.css: ::view-transition-*): así
 * no hay el "valle" de brillo de dos capas desvaneciéndose a la vez, y ningún
 * botón anima su color a destiempo (sus transiciones se apagan durante el cambio).
 * `alCambiar` corre dentro de la captura para que React pinte el estado nuevo en
 * el mismo cuadro. Sin soporte, con movimiento reducido o si ya se ve igual, es
 * instantáneo.
 */
export function cambiarTemaAnimado(tema: Tema, alCambiar?: () => void) {
  const raiz = document.documentElement;
  const antes = raiz.dataset.tema;
  const cambiar = () => {
    aplicarTema(tema);
    alCambiar?.();
  };
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches || raiz.dataset.movimiento === "reducido";
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  // "Sistema" puede no cambiar nada visible (Windows ya estaba en ese modo).
  const destino = tema === "oscuro" || (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches) ? "oscuro" : "claro";
  if (!doc.startViewTransition || reducir || destino === antes) {
    cambiar();
    return;
  }
  raiz.classList.add("cambiando-tema");
  doc
    .startViewTransition(cambiar)
    .finished.finally(() => requestAnimationFrame(() => raiz.classList.remove("cambiando-tema")));
}

const MARCA_DEFECTO = "#0f766e";
const esHex = (c?: string | null): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);

// El color efectivo nace del hospital, pero cada usuario puede pisarlo con un
// acento propio (solo en su sesión). Guardamos ambos y recomputamos --marca.
let colorHospital: string | null = null;
let acentoUsuario: string | null = null;

function recomputarMarca() {
  const efectivo = esHex(acentoUsuario) ? acentoUsuario : esHex(colorHospital) ? colorHospital : MARCA_DEFECTO;
  document.documentElement.style.setProperty("--marca", efectivo);
}

/** Cada sistema hospitalario tiñe la interfaz con su color de marca. */
export function aplicarColorMarca(color?: string | null) {
  colorHospital = color ?? null;
  recomputarMarca();
}

/**
 * Acento personal: lo elige cada usuario en Personalización y pisa el color del
 * hospital solo para él. `"hospital"` (o vacío) vuelve al color del sistema.
 */
export function aplicarAcento(acento?: string | null) {
  acentoUsuario = esHex(acento) ? acento : null;
  recomputarMarca();
}
