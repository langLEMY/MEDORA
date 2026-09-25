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

/** Cada sistema hospitalario tiñe la interfaz con su color de marca. */
export function aplicarColorMarca(color?: string | null) {
  document.documentElement.style.setProperty(
    "--marca",
    color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#0f766e",
  );
}
