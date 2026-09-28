import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Plus, Search, ShieldCheck, Tags, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { areaDe, SIN_AREA } from "@/components/SelectorServicio";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, useAseguradoras, useServicios } from "@/lib/consultas";
import { IMPORTACIONES } from "@/lib/importaciones";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const COLUMNAS_SERVICIOS: ColumnaDatos<Fila<"servicios">>[] = [
  { titulo: "Código", valor: (s) => s.codigo },
  { titulo: "Servicio", valor: (s) => s.nombre },
  { titulo: "Área", valor: (s) => s.especialidad },
  { titulo: "Categoría", valor: (s) => s.categoria },
  { titulo: "Precio", valor: (s) => s.precio, tipo: "moneda" },
  { titulo: "Duración (min)", valor: (s) => s.duracion_min, tipo: "numero" },
  { titulo: "Activo", valor: (s) => s.activo, soloExcel: true },
];

const CATEGORIAS = ["consulta", "procedimiento", "laboratorio", "imagen", "emergencia", "hospitalizacion", "farmacia", "otro"];

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Áreas (especialidades) ya usadas en el sistema, para sugerirlas en los formularios. */
function useAreas(sistemaId: string) {
  const servicios = useServicios(sistemaId);
  return useMemo(() => [...new Set((servicios.data ?? []).map((s) => s.especialidad).filter(Boolean) as string[])].sort(), [servicios.data]);
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150",
        activo ? "border-marca bg-marca-suave text-marca-texto" : "border-borde text-texto-2 hover:border-borde-fuerte hover:text-texto",
      )}
    >
      {children}
    </button>
  );
}

// ===========================================================================
// Servicios (precios privados)
// ===========================================================================
export default function PaginaServicios() {
  const { sistemaId } = useSistema();
  const q = useServicios(sistemaId);
  const [editar, setEditar] = useState<Fila<"servicios"> | "nuevo" | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const areas = useMemo(() => {
    const c = new Map<string, number>();
    (q.data ?? []).forEach((s) => c.set(areaDe(s), (c.get(areaDe(s)) ?? 0) + 1));
    return [...c.entries()].sort(([a], [b]) => (a === SIN_AREA ? 1 : b === SIN_AREA ? -1 : a.localeCompare(b)));
  }, [q.data]);

  const lista = useMemo(() => {
    const t = norm(texto.trim());
    return (q.data ?? []).filter((s) => (!area || areaDe(s) === area) && (!t || norm(`${s.nombre} ${s.codigo ?? ""}`).includes(t)));
  }, [q.data, area, texto]);

  return (
    <>
      <EncabezadoPagina
        titulo="Servicios"
        descripcion="Catálogo de servicios y precios para pacientes sin seguro, agrupado por área."
        acciones={
          <>
            <AccionesDatos
              titulo="Servicios y precios"
              columnas={COLUMNAS_SERVICIOS}
              importaciones={[IMPORTACIONES.servicios]}
              onImportado={() => void q.refetch()}
              obtener={async () => lista}
            />
            <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nuevo")}>
              Nuevo servicio
            </Boton>
          </>
        }
      />
      <Tarjeta className="overflow-hidden">
        <div className="space-y-3 border-b border-borde p-3">
          <Entrada icono={<Search />} placeholder="Buscar por nombre o código…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="max-w-sm" />
          <div className="flex flex-wrap gap-1.5">
            <Chip activo={!area} onClick={() => setArea(null)}>
              Todas <span className="text-texto-3">{q.data?.length ?? 0}</span>
            </Chip>
            {areas.map(([a, n]) => (
              <Chip key={a} activo={area === a} onClick={() => setArea(area === a ? null : a)}>
                {a} <span className="text-texto-3">{n}</span>
              </Chip>
            ))}
          </div>
        </div>
        {q.isLoading ? (
          <FilasEsqueleto />
        ) : lista.length === 0 ? (
          <Vacio icono={<Tags />} titulo="Sin servicios" descripcion="Agrega consultas, procedimientos y estudios con su precio." />
        ) : (
          <motion.ul key={`${area}-${texto}`} variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {lista.map((s) => (
              <motion.li key={s.id} variants={itemEscalonado} className={cn("group flex items-center gap-4 px-5 py-3 text-sm", !s.activo && "opacity-50")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.nombre}</span>
                  <span className="block text-xs text-texto-3">{[s.codigo, s.especialidad, `${s.duracion_min} min`].filter(Boolean).join(" · ")}</span>
                </span>
                <Insignia className="capitalize">{s.categoria}</Insignia>
                <span className="w-32 text-right font-semibold tabular">{moneda(s.precio)}</span>
                <button onClick={() => setEditar(s)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto">
                  <Pencil className="size-4" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>
      <FormServicio item={editar} onCerrar={() => setEditar(null)} />
    </>
  );
}

function FormServicio({ item, onCerrar }: { item: Fila<"servicios"> | "nuevo" | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const areas = useAreas(sistemaId);
  const e = item && item !== "nuevo" ? item : null;
  const vacio = { nombre: "", codigo: "", categoria: "consulta", especialidad: "", precio: "0", duracion_min: "30", activo: true };
  const [f, setF] = useState(vacio);
  useEffect(() => {
    if (item)
      setF(
        e
          ? {
              nombre: e.nombre,
              codigo: e.codigo ?? "",
              categoria: e.categoria,
              especialidad: e.especialidad ?? "",
              precio: String(e.precio),
              duracion_min: String(e.duracion_min),
              activo: e.activo,
            }
          : vacio,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = {
        nombre: f.nombre.trim(),
        codigo: f.codigo.trim() || null,
        categoria: f.categoria,
        especialidad: f.especialidad.trim() || null,
        precio: Number(f.precio) || 0,
        duracion_min: Number(f.duracion_min) || 30,
        activo: f.activo,
      };
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
        <Entrada
          etiqueta="Área"
          list="areas-servicio"
          placeholder="Ej. Odontología"
          value={f.especialidad}
          onChange={(x) => setF({ ...f, especialidad: x.target.value })}
          ayuda="Agrupa el servicio en caja y en este catálogo."
        />
        <datalist id="areas-servicio">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <Selector etiqueta="Categoría contable" value={f.categoria} onChange={(x) => setF({ ...f, categoria: x.target.value })}>
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

// ===========================================================================
// Aseguradoras y su tarifario
// ===========================================================================
interface FilaTarifario {
  id: string;
  servicio_id: string;
  monto_cubierto: number;
  precio: number | null;
  monto_fondo: number | null;
  especialidad: string | null;
}

export function PaginaAseguradoras() {
  const { sistemaId } = useSistema();
  const q = useAseguradoras(sistemaId);
  const [sel, setSel] = useState<string | null>(null);
  const [editar, setEditar] = useState<Fila<"aseguradoras"> | "nueva" | null>(null);

  useEffect(() => {
    if (!sel && q.data?.length) setSel(q.data.find((a) => a.activo)?.id ?? q.data[0].id);
  }, [q.data, sel]);

  const actual = q.data?.find((a) => a.id === sel) ?? null;

  return (
    <>
      <EncabezadoPagina
        titulo="Aseguradoras"
        descripcion="ARS con las que trabaja el sistema y el tarifario pactado con cada una."
        acciones={
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nueva")}>
            Nueva aseguradora
          </Boton>
        }
      />
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Tarjeta>
          <Vacio icono={<ShieldCheck />} titulo="Sin aseguradoras" descripcion="Agrega las ARS con las que trabaja el sistema." />
        </Tarjeta>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Tarjeta className="h-fit overflow-hidden">
            <ul className="divide-y divide-borde">
              {q.data!.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSel(a.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                      sel === a.id ? "bg-marca-suave" : "hover:bg-superficie-2/60",
                      !a.activo && "opacity-50",
                    )}
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", sel === a.id ? "bg-marca text-white" : "bg-marca-suave text-marca")}>
                      <ShieldCheck className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate font-medium", sel === a.id && "text-marca-texto")}>{a.nombre}</span>
                      {a.telefono && <span className="block truncate text-xs text-texto-3">{a.telefono}</span>}
                    </span>
                    {!a.activo && <Insignia>Inactiva</Insignia>}
                  </button>
                </li>
              ))}
            </ul>
          </Tarjeta>
          {actual && <Tarifario aseguradora={actual} onEditar={() => setEditar(actual)} />}
        </div>
      )}
      <FormAseguradora item={editar} onCerrar={() => setEditar(null)} onCreada={setSel} />
    </>
  );
}

function FormAseguradora({ item, onCerrar, onCreada }: { item: Fila<"aseguradoras"> | "nueva" | null; onCerrar: () => void; onCreada: (id: string) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const e = item && item !== "nueva" ? item : null;
  const [f, setF] = useState({ nombre: "", codigo: "", telefono: "", activo: true });

  useEffect(() => {
    if (item) setF(e ? { nombre: e.nombre, codigo: e.codigo ?? "", telefono: e.telefono ?? "", activo: e.activo } : { nombre: "", codigo: "", telefono: "", activo: true });
  }, [item, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = { nombre: f.nombre.trim(), codigo: f.codigo.trim() || null, telefono: f.telefono.trim() || null, activo: f.activo };
      if (e) {
        const r = await supabase.from("aseguradoras").update(fila).eq("id", e.id);
        if (r.error) throw r.error;
        return e.id;
      }
      const r = await supabase.from("aseguradoras").insert({ ...fila, sistema_id: sistemaId }).select("id").single();
      if (r.error) throw r.error;
      return r.data.id;
    },
    onSuccess: (id) => {
      toast.success("Aseguradora guardada");
      void qc.invalidateQueries({ queryKey: claves.aseguradoras(sistemaId) });
      if (!e) onCreada(id);
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Modal
      abierto={!!item}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={e ? "Editar aseguradora" : "Nueva aseguradora"}
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
      <div className="space-y-4">
        <Entrada etiqueta="Nombre" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} ayuda="Si la ARS tiene planes con tarifas distintas, crea una por plan (ej. SENASA Contributivo)." />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Código" value={f.codigo} onChange={(x) => setF({ ...f, codigo: x.target.value })} />
          <Entrada etiqueta="Teléfono" value={f.telefono} onChange={(x) => setF({ ...f, telefono: x.target.value })} />
        </div>
        {e && <Interruptor activo={f.activo} onChange={(v) => setF({ ...f, activo: v })} etiqueta="Activa" />}
      </div>
    </Modal>
  );
}

function Tarifario({ aseguradora, onEditar }: { aseguradora: Fila<"aseguradoras">; onEditar: () => void }) {
  const { sistemaId } = useSistema();
  const servicios = useServicios(sistemaId);
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [editar, setEditar] = useState<FilaTarifario | "nuevo" | null>(null);
  const clave = ["coberturas", sistemaId, aseguradora.id];

  const q = useQuery({
    queryKey: clave,
    queryFn: async () =>
      (datos(await supabase.from("coberturas").select("id, servicio_id, monto_cubierto, precio, monto_fondo, especialidad").eq("aseguradora_id", aseguradora.id)) ??
        []) as FilaTarifario[],
  });

  const porId = useMemo(() => new Map((servicios.data ?? []).map((s) => [s.id, s])), [servicios.data]);
  const filas = useMemo(() => {
    const t = norm(texto.trim());
    return (q.data ?? [])
      .map((c) => ({ c, s: porId.get(c.servicio_id) }))
      .filter(({ s }) => s && (!t || norm(`${s.nombre} ${s.codigo ?? ""}`).includes(t)))
      .sort((a, b) => a.s!.nombre.localeCompare(b.s!.nombre));
  }, [q.data, porId, texto]);

  const total = (c: FilaTarifario) => c.precio ?? Number(porId.get(c.servicio_id)?.precio ?? 0);

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-borde p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold">{aseguradora.nombre}</p>
          <p className="text-xs text-texto-3">{q.data?.length ?? 0} procedimientos en el tarifario</p>
        </div>
        <Entrada icono={<Search />} placeholder="Buscar procedimiento…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="w-60" />
        <AccionesDatos
          titulo={`Tarifario ${aseguradora.nombre}`}
          columnas={[
            { titulo: "Código", valor: (x: (typeof filas)[number]) => x.s?.codigo },
            { titulo: "Procedimiento", valor: (x) => x.s?.nombre },
            { titulo: "Precio total", valor: (x) => total(x.c), tipo: "moneda" },
            { titulo: "Cubre la ARS", valor: (x) => x.c.monto_cubierto, tipo: "moneda" },
            { titulo: "Paga el paciente", valor: (x) => Math.max(total(x.c) - Number(x.c.monto_cubierto), 0), tipo: "moneda" },
            { titulo: "Fondo interno", valor: (x) => x.c.monto_fondo, tipo: "moneda" },
          ]}
          importaciones={[IMPORTACIONES.coberturas]}
          extraImportacion={{ p_aseguradora: aseguradora.id }}
          onImportado={() => void qc.invalidateQueries({ queryKey: clave })}
          obtener={async () => filas}
        />
        <Boton variante="secundario" tamano="sm" icono={<Pencil className="size-3.5" />} onClick={onEditar}>
          Editar ARS
        </Boton>
        <Boton tamano="sm" icono={<Plus className="size-3.5" />} onClick={() => setEditar("nuevo")}>
          Agregar
        </Boton>
      </div>

      <div className="grid grid-cols-[1fr_110px_110px_110px_90px_36px] gap-3 border-b border-borde bg-superficie-2/60 px-5 py-2 text-[0.6875rem] font-semibold tracking-wide text-texto-3 uppercase">
        <span>Procedimiento</span>
        <span className="text-right">Total</span>
        <span className="text-right">Cubre ARS</span>
        <span className="text-right">Paciente</span>
        <span className="text-right">Fondo</span>
        <span />
      </div>
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : filas.length === 0 ? (
        <Vacio icono={<ShieldCheck />} titulo="Tarifario vacío" descripcion="Agrega procedimientos o importa el tarifario de la ARS en Excel." />
      ) : (
        <ul className="divide-y divide-borde">
          {filas.map(({ c, s }) => (
            <li key={c.id} className="group grid grid-cols-[1fr_110px_110px_110px_90px_36px] items-center gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{s!.nombre}</span>
                {(c.especialidad || s!.especialidad) && <span className="block truncate text-xs text-texto-3">{c.especialidad || s!.especialidad}</span>}
              </span>
              <span className="text-right tabular">{moneda(total(c))}</span>
              <span className="text-right text-texto-2 tabular">{moneda(c.monto_cubierto)}</span>
              <span className="text-right font-medium tabular">{moneda(Math.max(total(c) - Number(c.monto_cubierto), 0))}</span>
              <span className="text-right text-texto-3 tabular">{c.monto_fondo ? moneda(c.monto_fondo) : "—"}</span>
              <button onClick={() => setEditar(c)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto">
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormProcedimiento aseguradoraId={aseguradora.id} item={editar} existentes={q.data ?? []} onCerrar={() => setEditar(null)} />
    </Tarjeta>
  );
}

function FormProcedimiento({
  aseguradoraId,
  item,
  existentes,
  onCerrar,
}: {
  aseguradoraId: string;
  item: FilaTarifario | "nuevo" | null;
  existentes: FilaTarifario[];
  onCerrar: () => void;
}) {
  const { sistemaId } = useSistema();
  const servicios = useServicios(sistemaId);
  const areas = useAreas(sistemaId);
  const qc = useQueryClient();
  const e = item && item !== "nuevo" ? item : null;
  const [f, setF] = useState({ servicio_id: "", total: "", cubre: "", fondo: "", especialidad: "" });

  useEffect(() => {
    if (!item) return;
    const s = e ? servicios.data?.find((x) => x.id === e.servicio_id) : null;
    setF(
      e
        ? {
            servicio_id: e.servicio_id,
            total: String(e.precio ?? s?.precio ?? ""),
            cubre: String(e.monto_cubierto),
            fondo: e.monto_fondo ? String(e.monto_fondo) : "",
            especialidad: e.especialidad ?? "",
          }
        : { servicio_id: "", total: "", cubre: "", fondo: "", especialidad: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const disponibles = (servicios.data ?? []).filter((s) => s.activo && (e ? s.id === e.servicio_id : !existentes.some((c) => c.servicio_id === s.id)));
  const total = Number(f.total) || 0;
  const cubre = Number(f.cubre) || 0;

  const refrescar = () => void qc.invalidateQueries({ queryKey: ["coberturas", sistemaId, aseguradoraId] });

  const guardar = useMutation({
    mutationFn: async () => {
      const fila = {
        precio: f.total.trim() === "" ? null : total,
        monto_cubierto: cubre,
        monto_fondo: f.fondo.trim() === "" ? null : Number(f.fondo),
        especialidad: f.especialidad.trim() || null,
      };
      const r = e
        ? await supabase.from("coberturas").update(fila).eq("id", e.id)
        : await supabase.from("coberturas").insert({ ...fila, sistema_id: sistemaId, aseguradora_id: aseguradoraId, servicio_id: f.servicio_id });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Tarifario actualizado");
      refrescar();
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  const quitar = useMutation({
    mutationFn: async () => {
      const r = await supabase.from("coberturas").delete().eq("id", e!.id);
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Procedimiento quitado del tarifario");
      refrescar();
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Modal
      abierto={!!item}
      onCerrar={onCerrar}
      titulo={e ? "Editar procedimiento" : "Agregar al tarifario"}
      pie={
        <>
          {e && (
            <Boton variante="secundario" className="mr-auto" icono={<Trash2 className="size-4" />} cargando={quitar.isPending} onClick={() => quitar.mutate()}>
              Quitar
            </Boton>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!f.servicio_id || cubre < 0 || (total > 0 && cubre > total)} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Selector etiqueta="Procedimiento" contenedor="col-span-2" value={f.servicio_id} disabled={!!e} onChange={(x) => {
          const s = servicios.data?.find((y) => y.id === x.target.value);
          setF({ ...f, servicio_id: x.target.value, total: f.total || String(s?.precio ?? ""), especialidad: f.especialidad || s?.especialidad || "" });
        }}>
          <option value="">Elige un servicio…</option>
          {disponibles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Precio total pactado" type="number" min={0} step="0.01" value={f.total} onChange={(x) => setF({ ...f, total: x.target.value })} ayuda="Vacío = precio del catálogo." />
        <Entrada etiqueta="Cubre la ARS" type="number" min={0} step="0.01" value={f.cubre} onChange={(x) => setF({ ...f, cubre: x.target.value })} error={total > 0 && cubre > total ? "No puede superar el total" : undefined} />
        <Entrada etiqueta="Fondo interno" type="number" min={0} step="0.01" value={f.fondo} onChange={(x) => setF({ ...f, fondo: x.target.value })} ayuda="Excedente que paga la ARS aparte (opcional)." />
        <Entrada etiqueta="Área" list="areas-tarifario" value={f.especialidad} onChange={(x) => setF({ ...f, especialidad: x.target.value })} />
        <datalist id="areas-tarifario">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <AnimatePresence initial={false}>
          {total > 0 && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="col-span-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm text-texto-2"
            >
              El paciente paga <span className="font-semibold text-texto tabular">{moneda(Math.max(total - cubre, 0))}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
