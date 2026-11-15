import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pill } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Tarjeta } from "@/components/ui/superficies";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { useSistema } from "@/sesion/SesionProvider";

export const VIAS = ["Oral", "IV", "IM", "SC", "Sublingual", "Inhalada", "Tópica", "Rectal", "Oftálmica", "Ótica", "Nasal", "Transdérmica"] as const;
export type Pauta = "horario" | "unica" | "si_necesario";
export const ETIQUETA_PAUTA: Record<Pauta, string> = { horario: "Horario fijo", unica: "Dosis única", si_necesario: "Si es necesario" };

/** "2026-11-14T08:00" en hora local para <input type="datetime-local">. */
function ahoraLocal() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * El médico indica un medicamento para el Kardex: con horario fijo (cada N horas),
 * dosis única o "si es necesario". Se liga sola a la admisión abierta del paciente.
 * No se edita: se suspende y se indica otra.
 */
export function NuevaIndicacion({ abierto, pacienteId, onCerrar }: { abierto: boolean; pacienteId: string | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [medicamento, setMedicamento] = useState("");
  const [dosis, setDosis] = useState("");
  const [via, setVia] = useState<string>("Oral");
  const [pauta, setPauta] = useState<Pauta>("horario");
  const [frecuencia, setFrecuencia] = useState("8");
  const [primera, setPrimera] = useState(ahoraLocal);
  const [dias, setDias] = useState("");
  const [obs, setObs] = useState("");

  const limpiar = () => {
    setMedicamento("");
    setDosis("");
    setVia("Oral");
    setPauta("horario");
    setFrecuencia("8");
    setPrimera(ahoraLocal());
    setDias("");
    setObs("");
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("indicar_medicamento", {
        p_sistema: sistemaId,
        p_paciente: pacienteId!,
        p_medicamento: medicamento.trim(),
        p_dosis: dosis.trim(),
        p_via: via,
        p_pauta: pauta,
        p_frecuencia_horas: pauta === "horario" ? Number(frecuencia) : undefined,
        p_primera_dosis: new Date(primera).toISOString(),
        p_dias: pauta === "horario" && dias ? Number(dias) : undefined,
        p_observaciones: obs.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medicamento indicado: ya aparece en el Kardex");
      void qc.invalidateQueries({ queryKey: ["kardex", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, pacienteId] });
      limpiar();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const frecuenciaValida = pauta !== "horario" || (Number(frecuencia) >= 1 && Number(frecuencia) <= 168);
  const valido = !!pacienteId && medicamento.trim().length >= 2 && dosis.trim() && frecuenciaValida && !!primera;

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Indicación de medicamento"
      descripcion="Aparece en el Kardex de enfermería con su horario. No se edita: si cambia, se suspende y se indica otra."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            Indicar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Entrada etiqueta="Medicamento" contenedor="sm:col-span-2" placeholder="Ceftriaxona" value={medicamento} onChange={(e) => setMedicamento(e.target.value)} />
          <Entrada etiqueta="Dosis" placeholder="1 g" value={dosis} onChange={(e) => setDosis(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector etiqueta="Vía" value={via} onChange={(e) => setVia(e.target.value)}>
            {VIAS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Selector>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[0.8125rem] font-medium text-texto-2">Pauta</p>
            <Segmentado id="pauta" valor={pauta} onChange={setPauta} opciones={(Object.keys(ETIQUETA_PAUTA) as Pauta[]).map((p) => ({ valor: p, etiqueta: ETIQUETA_PAUTA[p] }))} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {pauta === "horario" && (
            <Selector etiqueta="Cada" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)}>
              {[2, 4, 6, 8, 12, 24, 48, 72].map((h) => (
                <option key={h} value={h}>
                  {h} horas
                </option>
              ))}
            </Selector>
          )}
          {pauta !== "si_necesario" && (
            <Entrada etiqueta={pauta === "unica" ? "Hora de la dosis" : "Primera dosis"} type="datetime-local" value={primera} onChange={(e) => setPrimera(e.target.value)} />
          )}
          {pauta === "horario" && <Entrada etiqueta="Durante (días)" type="number" min={1} max={90} placeholder="Hasta suspender" value={dias} onChange={(e) => setDias(e.target.value)} />}
        </div>
        <AreaTexto
          etiqueta="Observaciones (opcional)"
          className="min-h-14"
          placeholder={pauta === "si_necesario" ? "Si fiebre mayor de 38 °C, máximo cada 6 horas…" : "Diluir en 100 ml de SSN, pasar en 30 minutos…"}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
      </div>
    </Modal>
  );
}

interface IndicacionActiva {
  id: string;
  medicamento: string;
  dosis: string;
  via: string;
  pauta: Pauta;
  frecuencia_horas: number | null;
}

/**
 * Medicamentos activos del Kardex en el expediente: el médico los ve y los suspende
 * aquí (Enfermería es de enfermería). Sin indicaciones activas no se muestra nada.
 */
export function IndicacionesActivas({ pacienteId }: { pacienteId: string }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [suspender, setSuspender] = useState<IndicacionActiva | null>(null);
  const [motivo, setMotivo] = useState("");
  const q = useQuery({
    queryKey: ["kardex", sistemaId, "activas", pacienteId],
    queryFn: async () =>
      (datos(
        await supabase
          .from("indicaciones_medicamento")
          .select("id, medicamento, dosis, via, pauta, frecuencia_horas")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", pacienteId)
          .eq("estado", "activa")
          .order("creado_en"),
      ) ?? []) as IndicacionActiva[],
  });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("suspender_indicacion", { p_indicacion: suspender!.id, p_motivo: motivo.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Indicación suspendida: sus próximas dosis ya no aparecen");
      void qc.invalidateQueries({ queryKey: ["kardex", sistemaId] });
      setMotivo("");
      setSuspender(null);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  if (!q.data?.length) return null;
  return (
    <Tarjeta className="mb-4 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-texto-2">
        <Pill className="size-3.5" /> Medicamentos activos en el Kardex
      </p>
      <ul className="divide-y divide-borde">
        {q.data.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              <b>{i.medicamento}</b> {i.dosis} · {i.via} · <span className="text-texto-3">{i.pauta === "horario" ? `cada ${i.frecuencia_horas} h` : ETIQUETA_PAUTA[i.pauta]}</span>
            </span>
            <Boton variante="fantasma" tamano="sm" onClick={() => setSuspender(i)}>
              Suspender
            </Boton>
          </li>
        ))}
      </ul>
      <Modal
        abierto={!!suspender}
        onCerrar={() => setSuspender(null)}
        titulo="Suspender indicación"
        descripcion={suspender ? `${suspender.medicamento} ${suspender.dosis}` : ""}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setSuspender(null)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" cargando={m.isPending} disabled={!motivo.trim()} onClick={() => m.mutate()}>
              Suspender
            </Boton>
          </>
        }
      >
        <Entrada etiqueta="Motivo" placeholder="Cambio a vía oral, alergia, alta…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Modal>
    </Tarjeta>
  );
}