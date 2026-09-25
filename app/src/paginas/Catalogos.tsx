import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pencil, Plus, ShieldCheck, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton, Spinner } from "@/components/ui/boton";
import { Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, useAseguradoras, useServicios } from "@/lib/consultas";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const CATEGORIAS = ["consulta", "procedimiento", "laboratorio", "imagen", "emergencia", "hospitalizacion", "farmacia", "otro"];

export default function Catalogos() {
  const [vista, setVista] = useState<"servicios" | "aseguradoras" | "coberturas">("servicios");
  return (
    <>
      <EncabezadoPagina titulo="Servicios y seguros" descripcion="Catálogo de precios, aseguradoras (ARS) y lo que cubre cada una." />
      <div className="mb-4">
        <Segmentado
          id="catalogos"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "servicios", etiqueta: "Servicios" },
            { valor: "aseguradoras", etiqueta: "Aseguradoras" },
            { valor: "coberturas", etiqueta: "Coberturas" },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {vista === "servicios" && <Servicios />}
          {vista === "aseguradoras" && <Aseguradoras />}
          {vista === "coberturas" && <Coberturas />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Servicios() {
  const { sistema, sistemaId } = useSistema();
  const q = useServicios(sistemaId);
  const [editar, setEditar] = useState<Fila<"servicios"> | "nuevo" | null>(null);
  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex justify-end border-b border-borde p-3">
        <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nuevo")}>
          Nuevo servicio
        </Boton>
      </div>
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<Tags />} titulo="Sin servicios" descripcion="Agrega consultas, procedimientos y estudios con su precio." />
      ) : (
        <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
          {q.data!.map((s) => (
            <motion.li key={s.id} variants={itemEscalonado} className={cn("group flex items-center gap-4 px-5 py-3 text-sm", !s.activo && "opacity-50")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.nombre}</span>
                <span className="block text-xs text-texto-3">
                  {[s.codigo, `${s.duracion_min} min`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Insignia className="capitalize">{s.categoria}</Insignia>
              <span className="w-32 text-right font-semibold tabular">{moneda(s.precio, sistema.moneda)}</span>
              <button onClick={() => setEditar(s)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto">
                <Pencil className="size-4" />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      <FormServicio item={editar} onCerrar={() => setEditar(null)} />
    </Tarjeta>
  );
}

function FormServicio({ item, onCerrar }: { item: Fila<"servicios"> | "nuevo" | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const e = item && item !== "nuevo" ? item : null;
  const [f, setF] = useState({ nombre: "", codigo: "", categoria: "consulta", precio: "0", duracion_min: "30", activo: true });
  useEffect(() => {
    if (item)
      setF(
        e
          ? { nombre: e.nombre, codigo: e.codigo ?? "", categoria: e.categoria, precio: String(e.precio), duracion_min: String(e.duracion_min), activo: e.activo }
          : { nombre: "", codigo: "", categoria: "consulta", precio: "0", duracion_min: "30", activo: true },
      );
  }, [item, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = { nombre: f.nombre.trim(), codigo: f.codigo.trim() || null, categoria: f.categoria, precio: Number(f.precio) || 0, duracion_min: Number(f.duracion_min) || 30, activo: f.activo };
      const r = e ? await supabase.from("servicios").update(fila).eq("id", e.id) : await supabase.from("servicios").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Servicio guardado");
      void qc.invalidateQueries({ queryKey: claves.servicios(sistemaId) });
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Modal
      abierto={!!item}
      onCerrar={onCerrar}
      titulo={e ? "Editar servicio" : "Nuevo servicio"}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={f.nombre.trim().length < 2} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Entrada etiqueta="Nombre" contenedor="col-span-2" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} />
        <Entrada etiqueta="Código" value={f.codigo} onChange={(x) => setF({ ...f, codigo: x.target.value })} />
        <Selector etiqueta="Categoría" value={f.categoria} onChange={(x) => setF({ ...f, categoria: x.target.value })}>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Precio" type="number" min={0} step="0.01" value={f.precio} onChange={(x) => setF({ ...f, precio: x.target.value })} />
        <Entrada etiqueta="Duración (min)" type="number" min={5} step={5} value={f.duracion_min} onChange={(x) => setF({ ...f, duracion_min: x.target.value })} />
        {e && <Interruptor activo={f.activo} onChange={(v) => setF({ ...f, activo: v })} etiqueta="Activo" />}
      </div>
    </Modal>
  );
}

function Aseguradoras() {
  const { sistemaId } = useSistema();
  const q = useAseguradoras(sistemaId);
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Fila<"aseguradoras"> | "nuevo" | null>(null);
  const [f, setF] = useState({ nombre: "", codigo: "", telefono: "", activo: true });
  const e = editar && editar !== "nuevo" ? editar : null;

  useEffect(() => {
    if (editar) setF(e ? { nombre: e.nombre, codigo: e.codigo ?? "", telefono: e.telefono ?? "", activo: e.activo } : { nombre: "", codigo: "", telefono: "", activo: true });
  }, [editar, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = { nombre: f.nombre.trim(), codigo: f.codigo.trim() || null, telefono: f.telefono.trim() || null, activo: f.activo };
      const r = e ? await supabase.from("aseguradoras").update(fila).eq("id", e.id) : await supabase.from("aseguradoras").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Aseguradora guardada");
      void qc.invalidateQueries({ queryKey: claves.aseguradoras(sistemaId) });
      setEditar(null);
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex justify-end border-b border-borde p-3">
        <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nuevo")}>
          Nueva aseguradora
        </Boton>
      </div>
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<ShieldCheck />} titulo="Sin aseguradoras" descripcion="Agrega las ARS con las que trabaja el sistema." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((a) => (
            <li key={a.id} className={cn("group flex items-center gap-4 px-5 py-3 text-sm", !a.activo && "opacity-50")}>
              <span className="grid size-8 place-items-center rounded-lg bg-marca-suave text-marca">
                <ShieldCheck className="size-4" />
              </span>
              <span className="flex-1 font-medium">{a.nombre}</span>
              <span className="text-texto-3">{a.telefono}</span>
              {!a.activo && <Insignia>Inactiva</Insignia>}
              <button onClick={() => setEditar(a)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto">
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        abierto={!!editar}
        onCerrar={() => setEditar(null)}
        ancho="sm"
        titulo={e ? "Editar aseguradora" : "Nueva aseguradora"}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setEditar(null)}>
              Cancelar
            </Boton>
            <Boton cargando={m.isPending} disabled={f.nombre.trim().length < 2} onClick={() => m.mutate()}>
              Guardar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <Entrada etiqueta="Nombre" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Entrada etiqueta="Código" value={f.codigo} onChange={(x) => setF({ ...f, codigo: x.target.value })} />
            <Entrada etiqueta="Teléfono" value={f.telefono} onChange={(x) => setF({ ...f, telefono: x.target.value })} />
          </div>
          {e && <Interruptor activo={f.activo} onChange={(v) => setF({ ...f, activo: v })} etiqueta="Activa" />}
        </div>
      </Modal>
    </Tarjeta>
  );
}

function Coberturas() {
  const { sistema, sistemaId } = useSistema();
  const aseguradoras = useAseguradoras(sistemaId);
  const servicios = useServicios(sistemaId);
  const [aseg, setAseg] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (!aseg && aseguradoras.data?.length) setAseg(aseguradoras.data[0].id);
  }, [aseguradoras.data, aseg]);

  const coberturas = useQuery({
    queryKey: ["coberturas", sistemaId, aseg],
    enabled: !!aseg,
    queryFn: async () => datos(await supabase.from("coberturas").select("id, servicio_id, monto_cubierto").eq("aseguradora_id", aseg)),
  });

  if ((aseguradoras.data?.length ?? 0) === 0 || (servicios.data?.length ?? 0) === 0)
    return (
      <Tarjeta>
        <Vacio icono={<ShieldCheck />} titulo="Primero registra servicios y aseguradoras" />
      </Tarjeta>
    );

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-borde p-3">
        <Selector value={aseg} onChange={(e) => setAseg(e.target.value)} contenedor="w-72">
          {aseguradoras.data!.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </Selector>
        <p className="text-xs text-texto-3">Monto que cubre la aseguradora por unidad. Se guarda al salir del campo.</p>
      </div>
      <ul className="divide-y divide-borde">
        {servicios.data!.filter((s) => s.activo).map((s) => (
          <FilaCobertura
            key={`${aseg}-${s.id}`}
            servicio={s}
            moneda_={sistema.moneda}
            actual={coberturas.data?.find((c) => c.servicio_id === s.id)}
            onGuardar={async (monto) => {
              const existente = coberturas.data?.find((c) => c.servicio_id === s.id);
              const r =
                monto === null
                  ? existente
                    ? await supabase.from("coberturas").delete().eq("id", existente.id)
                    : { error: null }
                  : existente
                    ? await supabase.from("coberturas").update({ monto_cubierto: monto }).eq("id", existente.id)
                    : await supabase.from("coberturas").insert({ sistema_id: sistemaId, aseguradora_id: aseg, servicio_id: s.id, monto_cubierto: monto });
              if (r.error) throw r.error;
              await qc.invalidateQueries({ queryKey: ["coberturas", sistemaId, aseg] });
            }}
          />
        ))}
      </ul>
    </Tarjeta>
  );
}

function FilaCobertura({
  servicio,
  actual,
  onGuardar,
  moneda_,
}: {
  servicio: Fila<"servicios">;
  actual?: { monto_cubierto: number };
  onGuardar: (monto: number | null) => Promise<void>;
  moneda_: string;
}) {
  const [valor, setValor] = useState(actual ? String(actual.monto_cubierto) : "");
  const [estado, setEstado] = useState<"quieto" | "guardando" | "ok">("quieto");
  useEffect(() => setValor(actual ? String(actual.monto_cubierto) : ""), [actual]);

  const guardar = async () => {
    const nuevo = valor.trim() === "" ? null : Number(valor);
    if (nuevo === (actual ? Number(actual.monto_cubierto) : null)) return;
    setEstado("guardando");
    try {
      await onGuardar(nuevo);
      setEstado("ok");
      setTimeout(() => setEstado("quieto"), 1200);
    } catch (e) {
      setEstado("quieto");
      toast.error(mensajeError(e));
    }
  };

  const pct = actual && Number(servicio.precio) > 0 ? Math.round((Number(actual.monto_cubierto) / Number(servicio.precio)) * 100) : null;

  return (
    <li className="flex items-center gap-4 px-5 py-2.5 text-sm">
      <span className="flex-1 truncate">{servicio.nombre}</span>
      <span className="w-28 text-right text-texto-3 tabular">{moneda(servicio.precio, moneda_)}</span>
      <input
        type="number"
        min={0}
        step="0.01"
        placeholder="No cubre"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-8 w-32 rounded-lg border border-borde bg-superficie px-2 text-right tabular outline-none focus:border-marca focus:[box-shadow:0_0_0_3px_var(--anillo)]"
      />
      <span className="w-14 text-xs text-texto-3 tabular">{pct !== null ? `${pct}%` : ""}</span>
      <span className="grid w-5 place-items-center">
        {estado === "guardando" && <Spinner className="size-3.5 text-texto-3" />}
        <AnimatePresence>
          {estado === "ok" && (
            <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}>
              <Check className="size-4 text-exito" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </li>
  );
}
