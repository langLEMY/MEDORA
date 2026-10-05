import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, FileSpreadsheet, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Boton } from "@/components/ui/boton";
import { exportarExcel } from "@/lib/excel";
import { invocar, mensajeError } from "@/lib/supabase";
import { fecha, fechaHora, moneda, numero } from "@/lib/utils";

type Tipo = "texto" | "moneda" | "numero" | "fecha" | "fechaHora";
export interface RespuestaIa {
  titulo: string;
  resumen: string;
  columnas: { titulo: string; tipo: Tipo }[];
  filas: (string | number | null)[][];
  enlace?: string;
  aviso?: string;
}

/** ¿El hospital tiene la IA activa y configurada? (para mostrar la opción de preguntar). */
export function useIaDisponible(sistemaId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ["ia-estado", sistemaId],
    enabled: habilitado && !!sistemaId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => invocar<{ activa: boolean; configurada: boolean }>("ia", { accion: "estado", sistema_id: sistemaId }),
    select: (e) => e.activa && e.configurada,
  });
}

/** Palabras con las que suele empezar una pregunta: la opción de preguntar va primero. */
export const parecePregunta =(t: string) =>
  t.includes("?") || /^(cu[aá]nt[oa]s?|qui[eé]n(es)?|qu[eé]|cu[aá]l(es)?|c[oó]mo|d[oó]nde|lista|mu[eé]strame|dame|hay)\b/i.test(t.trim());

const formatear = (v: string | number | null, tipo: Tipo) => {
  if (v === null || v === "") return "—";
  if (tipo === "moneda") return moneda(Number(v));
  if (tipo === "numero") return numero(Number(v));
  if (tipo === "fecha") return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fecha(`${v}T12:00:00`) : String(v);
  if (tipo === "fechaHora") return fechaHora(String(v));
  return String(v);
};

/** Respuesta de "Pregúntale a MEDORA" dentro de la paleta (Ctrl+K). */
export function PreguntaMedora({ sistemaId, pregunta, onVolver, onIr }: { sistemaId: string; pregunta: string; onVolver: () => void; onIr: (ruta: string) => void }) {
  const m = useMutation({
    mutationFn: () => invocar<{ consulta: string; respuesta: RespuestaIa }>("ia", { accion: "preguntar", sistema_id: sistemaId, pregunta }),
  });
  useEffect(() => {
    m.mutate();
    // Una llamada por pregunta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pregunta]);

  const r = m.data?.respuesta;
  const derecha = (t: Tipo) => t === "moneda" || t === "numero";

  return (
    <div className="p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <button type="button" onClick={onVolver} title="Volver" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-texto-3 transition-colors hover:bg-superficie-2 hover:text-texto">
          <ArrowLeft className="size-4" />
        </button>
        <p className="min-w-0 flex-1 pt-1 text-sm text-texto-2">
          <Sparkles className="mr-1.5 inline size-3.5 -translate-y-px text-marca" />
          {pregunta}
        </p>
      </div>

      {m.isPending && (
        <div className="space-y-2.5 px-1 py-2" aria-live="polite">
          <span className="block h-5 w-2/3 animate-pulse rounded bg-superficie-2" />
          <span className="block h-4 w-1/2 animate-pulse rounded bg-superficie-2" />
          <span className="block h-24 w-full animate-pulse rounded-lg bg-superficie-2" />
        </div>
      )}

      {m.isError && <p className="rounded-xl bg-[color-mix(in_oklab,var(--peligro)_8%,var(--superficie))] px-4 py-3 text-sm text-peligro">{mensajeError(m.error)}</p>}

      {r && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          <p className="text-[0.9375rem] font-semibold">{r.titulo}</p>
          <p className="mt-1 text-sm text-texto-2">{r.resumen}</p>
          {r.filas.length > 0 && (
            <div className="mt-3 max-h-[40vh] overflow-auto rounded-xl border border-borde">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-superficie-2 text-xs text-texto-3">
                  <tr>
                    {r.columnas.map((c) => (
                      <th key={c.titulo} className={`px-3 py-2 font-medium ${derecha(c.tipo) ? "text-right" : "text-left"}`}>
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {r.filas.map((f, i) => (
                    <tr key={i}>
                      {f.map((v, j) => (
                        <td key={j} className={`px-3 py-2 ${derecha(r.columnas[j]?.tipo) ? "text-right tabular" : ""}`}>
                          {formatear(v, r.columnas[j]?.tipo ?? "texto")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.aviso && <p className="mt-2 text-xs text-texto-3">{r.aviso}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {r.filas.length > 0 && (
              <Boton
                variante="secundario"
                tamano="sm"
                icono={<FileSpreadsheet className="size-3.5" />}
                onClick={() =>
                  void exportarExcel(r.titulo, [
                    {
                      nombre: r.titulo.slice(0, 31),
                      columnas: r.columnas.map((c, j) => ({ titulo: c.titulo, valor: (f: (string | number | null)[]) => f[j] })),
                      filas: r.filas,
                    },
                  ])
                }
              >
                Excel
              </Boton>
            )}
            {r.enlace && (
              <Boton tamano="sm" icono={<ArrowUpRight className="size-3.5" />} onClick={() => onIr(r.enlace!)}>
                Abrir pantalla
              </Boton>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
