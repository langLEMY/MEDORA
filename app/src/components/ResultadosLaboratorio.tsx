import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FlaskConical, Inbox, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, fechaHora, patronBusqueda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Resultados de laboratorio recibidos por la integración (Edge Function "laboratorio").
 * En el expediente se ven los del paciente; en Pacientes, la bandeja de los que no
 * coincidieron con ninguna ficha para asignarlos.
 */
type Resultado = Fila<"resultados_laboratorio">;
interface Prueba {
  prueba?: string;
  valor?: string | number;
  unidad?: string;
  referencia?: string;
  bandera?: string;
}

const anormal = (b?: string) => !!b && !/^(normal|n)$/i.test(b.trim());

async function abrirPdf(ruta: string) {
  const { data, error } = await supabase.storage.from("anexos-clinicos").createSignedUrl(ruta, 120);
  if (error || !data) return toast.error("No se pudo abrir el PDF (puede requerir vista completa del expediente).");
  window.open(data.signedUrl, "_blank", "noopener");
}

function TarjetaResultado({ r, accion }: { r: Resultado; accion?: React.ReactNode }) {
  const pruebas = (r.resultados as unknown as Prueba[]) ?? [];
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-3">
        <FlaskConical className="size-4 text-texto-3" />
        <span className="font-medium">{r.laboratorio}</span>
        {r.orden && <span className="font-mono text-xs text-texto-3">Orden {r.orden}</span>}
        <span className="text-xs text-texto-3">{fechaHora(r.fecha_resultado ?? r.recibido_en)}</span>
        <span className="ml-auto flex items-center gap-2">
          {r.pdf_ruta && (
            <Boton tamano="sm" variante="secundario" icono={<FileText className="size-3.5" />} onClick={() => void abrirPdf(r.pdf_ruta!)}>
              PDF
            </Boton>
          )}
          {accion}
        </span>
      </div>
      {pruebas.length > 0 && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-borde">
            {pruebas.map((p, i) => (
              <tr key={i} className={cn(anormal(p.bandera) && "bg-[color-mix(in_oklab,var(--aviso)_8%,transparent)]")}>
                <td className="px-5 py-2">{p.prueba ?? "—"}</td>
                <td className="px-3 py-2 font-medium tabular">
                  {p.valor ?? "—"} {p.unidad && <span className="font-normal text-texto-3">{p.unidad}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-texto-3">{p.referencia}</td>
                <td className="px-5 py-2 text-right">{anormal(p.bandera) && <Insignia tono="aviso">{p.bandera}</Insignia>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.observaciones && <p className="border-t border-borde px-5 py-2.5 text-sm text-texto-2">{r.observaciones}</p>}
    </Tarjeta>
  );
}

export function ResultadosLaboratorio({ pacienteId }: { pacienteId: string }) {
  const { sistemaId } = useSistema();
  const q = useQuery({
    queryKey: ["laboratorio", sistemaId, pacienteId],
    queryFn: async () =>
      datos(
        await supabase
          .from("resultados_laboratorio")
          .select("*")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", pacienteId)
          .order("fecha_resultado", { ascending: false })
          .limit(50),
      ) ?? [],
  });
  if (q.isLoading) return <FilasEsqueleto />;
  if (!q.data?.length)
    return (
      <Tarjeta>
        <Vacio icono={<FlaskConical />} titulo="Sin resultados de laboratorio" descripcion="Llegan aquí cuando el laboratorio está conectado en Integraciones." />
      </Tarjeta>
    );
  return (
    <div className="space-y-3">
      {q.data.map((r) => (
        <TarjetaResultado key={r.id} r={r} />
      ))}
    </div>
  );
}

/** Bandeja: resultados que no coincidieron con ninguna ficha (por cédula o expediente). */
export function BandejaLaboratorio() {
  const { sistemaId } = useSistema();
  const [abierta, setAbierta] = useState(false);
  const [asignar, setAsignar] = useState<Resultado | null>(null);
  const q = useQuery({
    queryKey: ["laboratorio-bandeja", sistemaId],
    queryFn: async () =>
      datos(await supabase.from("resultados_laboratorio").select("*").eq("sistema_id", sistemaId).eq("estado", "recibido").order("recibido_en", { ascending: false }).limit(100)) ?? [],
  });
  const n = q.data?.length ?? 0;
  if (n === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="mb-4 flex w-full items-center gap-3 rounded-xl border border-borde bg-superficie px-4 py-3 text-left text-sm hover:bg-superficie-2"
      >
        <Inbox className="size-4 text-marca" />
        <span>
          <b>{n}</b> {n === 1 ? "resultado de laboratorio" : "resultados de laboratorio"} sin asignar a un paciente
        </span>
        <span className="ml-auto text-xs font-medium text-marca-texto">Revisar</span>
      </button>
      <Modal lateral abierto={abierta} onCerrar={() => setAbierta(false)} titulo="Resultados sin asignar" descripcion="No coincidieron con ninguna ficha por cédula ni expediente.">
        <div className="space-y-3">
          {q.data!.map((r) => (
            <div key={r.id}>
              <p className="mb-1.5 text-sm">
                <b>{r.nombre_paciente ?? "Sin nombre"}</b>
                {r.identificacion && <span className="ml-2 font-mono text-xs text-texto-3">{r.identificacion}</span>}
              </p>
              <TarjetaResultado
                r={r}
                accion={
                  <Boton tamano="sm" onClick={() => setAsignar(r)}>
                    Asignar
                  </Boton>
                }
              />
            </div>
          ))}
        </div>
      </Modal>
      <AsignarResultado resultado={asignar} onCerrar={() => setAsignar(null)} />
    </>
  );
}

function AsignarResultado({ resultado: r, onCerrar }: { resultado: Resultado | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [buscar, setBuscar] = useState("");
  const pacientes = useQuery({
    queryKey: ["laboratorio-buscar", sistemaId, buscar],
    enabled: !!r && buscar.trim().length >= 3,
    queryFn: async () =>
      datos(
        await supabase
          .from("pacientes")
          .select("id, nombres, apellidos, documento, expediente")
          .eq("sistema_id", sistemaId)
          .is("eliminado_en", null)
          .ilike("busqueda", patronBusqueda(buscar))
          .limit(8),
      ) ?? [],
  });
  const m = useMutation({
    mutationFn: async (pacienteId: string) => datos(await supabase.rpc("asignar_resultado_laboratorio", { p_resultado: r!.id, p_paciente: pacienteId })),
    onSuccess: () => {
      toast.success("Resultado asignado al expediente");
      void qc.invalidateQueries({ queryKey: ["laboratorio-bandeja", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["laboratorio", sistemaId] });
      setBuscar("");
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal abierto={!!r} onCerrar={onCerrar} ancho="sm" titulo="Asignar a un paciente" descripcion={r?.nombre_paciente ? `El laboratorio lo envió como: ${r.nombre_paciente}` : undefined}>
      <div className="space-y-3">
        <Entrada etiqueta="Buscar paciente" icono={<Search />} autoFocus placeholder="Nombre, cédula o expediente" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <ul className="divide-y divide-borde rounded-xl border border-borde">
          {(pacientes.data ?? []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={m.isPending}
                onClick={() => m.mutate(p.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-superficie-2"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.nombres} {p.apellidos}
                </span>
                <span className="font-mono text-xs text-texto-3">{p.documento ?? p.expediente}</span>
              </button>
            </li>
          ))}
          {buscar.trim().length >= 3 && pacientes.data?.length === 0 && <li className="px-3 py-2 text-sm text-texto-3">Sin coincidencias.</li>}
        </ul>
      </div>
    </Modal>
  );
}
