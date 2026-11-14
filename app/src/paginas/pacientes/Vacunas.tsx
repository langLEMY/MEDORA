import { CalendarClock, Printer, Syringe } from "lucide-react";
import { useMemo, useState } from "react";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { puedeEscribir } from "@/lib/permisos";
import { fecha, isoDia } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { NuevaEntrada, useHistorial, type EntradaClinica } from "./HistorialClinico";

interface Dosis {
  id: string;
  vacuna: string;
  dosis: string;
  aplicada: string;
  lote: string;
  via: string;
  sitio: string;
  proxima: string;
  autor: string;
}

const dato = (e: EntradaClinica, k: string) => (typeof e.datos?.[k] === "string" ? (e.datos[k] as string) : "");

/** Carnet de vacunación: cada vacuna aplicada (historial tipo "vacuna") y las próximas dosis. */
export function Vacunas({ pacienteId, pacienteNombre, documento, fechaNacimiento }: { pacienteId: string; pacienteNombre: string; documento?: string | null; fechaNacimiento?: string | null }) {
  const { roles } = useSistema();
  const q = useHistorial(pacienteId);
  const [nueva, setNueva] = useState(false);
  const [imprimir, setImprimir] = useState(false);

  const dosis = useMemo<Dosis[]>(
    () =>
      (q.data ?? [])
        .filter((e) => e.tipo === "vacuna" && !e.corrige_a)
        .map((e) => ({
          id: e.id,
          vacuna: dato(e, "vacuna") || e.titulo || "Vacuna",
          dosis: dato(e, "dosis"),
          aplicada: dato(e, "fecha_aplicacion") || e.creado_en.slice(0, 10),
          lote: dato(e, "lote"),
          via: dato(e, "via"),
          sitio: dato(e, "sitio"),
          proxima: dato(e, "proxima_dosis"),
          autor: e.autor?.nombre_completo ?? "",
        }))
        .sort((a, b) => b.aplicada.localeCompare(a.aplicada)),
    [q.data],
  );

  // Próxima dosis pendiente: la más reciente de cada vacuna con fecha futura (o vencida sin aplicar).
  const hoy = isoDia(new Date());
  const proximas = useMemo(() => {
    const ultimaPorVacuna = new Map<string, Dosis>();
    for (const d of dosis) if (!ultimaPorVacuna.has(d.vacuna)) ultimaPorVacuna.set(d.vacuna, d);
    return [...ultimaPorVacuna.values()].filter((d) => d.proxima).sort((a, b) => a.proxima.localeCompare(b.proxima));
  }, [dosis]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-sm text-texto-2">
          {dosis.length ? `${dosis.length} ${dosis.length === 1 ? "dosis registrada" : "dosis registradas"}` : "Carnet de vacunación"}
        </p>
        <div className="ml-auto flex gap-2">
          <Boton variante="secundario" icono={<Printer className="size-4" />} disabled={!dosis.length} onClick={() => setImprimir(true)}>
            Imprimir carnet
          </Boton>
          {puedeEscribir.historial(roles) && (
            <Boton icono={<Syringe className="size-4" />} onClick={() => setNueva(true)}>
              Aplicar vacuna
            </Boton>
          )}
        </div>
      </div>

      {proximas.length > 0 && (
        <Tarjeta className="mb-4 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-marca" /> Próximas dosis
          </p>
          <ul className="flex flex-wrap gap-2">
            {proximas.map((d) => (
              <li key={d.id}>
                <Insignia tono={d.proxima < hoy ? "peligro" : "aviso"}>
                  {d.vacuna} · {fecha(d.proxima)}
                  {d.proxima < hoy && " (atrasada)"}
                </Insignia>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Tarjeta className="overflow-hidden">
        {q.isLoading ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10" />)}</div>
        ) : !dosis.length ? (
          <Vacio icono={<Syringe />} titulo="Sin vacunas registradas" descripcion="Cada vacuna aplicada aparece aquí con su lote, vía y próxima dosis." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs text-texto-3">
                  <th className="px-5 py-2.5 font-medium">Vacuna</th>
                  <th className="px-3 py-2.5 font-medium">Dosis</th>
                  <th className="px-3 py-2.5 font-medium">Aplicada</th>
                  <th className="px-3 py-2.5 font-medium">Lote</th>
                  <th className="px-3 py-2.5 font-medium">Vía / sitio</th>
                  <th className="px-3 py-2.5 font-medium">Próxima</th>
                  <th className="px-5 py-2.5 font-medium">Aplicó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {dosis.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3 font-medium">{d.vacuna}</td>
                    <td className="px-3 py-3 text-texto-2">{d.dosis || "—"}</td>
                    <td className="px-3 py-3 text-texto-2 tabular">{fecha(d.aplicada)}</td>
                    <td className="px-3 py-3 text-texto-2 tabular">{d.lote || "—"}</td>
                    <td className="px-3 py-3 text-texto-2">{[d.via, d.sitio].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-3 text-texto-2 tabular">{d.proxima ? fecha(d.proxima) : "—"}</td>
                    <td className="max-w-40 truncate px-5 py-3 text-texto-3">{d.autor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <NuevaEntrada abierto={nueva} inicial={{ tipo: "vacuna" }} pacienteId={pacienteId} onCerrar={() => setNueva(false)} />
      <Documento abierto={imprimir} onCerrar={() => setImprimir(false)} titulo="Carnet de vacunación" nombreArchivo={`Carnet de vacunación ${pacienteNombre}`}>
        <EncabezadoDocumento titulo="Carnet de vacunación" subtitulo={`${dosis.length} dosis`} />
        <p className="mb-4">
          <span className="text-[#475467]">Paciente:</span> <b>{pacienteNombre}</b>
          {documento && <span className="text-[#475467]"> · {documento}</span>}
          {fechaNacimiento && <span className="text-[#475467]"> · Nació el {fecha(fechaNacimiento)}</span>}
        </p>
        <TablaDocumento
          encabezados={["Vacuna", "Dosis", "Fecha", "Lote", "Vía", "Próxima"]}
          filas={[...dosis].reverse().map((d) => [d.vacuna, d.dosis || "—", fecha(d.aplicada), d.lote || "—", d.via || "—", d.proxima ? fecha(d.proxima) : "—"])}
        />
      </Documento>
    </>
  );
}
