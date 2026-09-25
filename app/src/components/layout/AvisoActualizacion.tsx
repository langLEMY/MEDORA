import { AnimatePresence, motion } from "motion/react";
import { Download, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { enviar, escuchar } from "@/lib/escritorio";
import { Boton } from "../ui/boton";

/**
 * Aviso de versión nueva. El launcher revisa GitHub Releases al arrancar y, si
 * hay algo, avisa por el puente de WebView2; la descarga (verificada con
 * SHA256) y la instalación las hace el launcher. Nunca bloquea: se puede
 * posponer y seguir trabajando.
 */
export function AvisoActualizacion() {
  const [version, setVersion] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);

  useEffect(
    () =>
      escuchar((m) => {
        if (m.tipo === "actualizacion") {
          setVersion(m.version);
          setOculto(false);
        }
        if (m.tipo === "progreso") setProgreso(m.porcentaje);
        if (m.tipo === "error-actualizacion") {
          setError(m.mensaje);
          setProgreso(null);
        }
      }),
    [],
  );

  const visible = !!version && !oculto;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
          className="no-imprimir fixed right-6 bottom-6 z-40 w-[340px] overflow-hidden rounded-2xl border border-borde bg-superficie shadow-lg"
        >
          <div className="flex gap-3 p-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca">
              <Sparkles className="size-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">MEDORA {version} está disponible</p>
              <p className="mt-0.5 text-[13px] text-texto-2">
                {error ?? (progreso !== null ? "Descargando y verificando…" : "Se instala en menos de un minuto.")}
              </p>
            </div>
            {progreso === null && (
              <button onClick={() => setOculto(true)} className="-mt-1 -mr-1 size-7 shrink-0 rounded-md text-texto-3 hover:bg-superficie-2">
                <X className="mx-auto size-4" />
              </button>
            )}
          </div>
          {progreso !== null ? (
            <div className="h-1 bg-superficie-2">
              <motion.div
                className="h-full bg-marca"
                animate={{ width: `${progreso}%` }}
                transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              />
            </div>
          ) : (
            <div className="flex justify-end gap-2 border-t border-borde bg-superficie-2/50 px-4 py-2.5">
              <Boton variante="fantasma" tamano="sm" onClick={() => setOculto(true)}>
                Más tarde
              </Boton>
              <Boton
                tamano="sm"
                icono={<Download className="size-3.5" />}
                onClick={() => {
                  setError(null);
                  setProgreso(0);
                  enviar("instalar-actualizacion");
                }}
              >
                Actualizar ahora
              </Boton>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
