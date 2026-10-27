import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert, Tablets } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { fecha } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

interface ItemInv {
  id: string;
  nombre: string;
}
interface Controlado {
  id: string;
  fecha: string;
  item_nombre: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  receta: string | null;
  paciente_nombre: string | null;
  medico_nombre: string | null;
  responsable: string;
}
interface Lote {
  id: string;
  item_id: string;
  lote: string | null;
  vencimiento: string | null;
  cantidad: number;
}

export default function Farmacia() {
  const [vista, setVista] = useState<"controlados" | "lotes">("controlados");
  return (
    <>
      <EncabezadoPagina
        titulo="Farmacia"
        acciones={
          <Segmentado
            id="farmacia-vista"
            valor={vista}
            onChange={setVista}
            opciones={[
              { valor: "controlados", etiqueta: "Controlados (DNCD)" },
              { valor: "lotes", etiqueta: "Lotes y vencimientos" },
            ]}
          />
        }
      />
      {vista === "controlados" ? <Controlados /> : <Lotes />}
    </>
  );
}

function useItems() {
  const { sistemaId } = useSistema();
  return useQuery({
    queryKey: ["farmacia-items", sistemaId],
    queryFn: async () => (datos(await supabase.from("inventario_items").select("id, nombre").eq("sistema_id", sistemaId).order("nombre")) ?? []) as ItemInv[],
  });
}

// ---------------------------------------------------------------------------
function Controlados() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);
  const items = useItems();
  const [f, setF] = useState({ item_nombre: "", tipo: "salida" as "entrada" | "salida", cantidad: "", responsable: "", receta: "", paciente: "", medico: "" });

  const q = useQuery({
    queryKey: ["farmacia-controlados", sistemaId],
    queryFn: async () => (datos(await supabase.from("farmacia_controlados").select("id, fecha, item_nombre, tipo, cantidad, receta, paciente_nombre, medico_nombre, responsable").eq("sistema_id", sistemaId).order("creado_en", { ascending: false }).limit(200)) ?? []) as Controlado[],
  });

  const registrar = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_controlado", {
          p_sistema: sistemaId, p_item_nombre: f.item_nombre.trim(), p_tipo: f.tipo, p_cantidad: Number(f.cantidad), p_responsable: f.responsable.trim(),
          p_receta: f.receta || undefined, p_paciente: f.paciente || undefined, p_medico: f.medico || undefined,
        }),
      ),
    onSuccess: () => {
      toast.success("Movimiento registrado en el libro");
      setF({ item_nombre: "", tipo: "salida", cantidad: "", responsable: "", receta: "", paciente: "", medico: "" });
      setNuevo(false);
      void qc.invalidateQueries({ queryKey: ["farmacia-controlados", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const salidaSinReceta = f.tipo === "salida" && !f.receta.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-texto-3">
          <ShieldAlert className="size-4 text-aviso" /> Registro de psicotrópicos y estupefacientes (DNCD). No se puede editar ni borrar.
        </p>
        <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Registrar movimiento</Boton>
      </div>
      <Tarjeta className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10 rounded-xl" />)}</div>
        ) : !q.data?.length ? (
          <Vacio icono={<Tablets />} titulo="Libro vacío" descripcion="Registra la primera entrada o salida de un controlado." />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <Insignia tono={c.tipo === "entrada" ? "exito" : "aviso"}>{c.tipo === "entrada" ? "Entrada" : "Salida"}</Insignia>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.item_nombre} · {c.cantidad}</span>
                  <span className="block truncate text-xs text-texto-3">
                    {fecha(c.fecha)}{c.receta ? ` · receta ${c.receta}` : ""}{c.paciente_nombre ? ` · ${c.paciente_nombre}` : ""} · resp. {c.responsable}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Modal
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        titulo="Movimiento de controlados"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setNuevo(false)}>Cancelar</Boton>
            <Boton cargando={registrar.isPending} disabled={!f.item_nombre.trim() || !(Number(f.cantidad) > 0) || !f.responsable.trim() || salidaSinReceta} onClick={() => registrar.mutate()}>
              Registrar
            </Boton>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Selector etiqueta="Medicamento" contenedor="sm:col-span-2" value={f.item_nombre} onChange={(e) => setF({ ...f, item_nombre: e.target.value })}>
            <option value="">Selecciona o escribe abajo…</option>
            {(items.data ?? []).map((i) => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
          </Selector>
          <Entrada etiqueta="…o escribe el nombre" contenedor="sm:col-span-2" value={f.item_nombre} onChange={(e) => setF({ ...f, item_nombre: e.target.value })} />
          <Selector etiqueta="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as "entrada" | "salida" })}>
            <option value="salida">Salida (dispensación)</option>
            <option value="entrada">Entrada (recepción)</option>
          </Selector>
          <Entrada etiqueta="Cantidad" inputMode="decimal" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
          <Entrada etiqueta="Responsable (regente)" value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} />
          <Entrada etiqueta={f.tipo === "salida" ? "No. de receta (obligatorio)" : "No. de receta"} value={f.receta} onChange={(e) => setF({ ...f, receta: e.target.value })} error={salidaSinReceta ? "Una salida exige la receta." : undefined} />
          <Entrada etiqueta="Paciente (opcional)" value={f.paciente} onChange={(e) => setF({ ...f, paciente: e.target.value })} />
          <Entrada etiqueta="Médico (opcional)" value={f.medico} onChange={(e) => setF({ ...f, medico: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Lotes() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);
  const items = useItems();
  const [f, setF] = useState({ item_id: "", lote: "", vencimiento: "", cantidad: "" });

  const q = useQuery({
    queryKey: ["farmacia-lotes", sistemaId],
    queryFn: async () => (datos(await supabase.from("farmacia_lotes").select("id, item_id, lote, vencimiento, cantidad").eq("sistema_id", sistemaId).order("vencimiento", { ascending: true, nullsFirst: false })) ?? []) as Lote[],
  });
  const nombre = (id: string) => items.data?.find((i) => i.id === id)?.nombre ?? "—";

  const crear = useMutation({
    mutationFn: async () =>
      datos(await supabase.from("farmacia_lotes").insert({ sistema_id: sistemaId, item_id: f.item_id, lote: f.lote || null, vencimiento: f.vencimiento || null, cantidad: Number(f.cantidad) || 0 })),
    onSuccess: () => {
      toast.success("Lote agregado");
      setF({ item_id: "", lote: "", vencimiento: "", cantidad: "" });
      setNuevo(false);
      void qc.invalidateQueries({ queryKey: ["farmacia-lotes", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const estadoVenc = (v: string | null) => {
    if (!v) return null;
    const dias = Math.ceil((new Date(v).getTime() - Date.now()) / 864e5);
    if (dias < 0) return { etiqueta: "Vencido", tono: "peligro" as const };
    if (dias <= 60) return { etiqueta: `Vence en ${dias} d`, tono: "aviso" as const };
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Agregar lote</Boton>
      </div>
      <Tarjeta className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10 rounded-xl" />)}</div>
        ) : !q.data?.length ? (
          <Vacio icono={<Tablets />} titulo="Sin lotes" descripcion="Registra los lotes y vencimientos de tus medicamentos." />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data.map((l) => {
              const ev = estadoVenc(l.vencimiento);
              return (
                <li key={l.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nombre(l.item_id)}</span>
                    <span className="block truncate text-xs text-texto-3">
                      {l.lote ? `Lote ${l.lote}` : "Sin lote"}{l.vencimiento ? ` · vence ${fecha(l.vencimiento)}` : ""}
                    </span>
                  </span>
                  <span className="tabular text-texto-2">{l.cantidad}</span>
                  {ev && <Insignia tono={ev.tono}>{ev.etiqueta}</Insignia>}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <Modal
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        titulo="Nuevo lote"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setNuevo(false)}>Cancelar</Boton>
            <Boton cargando={crear.isPending} disabled={!f.item_id} onClick={() => crear.mutate()}>Guardar</Boton>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Selector etiqueta="Medicamento" contenedor="sm:col-span-2" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}>
            <option value="">Selecciona…</option>
            {(items.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </Selector>
          <Entrada etiqueta="Lote" value={f.lote} onChange={(e) => setF({ ...f, lote: e.target.value })} />
          <Entrada etiqueta="Vencimiento" type="date" value={f.vencimiento} onChange={(e) => setF({ ...f, vencimiento: e.target.value })} />
          <Entrada etiqueta="Cantidad" inputMode="decimal" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
