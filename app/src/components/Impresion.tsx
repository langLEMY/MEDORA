import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { enEscritorio, enviar, escuchar } from "@/lib/escritorio";
import { Interruptor, Selector } from "./ui/campos";
import { Tarjeta } from "./ui/superficies";

interface Impresoras {
  lista: string[];
  predeterminada: string;
  recibos: string | null;
  tickets: string | null;
  preguntar: boolean;
}

/**
 * Impresoras de este equipo (solo en el programa de escritorio): la de recibos
 * y documentos, la de tickets del quiosco y si se imprime sin preguntar. Se
 * guarda en el launcher (impresion.json), no en la nube: cada equipo tiene las suyas.
 */
export function Impresion() {
  const [datos, setDatos] = useState<Impresoras | null>(null);

  useEffect(() => {
    if (!enEscritorio) return;
    const quitar = escuchar((m) => {
      if (m.tipo === "impresoras") setDatos(m);
    });
    enviar("impresoras");
    return quitar;
  }, []);

  if (!enEscritorio) return null;

  const guardar = (cambios: Partial<Pick<Impresoras, "recibos" | "tickets" | "preguntar">>) => {
    enviar("configurar-impresion", { ...cambios });
    toast.success("Impresión actualizada en este equipo");
  };

  return (
    <Tarjeta className="p-6">
      <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
        <Printer className="size-4 text-marca" /> Impresión en este equipo
      </h2>
      <p className="mb-4 text-xs text-texto-3">Cada computadora recuerda sus impresoras. Útil si la caja usa una térmica y la oficina una de hojas.</p>
      {!datos ? (
        <p className="text-sm text-texto-3">Buscando impresoras…</p>
      ) : !datos.lista.length ? (
        <p className="text-sm text-texto-3">Este equipo no tiene impresoras instaladas.</p>
      ) : (
        <div className="space-y-4">
          <Selector etiqueta="Recibos y documentos" value={datos.recibos ?? ""} onChange={(e) => guardar({ recibos: e.target.value || null })}>
            <option value="">Preguntar cada vez</option>
            {datos.lista.map((i) => (
              <option key={i} value={i}>
                {i}
                {i === datos.predeterminada ? " (predeterminada de Windows)" : ""}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Tickets del quiosco" value={datos.tickets ?? ""} onChange={(e) => guardar({ tickets: e.target.value || null })}>
            <option value="">La predeterminada de Windows ({datos.predeterminada})</option>
            {datos.lista.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Selector>
          <Interruptor
            activo={!datos.preguntar && !!datos.recibos}
            onChange={(v) => guardar({ preguntar: !v })}
            etiqueta={datos.recibos ? "Imprimir recibos sin preguntar" : "Elige primero la impresora de recibos para imprimir sin preguntar"}
          />
        </div>
      )}
    </Tarjeta>
  );
}
