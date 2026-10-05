import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor } from "@/components/ui/campos";
import { Insignia, Tarjeta } from "@/components/ui/superficies";
import { datos, invocar, mensajeError, supabase } from "@/lib/supabase";
import { useSistema } from "@/sesion/SesionProvider";

interface EstadoIa {
  activa: boolean;
  configurada: boolean;
  usado_usd?: number;
  tope_usd?: number;
}

const usd = (n: number | undefined) => `US$${(n ?? 0).toFixed(2)}`;

/**
 * Inteligencia artificial del hospital (solo superadmin, en "Sistema y sedes"). La paga
 * MEDORA: se activa por hospital con un tope mensual en dólares (lo que cobra el proveedor).
 */
export function AjustesIa() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const sistema = useQuery({
    queryKey: ["sistema-ia", sistemaId],
    queryFn: async () => datos(await supabase.from("sistemas").select("ia_activa, ia_tope_mensual_usd").eq("id", sistemaId).single()),
  });
  const estado = useQuery({
    queryKey: ["ia-estado", sistemaId],
    queryFn: () => invocar<EstadoIa>("ia", { accion: "estado", sistema_id: sistemaId }),
  });
  const [activa, setActiva] = useState(false);
  const [tope, setTope] = useState("20");
  useEffect(() => {
    if (sistema.data) {
      setActiva(sistema.data.ia_activa);
      setTope(String(sistema.data.ia_tope_mensual_usd));
    }
  }, [sistema.data]);

  const guardar = useMutation({
    mutationFn: async () => {
      const valor = Number(tope);
      if (!Number.isFinite(valor) || valor < 0) throw new Error("El tope debe ser un monto válido.");
      const { error } = await supabase.from("sistemas").update({ ia_activa: activa, ia_tope_mensual_usd: valor }).eq("id", sistemaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Ajustes de IA guardados");
      await qc.invalidateQueries({ queryKey: ["sistema-ia", sistemaId] });
      await qc.invalidateQueries({ queryKey: ["ia-estado", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const probar = useMutation({
    mutationFn: () => invocar<{ saludo: string }>("ia", { accion: "probar", sistema_id: sistemaId }),
    onSuccess: async (r) => {
      toast.success("La IA respondió", { description: r.saludo });
      await qc.invalidateQueries({ queryKey: ["ia-estado", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const e = estado.data;
  const cambiado = !!sistema.data && (activa !== sistema.data.ia_activa || Number(tope) !== Number(sistema.data.ia_tope_mensual_usd));

  return (
    <Tarjeta className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-marca-suave text-marca">
          <Sparkles className="size-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-[0.9375rem] font-semibold">Inteligencia artificial</h2>
          <p className="text-xs text-texto-3">Importar cualquier Excel, preguntas y avisos del cierre. La IA propone; el personal confirma.</p>
        </div>
        {e && (
          <Insignia tono={!e.configurada ? "neutro" : e.activa ? "exito" : "neutro"} punto>
            {!e.configurada ? "Sin clave en el servidor" : e.activa ? "Activa" : "Apagada"}
          </Insignia>
        )}
      </div>
      <div className="space-y-4">
        <Interruptor activo={activa} onChange={setActiva} etiqueta="Activar la IA para este hospital" />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Tope mensual (US$)" type="number" min={0} step="1" value={tope} onChange={(ev) => setTope(ev.target.value)} />
          <div className="self-end pb-2 text-xs text-texto-3">
            {e?.tope_usd != null ? `Usado este mes: ${usd(e.usado_usd)} de ${usd(e.tope_usd)}` : "Lo cobra el proveedor de IA a MEDORA."}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" cargando={probar.isPending} disabled={!sistema.data?.ia_activa || !e?.configurada} onClick={() => probar.mutate()}>
            Probar conexión
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!cambiado} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}
