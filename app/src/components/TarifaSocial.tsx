import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandHeart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Insignia, type Tono } from "@/components/ui/superficies";
import { categoriaPorIngreso, DESCRIPCION_CATEGORIA, TARIFA_SOCIAL_DEFECTO, type Categoria } from "@/lib/fundacion";
import { puedeEscribir } from "@/lib/permisos";
import { mensajeError, supabase } from "@/lib/supabase";
import { fecha, moneda } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

export interface TarifaVigente {
  id: string;
  numero: string;
  categoria: Categoria;
  descuento_pct: number;
  vigente_hasta: string;
}

export const TONO_CATEGORIA: Record<Categoria, Tono> = { A: "neutro", B: "info", C: "aviso", D: "exito" };

/** Tarifa social vigente del paciente (solo en fundaciones y para quien ve los estudios). */
export function useTarifaPaciente(pacienteId?: string | null) {
  const { sistemaId, roles } = useSistema();
  const { naturaleza } = useSesion();
  return useQuery({
    queryKey: ["tarifa-social", sistemaId, pacienteId],
    enabled: !!pacienteId && naturaleza === "fundacion" && puedeEscribir.verEstudios(roles),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tarifa_social_paciente", { p_sistema: sistemaId, p_paciente: pacienteId! });
      if (error) throw error;
      const f = (data as unknown as TarifaVigente[] | null)?.[0];
      return f ? { ...f, descuento_pct: Number(f.descuento_pct) } : null;
    },
  });
}

/** Insignia + botón para el expediente del paciente. */
export function TarifaSocialPaciente({ pacienteId, nombre }: { pacienteId: string; nombre: string }) {
  const { roles } = useSistema();
  const { naturaleza } = useSesion();
  const t = useTarifaPaciente(pacienteId);
  const [abierto, setAbierto] = useState(false);
  if (naturaleza !== "fundacion" || !puedeEscribir.verEstudios(roles)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {t.data ? (
        <Insignia tono={TONO_CATEGORIA[t.data.categoria]}>
          <HandHeart className="size-3" /> Tarifa social {t.data.categoria} · {t.data.descuento_pct} % · hasta {fecha(t.data.vigente_hasta)}
        </Insignia>
      ) : (
        <span className="text-xs text-texto-3">{t.isLoading ? "" : "Sin estudio socioeconómico"}</span>
      )}
      {puedeEscribir.estudioSocial(roles) && (
        <Boton variante="fantasma" tamano="sm" icono={<HandHeart className="size-3.5" />} onClick={() => setAbierto(true)}>
          {t.data ? "Nuevo estudio" : "Estudio socioeconómico"}
        </Boton>
      )}
      <ModalEstudio abierto={abierto} onCerrar={() => setAbierto(false)} pacienteId={pacienteId} nombre={nombre} />
    </div>
  );
}

/** Estudio socioeconómico: ingreso del hogar ÷ personas → categoría A–D (la decide el servidor). */
export function ModalEstudio({ abierto, onCerrar, pacienteId, nombre }: { abierto: boolean; onCerrar: () => void; pacienteId: string; nombre: string }) {
  const { sistemaId, roles } = useSistema();
  const { tarifaSocial } = useSesion();
  const qc = useQueryClient();
  const t = tarifaSocial ?? TARIFA_SOCIAL_DEFECTO;
  const vacio = { ingreso: "", miembros: "1", vivienda: "", ocupacion: "", seguro: "", observaciones: "", categoria: "", motivo: "" };
  const [f, setF] = useState(vacio);
  const previa = f.ingreso !== "" ? categoriaPorIngreso(Number(f.ingreso), Number(f.miembros), t) : null;
  const ajustada = !!f.categoria && previa && f.categoria !== previa.categoria;
  const admin = roles.includes("admin");

  const guardar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("registrar_estudio_socioeconomico", {
        p_sistema: sistemaId,
        p_paciente: pacienteId,
        p_ingreso: Number(f.ingreso),
        p_miembros: Number(f.miembros),
        p_vivienda: f.vivienda || undefined,
        p_ocupacion: f.ocupacion.trim() || undefined,
        p_seguro: f.seguro === "" ? undefined : f.seguro === "si",
        p_observaciones: f.observaciones.trim() || undefined,
        p_categoria: ajustada ? f.categoria : undefined,
        p_motivo_ajuste: ajustada ? f.motivo.trim() : undefined,
      });
      if (error) throw error;
      return data as { numero: string; categoria: Categoria; descuento_pct: number };
    },
    onSuccess: (r) => {
      toast.success(`Estudio ${r.numero}: categoría ${r.categoria} (${r.descuento_pct} % de descuento)`);
      void qc.invalidateQueries({ queryKey: ["tarifa-social", sistemaId, pacienteId] });
      void qc.invalidateQueries({ queryKey: ["estudios", sistemaId] });
      setF(vacio);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const valido = f.ingreso !== "" && Number(f.ingreso) >= 0 && Number(f.miembros) >= 1 && (!ajustada || f.motivo.trim().length >= 5);
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Estudio socioeconómico"
      descripcion={`${nombre}. Define la tarifa social por ${t.vigencia_meses} meses.`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            Guardar estudio
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Ingreso mensual del hogar (RD$)" type="number" min={0} step="100" value={f.ingreso} onChange={(e) => setF({ ...f, ingreso: e.target.value })} />
          <Entrada etiqueta="Personas que viven de ese ingreso" type="number" min={1} max={30} value={f.miembros} onChange={(e) => setF({ ...f, miembros: e.target.value })} />
          <Selector etiqueta="Vivienda" value={f.vivienda} onChange={(e) => setF({ ...f, vivienda: e.target.value })}>
            <option value="">—</option>
            <option value="propia">Propia</option>
            <option value="alquilada">Alquilada</option>
            <option value="prestada">Prestada</option>
            <option value="otra">Otra</option>
          </Selector>
          <Selector etiqueta="¿Tiene seguro (ARS)?" value={f.seguro} onChange={(e) => setF({ ...f, seguro: e.target.value })}>
            <option value="">—</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </Selector>
          <Entrada etiqueta="Ocupación del sostén del hogar" contenedor="sm:col-span-2" placeholder="Chiripero, ama de casa, pensionado…" value={f.ocupacion} onChange={(e) => setF({ ...f, ocupacion: e.target.value })} />
        </div>

        {previa && (
          <div className="rounded-xl bg-marca-suave px-4 py-3 text-sm text-marca-texto">
            {moneda(previa.perCapita)} por persona → <b>categoría {previa.categoria}</b> ({DESCRIPCION_CATEGORIA[previa.categoria].toLowerCase()}): <b>{t.descuentos[previa.categoria]} % de descuento</b>.
          </div>
        )}

        {admin && previa && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Selector etiqueta="Ajustar categoría (administración)" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              <option value="">Usar la del estudio</option>
              {(["A", "B", "C", "D"] as Categoria[]).map((c) => (
                <option key={c} value={c}>
                  {c} · {t.descuentos[c]} %
                </option>
              ))}
            </Selector>
            {ajustada && <Entrada etiqueta="Motivo del ajuste" contenedor="sm:col-span-2" placeholder="Enfermedad crónica costosa, desempleo reciente…" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />}
          </div>
        )}
        <AreaTexto etiqueta="Observaciones (opcional)" className="min-h-14" value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
        <p className="text-xs text-texto-3">Queda guardado y auditado; no se edita. Si la situación cambia, se hace un estudio nuevo.</p>
      </div>
    </Modal>
  );
}
