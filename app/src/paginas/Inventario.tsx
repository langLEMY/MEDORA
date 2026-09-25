import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, History, Package, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { claves } from "@/lib/consultas";
import { IMPORTACIONES } from "@/lib/importaciones";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, fechaHora, moneda, numero } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

type Item = Fila<"inventario_items">;

const COLUMNAS_INVENTARIO: ColumnaDatos<Item>[] = [
  { titulo: "Código", valor: (i) => i.codigo },
  { titulo: "Nombre", valor: (i) => i.nombre },
  { titulo: "Categoría", valor: (i) => i.categoria },
  { titulo: "Unidad", valor: (i) => i.unidad },
  { titulo: "Existencia", valor: (i) => Number(i.stock_actual), tipo: "numero" },
  { titulo: "Stock mínimo", valor: (i) => Number(i.stock_minimo), tipo: "numero" },
  { titulo: "Costo", valor: (i) => i.costo_unitario, tipo: "moneda" },
  { titulo: "Precio de venta", valor: (i) => i.precio_venta, tipo: "moneda" },
  { titulo: "Valor en inventario", valor: (i) => Number(i.stock_actual) * Number(i.costo_unitario ?? 0), tipo: "moneda" },
  { titulo: "Requiere receta", valor: (i) => i.requiere_receta, soloExcel: true },
  { titulo: "Activo", valor: (i) => i.activo, soloExcel: true },
];

interface MovExport {
  tipo: string;
  cantidad: number;
  lote: string | null;
  vence_en: string | null;
  motivo: string | null;
  creado_en: string;
  autor: { nombre_completo: string } | null;
}
const COLUMNAS_KARDEX: ColumnaDatos<MovExport>[] = [
  { titulo: "Fecha", valor: (m) => m.creado_en, tipo: "fechaHora" },
  { titulo: "Tipo", valor: (m) => m.tipo },
  { titulo: "Cantidad", valor: (m) => (m.tipo === "salida" ? -Number(m.cantidad) : Number(m.cantidad)), tipo: "numero" },
  { titulo: "Lote", valor: (m) => m.lote },
  { titulo: "Vence", valor: (m) => m.vence_en, tipo: "fecha" },
  { titulo: "Motivo", valor: (m) => m.motivo },
  { titulo: "Registrado por", valor: (m) => m.autor?.nombre_completo },
];
const CATEGORIAS = [
  ["medicamento", "Medicamentos"],
  ["insumo", "Insumos"],
  ["reactivo", "Reactivos"],
  ["equipo", "Equipos"],
  ["otro", "Otros"],
] as const;

export default function Inventario() {
  const { sistema, sistemaId, roles } = useSistema();
  const [filtro, setFiltro] = useState<"todos" | "bajo">("todos");
  const [categoria, setCategoria] = useState("");
  const [texto, setTexto] = useState("");
  const [editar, setEditar] = useState<Item | "nuevo" | null>(null);
  const [mover, setMover] = useState<Item | null>(null);
  const [historial, setHistorial] = useState<Item | null>(null);

  const qc = useQueryClient();
  const q = useQuery({
    queryKey: claves.inventario(sistemaId),
    queryFn: async () => datos(await supabase.from("inventario_items").select("*").eq("sistema_id", sistemaId).order("nombre")),
  });

  const gestionar = puedeEscribir.inventario(roles);
  const salidas = puedeEscribir.salidaInventario(roles);
  const items = (q.data ?? []).filter(
    (i) =>
      (filtro === "todos" || (i.activo && Number(i.stock_actual) <= Number(i.stock_minimo))) &&
      (!categoria || i.categoria === categoria) &&
      (!texto || `${i.nombre} ${i.codigo ?? ""}`.toLowerCase().includes(texto.toLowerCase())),
  );
  const bajos = (q.data ?? []).filter((i) => i.activo && Number(i.stock_actual) <= Number(i.stock_minimo)).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario"
        descripcion="Farmacia, insumos y equipos. El stock solo cambia con movimientos trazables."
        acciones={
          <>
            <AccionesDatos
              titulo="Existencias de inventario"
              columnas={COLUMNAS_INVENTARIO}
              importaciones={gestionar ? [IMPORTACIONES.inventario, IMPORTACIONES.movimientosInventario] : []}
              onImportado={() => void qc.invalidateQueries({ queryKey: claves.inventario(sistemaId) })}
              obtener={async () => items}
            />
            {gestionar && (
              <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nuevo")}>
                Nuevo artículo
              </Boton>
            )}
          </>
        }
      />

      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-borde p-3">
          <Entrada icono={<Search />} placeholder="Buscar por nombre o código…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="w-72" />
          <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)} contenedor="w-44">
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </Selector>
          <div className="ml-auto">
            <Segmentado
              id="inv"
              valor={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: "todos", etiqueta: "Todos" },
                {
                  valor: "bajo",
                  etiqueta: (
                    <span className="inline-flex items-center gap-1.5">
                      Bajo mínimo {bajos > 0 && <span className="rounded-full bg-aviso px-1.5 text-[11px] text-white">{bajos}</span>}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {q.isLoading ? (
          <FilasEsqueleto />
        ) : items.length === 0 ? (
          <Vacio icono={<Package />} titulo={q.data?.length ? "Sin coincidencias" : "Inventario vacío"} descripcion={q.data?.length ? undefined : "Registra medicamentos, insumos y equipos."} />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {items.map((i) => {
              const stock = Number(i.stock_actual);
              const minimo = Number(i.stock_minimo);
              const bajo = stock <= minimo;
              const porcentaje = Math.min(100, minimo > 0 ? (stock / (minimo * 3)) * 100 : stock > 0 ? 100 : 0);
              return (
                <motion.li key={i.id} variants={itemEscalonado} className={cn("group flex items-center gap-4 px-5 py-3.5", !i.activo && "opacity-50")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{i.nombre}</span>
                      {i.requiere_receta && <Insignia tono="violeta">Receta</Insignia>}
                      {!i.activo && <Insignia>Inactivo</Insignia>}
                    </div>
                    <p className="text-xs text-texto-3">
                      {[i.codigo, CATEGORIAS.find((c) => c[0] === i.categoria)?.[1], i.precio_venta ? moneda(i.precio_venta, sistema.moneda) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="w-48">
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className={cn("text-sm font-semibold tabular", bajo && "text-aviso")}>
                        {numero(stock)} <span className="text-xs font-normal text-texto-3">{i.unidad}</span>
                      </span>
                      <span className="text-texto-3">mín. {numero(minimo)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
                      <motion.div
                        className={cn("h-full rounded-full", bajo ? "bg-aviso" : "bg-marca")}
                        initial={{ width: 0 }}
                        animate={{ width: `${porcentaje}%` }}
                        transition={{ type: "spring", duration: 0.8, bounce: 0 }}
                      />
                    </div>
                  </div>
                  <div className="flex w-28 justify-end gap-1">
                    {bajo && i.activo && <AlertTriangle className="mr-1 size-4 self-center text-aviso group-hover:hidden" />}
                    <div className="hidden gap-1 group-hover:flex">
                      {salidas && (
                        <button title="Movimiento" onClick={() => setMover(i)} className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
                          <SlidersHorizontal className="size-4" />
                        </button>
                      )}
                      <button title="Historial" onClick={() => setHistorial(i)} className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
                        <History className="size-4" />
                      </button>
                      {gestionar && (
                        <button title="Editar" onClick={() => setEditar(i)} className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </Tarjeta>

      <FormItem item={editar} onCerrar={() => setEditar(null)} />
      <FormMovimiento item={mover} onCerrar={() => setMover(null)} />
      <HistorialItem item={historial} onCerrar={() => setHistorial(null)} />
    </>
  );
}

function FormItem({ item, onCerrar }: { item: Item | "nuevo" | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const existente = item && item !== "nuevo" ? item : null;
  const [f, setF] = useState({ nombre: "", codigo: "", categoria: "medicamento", unidad: "unidad", stock_minimo: "0", costo_unitario: "", precio_venta: "", descripcion: "", requiere_receta: false, activo: true });

  useEffect(() => {
    if (!item) return;
    setF(
      existente
        ? {
            nombre: existente.nombre,
            codigo: existente.codigo ?? "",
            categoria: existente.categoria,
            unidad: existente.unidad,
            stock_minimo: String(existente.stock_minimo),
            costo_unitario: existente.costo_unitario?.toString() ?? "",
            precio_venta: existente.precio_venta?.toString() ?? "",
            descripcion: existente.descripcion ?? "",
            requiere_receta: existente.requiere_receta,
            activo: existente.activo,
          }
        : { nombre: "", codigo: "", categoria: "medicamento", unidad: "unidad", stock_minimo: "0", costo_unitario: "", precio_venta: "", descripcion: "", requiere_receta: false, activo: true },
    );
  }, [item, existente]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = {
        nombre: f.nombre.trim(),
        codigo: f.codigo.trim() || null,
        categoria: f.categoria,
        unidad: f.unidad.trim() || "unidad",
        stock_minimo: Number(f.stock_minimo) || 0,
        costo_unitario: f.costo_unitario === "" ? null : Number(f.costo_unitario),
        precio_venta: f.precio_venta === "" ? null : Number(f.precio_venta),
        descripcion: f.descripcion.trim() || null,
        requiere_receta: f.requiere_receta,
        activo: f.activo,
      };
      const r = existente
        ? await supabase.from("inventario_items").update(fila).eq("id", existente.id)
        : await supabase.from("inventario_items").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success(existente ? "Artículo actualizado" : "Artículo creado");
      void qc.invalidateQueries({ queryKey: claves.inventario(sistemaId) });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal
      abierto={!!item}
      onCerrar={onCerrar}
      titulo={existente ? "Editar artículo" : "Nuevo artículo"}
      descripcion={existente ? undefined : "El stock inicial se carga con un movimiento de entrada."}
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
        <Entrada etiqueta="Nombre" contenedor="col-span-2" value={f.nombre} onChange={set("nombre")} />
        <Entrada etiqueta="Código" value={f.codigo} onChange={set("codigo")} />
        <Selector etiqueta="Categoría" value={f.categoria} onChange={set("categoria")}>
          {CATEGORIAS.map(([v, e]) => (
            <option key={v} value={v}>
              {e}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Unidad" value={f.unidad} onChange={set("unidad")} placeholder="unidad, caja, ml…" />
        <Entrada etiqueta="Stock mínimo" type="number" min={0} value={f.stock_minimo} onChange={set("stock_minimo")} />
        <Entrada etiqueta="Costo unitario" type="number" min={0} step="0.01" value={f.costo_unitario} onChange={set("costo_unitario")} />
        <Entrada etiqueta="Precio de venta" type="number" min={0} step="0.01" value={f.precio_venta} onChange={set("precio_venta")} />
        <AreaTexto etiqueta="Descripción" contenedor="col-span-2" className="min-h-16" value={f.descripcion} onChange={set("descripcion")} />
        <Interruptor activo={f.requiere_receta} onChange={(v) => setF((x) => ({ ...x, requiere_receta: v }))} etiqueta="Requiere receta" />
        {existente && <Interruptor activo={f.activo} onChange={(v) => setF((x) => ({ ...x, activo: v }))} etiqueta="Activo" />}
      </div>
    </Modal>
  );
}

function FormMovimiento({ item, onCerrar }: { item: Item | null; onCerrar: () => void }) {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<"entrada" | "salida" | "ajuste">("salida");
  const [cantidad, setCantidad] = useState("");
  const [lote, setLote] = useState("");
  const [vence, setVence] = useState("");
  const [motivo, setMotivo] = useState("");
  const gestionar = puedeEscribir.inventario(roles);

  useEffect(() => {
    if (item) {
      setTipo(gestionar ? "entrada" : "salida");
      setCantidad("");
      setLote("");
      setVence("");
      setMotivo("");
    }
  }, [item, gestionar]);

  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("movimientos_inventario").insert({
        sistema_id: sistemaId,
        item_id: item!.id,
        tipo,
        cantidad: Number(cantidad),
        lote: lote || null,
        vence_en: vence || null,
        motivo: motivo || null,
        creado_por: u.user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento registrado");
      void qc.invalidateQueries({ queryKey: claves.inventario(sistemaId) });
      void qc.invalidateQueries({ queryKey: ["mov-inventario", item?.id] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const valido = tipo === "ajuste" ? Number(cantidad) !== 0 && cantidad !== "" : Number(cantidad) > 0;

  return (
    <Modal
      abierto={!!item}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={item?.nombre ?? ""}
      descripcion={item ? `Stock actual: ${numero(Number(item.stock_actual))} ${item.unidad}` : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!valido} onClick={() => m.mutate()}>
            Registrar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          id="tipo-inv"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            ...(gestionar ? [{ valor: "entrada" as const, etiqueta: <span className="inline-flex items-center gap-1.5"><ArrowDownToLine className="size-3.5" />Entrada</span> }] : []),
            { valor: "salida" as const, etiqueta: <span className="inline-flex items-center gap-1.5"><ArrowUpFromLine className="size-3.5" />Salida</span> },
            ...(gestionar ? [{ valor: "ajuste" as const, etiqueta: "Ajuste" }] : []),
          ]}
        />
        <Entrada
          etiqueta={tipo === "ajuste" ? "Diferencia (+/−)" : "Cantidad"}
          type="number"
          step="any"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          ayuda={tipo === "ajuste" ? "Positivo suma, negativo resta (p. ej. conteo físico)." : undefined}
        />
        {tipo === "entrada" && (
          <div className="grid grid-cols-2 gap-4">
            <Entrada etiqueta="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
            <Entrada etiqueta="Vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          </div>
        )}
        <Entrada etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "salida" ? "Ej. Uso en sala de emergencias" : ""} />
      </div>
    </Modal>
  );
}

function HistorialItem({ item, onCerrar }: { item: Item | null; onCerrar: () => void }) {
  const q = useQuery({
    queryKey: ["mov-inventario", item?.id],
    enabled: !!item,
    queryFn: async () =>
      datos(
        await supabase
          .from("movimientos_inventario")
          .select("id, tipo, cantidad, lote, vence_en, motivo, creado_en, autor:perfiles!mov_inventario_autor_perfil_fk(nombre_completo)")
          .eq("item_id", item!.id)
          .order("creado_en", { ascending: false })
          .limit(100),
      ),
  });
  return (
    <Modal abierto={!!item} onCerrar={onCerrar} lateral titulo={`Movimientos · ${item?.nombre ?? ""}`}>
      {item && (
        <div className="mb-4 flex justify-end">
          <AccionesDatos
            titulo={`Kárdex · ${item.nombre}`}
            columnas={COLUMNAS_KARDEX}
            obtener={async () => (q.data ?? []) as unknown as MovExport[]}
          />
        </div>
      )}
      {q.isLoading ? (
        <FilasEsqueleto filas={5} />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<History />} titulo="Sin movimientos" />
      ) : (
        <ul className="-mx-6 divide-y divide-borde">
          {q.data!.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-6 py-3 text-sm">
              <Insignia tono={m.tipo === "entrada" ? "exito" : m.tipo === "salida" ? "aviso" : "info"}>{m.tipo}</Insignia>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.motivo ?? (m.lote ? `Lote ${m.lote}` : "—")}</span>
                <span className="block text-xs text-texto-3">
                  {fechaHora(m.creado_en)} · {m.autor?.nombre_completo}
                </span>
              </span>
              <span className="font-semibold tabular">
                {m.tipo === "salida" ? "−" : Number(m.cantidad) > 0 && m.tipo === "ajuste" ? "+" : ""}
                {numero(Number(m.cantidad))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
