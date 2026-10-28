/**
 * ¿El equipo dibuja sin tarjeta gráfica? Pasa en escritorio remoto y máquinas virtuales
 * (el launcher apaga la GPU ahí porque WebView2 pintaba negro). Todo lo dibuja la CPU,
 * ~15 veces más trabajo por cuadro, y las animaciones se ven a saltos en PCs modestas:
 * ahí main.tsx apaga el movimiento (los cambios pasan al instante).
 */
let resultado: boolean | null = null;

export function dibujaSinGpu(): boolean {
  if (resultado !== null) return resultado;
  try {
    const lienzo = document.createElement("canvas");
    // failIfMajorPerformanceCaveat: sin contexto si el navegador solo puede darlo por software.
    const gl = lienzo.getContext("webgl", { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    if (!gl) return (resultado = true);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderizador = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return (resultado = /swiftshader|software|llvmpipe|basic render/i.test(renderizador));
  } catch {
    return (resultado = false);
  }
}
