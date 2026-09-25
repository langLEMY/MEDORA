import { AlertTriangle, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Boton } from "./ui/boton";

/** Pantalla amable si una página falla al renderizar (en vez del error técnico del router). */
export function ErrorRuta() {
  const error = useRouteError();
  const detalle = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  return (
    <div className="grid h-full place-items-center bg-fondo p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-superficie-2 text-aviso">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Algo salió mal en esta pantalla</h1>
        <p className="mt-1.5 text-sm text-texto-2">Tus datos están a salvo. Vuelve a intentarlo; si se repite, comparte este detalle con soporte:</p>
        <p className="mt-3 rounded-lg bg-superficie-2 px-3 py-2 font-mono text-xs text-texto-3">{detalle}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Boton variante="secundario" onClick={() => (location.hash = "#/")}>
            Ir al inicio
          </Boton>
          <Boton icono={<RotateCcw className="size-4" />} onClick={() => location.reload()}>
            Recargar
          </Boton>
        </div>
      </div>
    </div>
  );
}
