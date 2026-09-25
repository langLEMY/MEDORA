/**
 * Puente con el launcher de Windows (WebView2). El launcher expone
 * window.chrome.webview; en un navegador normal (npm run dev) todo esto es
 * no-op y la app funciona igual.
 *
 * App → launcher:  { tipo: "info" | "buscar-actualizacion" | "instalar-actualizacion" | "imprimir" }
 * Launcher → app:  { tipo: "info", version } | { tipo: "actualizacion", version, notas }
 *                  | { tipo: "sin-actualizacion" } | { tipo: "progreso", porcentaje }
 *                  | { tipo: "error-actualizacion", mensaje }
 * Ver launcher/FormPrincipal.cs.
 */
export type MensajeLauncher =
  | { tipo: "info"; version: string }
  | { tipo: "actualizacion"; version: string; notas?: string }
  | { tipo: "sin-actualizacion" }
  | { tipo: "progreso"; porcentaje: number }
  | { tipo: "error-actualizacion"; mensaje: string };

type Manejador = (e: { data: unknown }) => void;
interface WebView {
  postMessage(m: unknown): void;
  addEventListener(t: "message", f: Manejador): void;
  removeEventListener(t: "message", f: Manejador): void;
}

const webview = (window as unknown as { chrome?: { webview?: WebView } }).chrome?.webview;

export const enEscritorio = !!webview;

export function enviar(tipo: "info" | "buscar-actualizacion" | "instalar-actualizacion" | "imprimir" | "pdf", extra?: Record<string, unknown>) {
  webview?.postMessage(JSON.stringify({ tipo, ...extra }));
}

export function escuchar(f: (m: MensajeLauncher) => void) {
  if (!webview) return () => {};
  const h: Manejador = (e) => {
    let d = e.data;
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {
        return;
      }
    }
    if (d && typeof d === "object" && "tipo" in d) f(d as MensajeLauncher);
  };
  webview.addEventListener("message", h);
  return () => webview.removeEventListener("message", h);
}

/** En escritorio abre el selector de impresora nativo; en navegador, window.print(). */
export function imprimir() {
  if (webview) enviar("imprimir");
  else window.print();
}

/**
 * Exporta el documento abierto a PDF. En escritorio el launcher pregunta dónde
 * guardarlo (CoreWebView2.PrintToPdfAsync); en navegador se usa el diálogo de
 * impresión, con "Guardar como PDF".
 */
export function exportarPdf(nombre: string) {
  const limpio = nombre.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
  if (webview) enviar("pdf", { nombre: limpio });
  else {
    const anterior = document.title;
    document.title = limpio;
    window.print();
    document.title = anterior;
  }
}
