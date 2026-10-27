import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { Segmentado } from "@/components/ui/campos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

interface Habitacion { id: string; nombre: string; tipo: string | null; activa: boolean }
interface Cama { id: string; habitacion_id: string; codigo: string; estado: "libre" | "ocupada" | "mantenimiento" }
interface Admision { id: string; cama_id: string; paciente_id: string; medico_nombre: string | null; motivo: string | null; ingreso_en: string }

export default function Internamiento() {
  const [vista, setVista] = useState<"admisiones" | "camas">("admisiones");
  return (
    <>
      <EncabezadoPagina
        titulo="Internamiento"
        acciones={
          <Segmentado
            id="int-vista"
            valor={vista}
            onChange={setVista}
            opciones={[
              { valor: "admisiones", etiqueta: "Ingresados" },
              { valor: "camas", etiqueta: "Camas" },
            ]}
          />
        }
      />
      {vista === "admisiones" ? <Admisiones /> : <Camas />}
    </>
  );
}

// ---------------------------------------------------------------------------
function Admisiones() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);

  const q = useQuery({
    queryKey: ["admisiones", sistemaId],
    queryFn: async () => (datos(await supabase.from("admisiones").select("id, cama_id, paciente_id, medico_nombre, motivo, ingreso_en").eq("sistema_id", sistemaId).eq("estado", "ingresado").order("ingreso_en", { ascending: false })) ?? []) as Admision[],
  });
  const camas = useQuery({
    queryKey: ["camas-map", sistemaId],
    queryFn: async () => {
      const d = (datos(await supabase.from("camas").select("id, codigo").eq("sistema_id", sistemaId)) ?? []) as { id: string; codigo: string }[];
      return new Map(d.map((c) => [c.id, c.codigo]));
    },
  });
  const ids = [...new Set((q.data ?? []).map((a) => a.paciente_id))];
  const pacientes = useQuery({
    queryKey: ["admisiones-pac", sistemaId, ids.length],
    enabled: ids.length > 0,
    queryFn: async () => {
      const d = (datos(await supabase.from("pacientes").select("id, nombres, apellidos").in("id", ids)) ?? []) as { id: string; nombres: string; apellidos: string }[];
      return new Map(d.map((p) => [p.id, `${p.nombres} ${p.apellidos}`.trim()]));
    },
  });

  const egreso = useMutation({
    mutationFn: async (id: string) => datos(await supabase.rpc("dar_egreso", { p_admision: id })),
    onSuccess: () => {
      toast.success("Egreso registrado · cama liberada");
      void qc.invalidateQueries({ queryKey: ["admisiones", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["camas", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Boton icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>Nueva admisión</Boton>
      </div>
      <Tarjeta className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-12 rounded-xl" />)}</div>
        ) : !q.data?.length ? (
          <Vacio icono={<BedDouble />} titulo="Sin pacientes ingresados" descripcion="Registra una admisión cuando ingrese un paciente." />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-marca-suave text-marca">
                  <BedDouble className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{pacientes.data?.get(a.paciente_id) ?? "…"}</span>
                  <span className="block truncate text-xs text-texto-3">
                    Cama {camas.data?.get(a.cama_id) ?? "—"} · desde {relativo(a.ingreso_en)}{a.motivo ? ` · ${a.motivo}` : ""}
                  </span>
                </span>
                <Boton tamano="sm" variante="secundario" cargando={egreso.isPending} onClick={() => egreso.mutate(a.id)}>
                  Dar egreso
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <NuevaAdmision abierto={nueva} onCerrar={() => setNueva(false)} />
    </div>
  );
}

function NuevaAdmision({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [cama, setCama] = useState("");
  const [medico, setMedico] = useState("");
  const [motivo, setMotivo] = useState("");

  const libres = useQuery({
    queryKey: ["camas-libres", sistemaId],
    enabled: abierto,
    queryFn: async () => (datos(await supabase.from("camas").select("id, codigo").eq("sistema_id", sistemaId).eq("estado", "libre").order("codigo")) ?? []) as { id: string; codigo: string }[],
  });

  const admitir = useMutation({
    mutationFn: async () => datos(await supabase.rpc("admitir_paciente", { p_sistema: sistemaId, p_cama: cama, p_paciente: paciente!.id, p_medico: medico || undefined, p_motivo: motivo || undefined })),
    onSuccess: () => {
      toast.success("Paciente admitido");
      setPaciente(null); setCama(""); setMedico(""); setMotivo("");
      void qc.invalidateQueries({ queryKey: ["admisiones", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["camas", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva admisión"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton cargando={admitir.isPending} disabled={!paciente || !cama} onClick={() => admitir.mutate()}>Admitir</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorPaciente valor={paciente} onChange={setPaciente} />
        <Selector etiqueta="Cama" value={cama} onChange={(e) => setCama(e.target.value)}>
          <option value="">{libres.data?.length ? "Selecciona una cama libre…" : "No hay camas libres"}</option>
          {(libres.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
        </Selector>
        <Entrada etiqueta="Médico tratante (opcional)" value={medico} onChange={(e) => setMedico(e.target.value)} />
        <Entrada etiqueta="Motivo del ingreso (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
const ESTADO_CAMA: Record<string, { etiqueta: string; tono: "exito" | "peligro" | "aviso" }> = {
  libre: { etiqueta: "Libre", tono: "exito" },
  ocupada: { etiqueta: "Ocupada", tono: "peligro" },
  mantenimiento: { etiqueta: "Mantenimiento", tono: "aviso" },
};

function Camas() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [nuevaHab, setNuevaHab] = useState(false);
  const [nuevaCama, setNuevaCama] = useState(false);
  const [hab, setHab] = useState({ nombre: "", tipo: "" });
  const [camaF, setCamaF] = useState({ habitacion_id: "", codigo: "" });

  const habs = useQuery({
    queryKey: ["habitaciones", sistemaId],
    queryFn: async () => (datos(await supabase.from("habitaciones").select("id, nombre, tipo, activa").eq("sistema_id", sistemaId).order("nombre")) ?? []) as Habitacion[],
  });
  const camas = useQuery({
    queryKey: ["camas", sistemaId],
    queryFn: async () => (datos(await supabase.from("camas").select("id, habitacion_id, codigo, estado").eq("sistema_id", sistemaId).order("codigo")) ?? []) as Cama[],
  });

  const crearHab = useMutation({
    mutationFn: async () => datos(await supabase.from("habitaciones").insert({ sistema_id: sistemaId, nombre: hab.nombre.trim(), tipo: hab.tipo || null })),
    onSuccess: () => { toast.success("Habitación creada"); setHab({ nombre: "", tipo: "" }); setNuevaHab(false); void qc.invalidateQueries({ queryKey: ["habitaciones", sistemaId] }); },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const crearCama = useMutation({
    mutationFn: async () => datos(await supabase.from("camas").insert({ sistema_id: sistemaId, habitacion_id: camaF.habitacion_id, codigo: camaF.codigo.trim() })),
    onSuccess: () => { toast.success("Cama creada"); setCamaF({ habitacion_id: "", codigo: "" }); setNuevaCama(false); void qc.invalidateQueries({ queryKey: ["camas", sistemaId] }); },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" icono={<Plus className="size-4" />} onClick={() => setNuevaHab(true)}>Habitación</Boton>
        <Boton icono={<Plus className="size-4" />} disabled={!habs.data?.length} onClick={() => setNuevaCama(true)}>Cama</Boton>
      </div>
      {habs.isLoading ? (
        <Esqueleto className="h-40 rounded-2xl" />
      ) : !habs.data?.length ? (
        <Tarjeta className="p-0"><Vacio icono={<BedDouble />} titulo="Sin habitaciones" descripcion="Crea las habitaciones y sus camas." /></Tarjeta>
      ) : (
        <div className="space-y-4">
          {habs.data.map((h) => (
            <Tarjeta key={h.id} className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <p className="font-semibold">{h.nombre}</p>
                {h.tipo && <span className="text-xs text-texto-3">{h.tipo}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {(camas.data ?? []).filter((c) => c.habitacion_id === h.id).map((c) => (
                  <span key={c.id} className="flex items-center gap-2 rounded-lg border border-borde px-3 py-1.5 text-sm">
                    <BedDouble className="size-4 text-texto-3" /> {c.codigo}
                    <Insignia tono={ESTADO_CAMA[c.estado].tono}>{ESTADO_CAMA[c.estado].etiqueta}</Insignia>
                  </span>
                ))}
                {!(camas.data ?? []).some((c) => c.habitacion_id === h.id) && <span className="text-xs text-texto-3">Sin camas todavía.</span>}
              </div>
            </Tarjeta>
          ))}
        </div>
      )}

      <Modal abierto={nuevaHab} onCerrar={() => setNuevaHab(false)} titulo="Nueva habitación"
        pie={<><Boton variante="secundario" onClick={() => setNuevaHab(false)}>Cancelar</Boton><Boton cargando={crearHab.isPending} disabled={hab.nombre.trim().length < 1} onClick={() => crearHab.mutate()}>Guardar</Boton></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Entrada etiqueta="Nombre / número" value={hab.nombre} onChange={(e) => setHab({ ...hab, nombre: e.target.value })} />
          <Entrada etiqueta="Tipo (individual, UCI…)" value={hab.tipo} onChange={(e) => setHab({ ...hab, tipo: e.target.value })} />
        </div>
      </Modal>

      <Modal abierto={nuevaCama} onCerrar={() => setNuevaCama(false)} titulo="Nueva cama"
        pie={<><Boton variante="secundario" onClick={() => setNuevaCama(false)}>Cancelar</Boton><Boton cargando={crearCama.isPending} disabled={!camaF.habitacion_id || !camaF.codigo.trim()} onClick={() => crearCama.mutate()}>Guardar</Boton></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Selector etiqueta="Habitación" contenedor="sm:col-span-2" value={camaF.habitacion_id} onChange={(e) => setCamaF({ ...camaF, habitacion_id: e.target.value })}>
            <option value="">Selecciona…</option>
            {(habs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
          </Selector>
          <Entrada etiqueta="Código de la cama" value={camaF.codigo} onChange={(e) => setCamaF({ ...camaF, codigo: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
