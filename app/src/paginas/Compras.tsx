import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Eye, Pencil, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { SelectorCuenta } from "@/components/SelectorCuenta";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, useProveedores } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const FORMAS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
  credito: "A crédito (CxP)",
};

interface CompraFila {
  id: string;
  numero: string;
  fecha: string;
  ncf_proveedor: string | null;
  forma_pago: string;
  subtotal: number;
  itbis: number;
  total: number;
  notas: string | null;
  proveedor: { nombre: string; rnc: string | null } | null;
  anulacion: { motivo: string }[] | null;
  items: { descripcion: string; cantidad: number; costo_unitario: number; itbis: number; total: number; cuenta_codigo: string | null; item_id: string | null }[];
}

export default function Compras() {
  const { roles } = useSistema();
  const [vista, setVista] = useState<"compras" | "proveedores">("compras");
  const [nueva, setNueva] = useState(false);
  return (
    <>
      <EncabezadoPagina
        titulo="Compras"
        descripcion="Compras a proveedores con entrada automática a inventario y su asiento contable."
        acciones={
          puedeEscribir.compras(roles) &&
          vista === "compras" && (
            <Boton icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>
              Nueva compra
            </Boton>
          )
        }
      />
      <div className="mb-4">
        <Segmentado
          id="compras"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "compras", etiqueta: "Compras" },
            { valor: "proveedores", etiqueta: "Proveedores" },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {vista === "compras" ? <ListaCompras /> : <Proveedores />}
        </motion.div>
      </AnimatePresence>
      <NuevaCompra abierto={nueva} onCerrar={() => setNueva(false)} />
    </>
  );
}

function ListaCompras() {
  const { sistema, sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [ver, setVer] = useState<CompraFila | null>(null);
  const [anular, setAnular] = useState<CompraFila | null>(null);
  const [motivo, setMotivo] = useState("");

  const q = useQuery({
    queryKey: ["compras", sistemaId],
    queryFn: async () =>
      datos(
        await supabase
          .from("compras")
          .select(
            "id, numero, fecha, ncf_proveedor, forma_pago, subtotal, itbis, total, notas, proveedor:proveedores!compras_sistema_id_proveedor_id_fkey(nombre, rnc), anulacion:anulaciones_compra(motivo), items:compra_items(descripcion, cantidad, costo_unitario, itbis, total, cuenta_codigo, item_id)",
          )
          .eq("sistema_id", sistemaId)
          .order("fecha", { ascending: false })
          .order("numero", { ascending: false })
          .limit(200),
      ) as unknown as CompraFila[],
  });

  const m = useMutation({
    mutationFn: async () => datos(await supabase.rpc("anular_compra", { p_compra: anular!.id, p_motivo: motivo })),
    onSuccess: () => {
      toast.success("Compra anulada: se revirtieron inventario, pago y asiento.");
      setAnular(null);
      setMotivo("");
      void qc.invalidateQueries({ queryKey: ["compras", sistemaId] });
      void qc.invalidateQueries({ queryKey: claves.inventario(sistemaId) });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Tarjeta className="overflow-hidden">
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<ShoppingCart />} titulo="Sin compras registradas" />
      ) : (
        <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
          {q.data!.map((c) => {
            const anulada = !!c.anulacion?.length;
            return (
              <motion.li key={c.id} variants={itemEscalonado} className="group flex items-center gap-4 px-5 py-3 text-sm">
                <span className="w-28 font-medium tabular">{c.numero}</span>
                <span className="w-28 whitespace-nowrap text-texto-2">{fecha(c.fecha + "T00:00:00")}</span>
                <span className={cn("min-w-0 flex-1 truncate", anulada && "text-texto-3 line-through")}>
                  {c.proveedor?.nombre ?? "Compra en efectivo sin proveedor"}
                  {c.ncf_proveedor && <span className="ml-2 font-mono text-xs text-texto-3">{c.ncf_proveedor}</span>}
                </span>
                <Insignia tono={c.forma_pago === "credito" ? "aviso" : "neutro"}>{FORMAS[c.forma_pago]}</Insignia>
                {anulada && <Insignia tono="peligro">Anulada</Insignia>}
                <span className="w-32 text-right font-semibold tabular">{moneda(c.total, sistema.moneda)}</span>
                <div className="flex w-20 justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => setVer(c)} className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto" title="Ver">
                    <Eye className="size-4" />
                  </button>
                  {!anulada && puedeEscribir.anularCompras(roles) && (
                    <button onClick={() => setAnular(c)} className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro" title="Anular">
                      <Ban className="size-4" />
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <Documento abierto={!!ver} onCerrar={() => setVer(null)} titulo={`Compra ${ver?.numero ?? ""}`} nombreArchivo={`Compra ${ver?.numero ?? ""}`}>
        {ver && (
          <>
            <EncabezadoDocumento
              titulo={`Compra ${ver.numero}`}
              subtitulo={
                <>
                  {fecha(ver.fecha + "T00:00:00")} · {FORMAS[ver.forma_pago]}
                  {ver.ncf_proveedor && <> · NCF {ver.ncf_proveedor}</>}
                </>
              }
            />
            <p className="mb-4">
              Proveedor: <b>{ver.proveedor?.nombre ?? "—"}</b> {ver.proveedor?.rnc && <>· RNC {ver.proveedor.rnc}</>}
            </p>
            <TablaDocumento
              encabezados={["Descripción", "Cant.", "Costo", "ITBIS", "Total"]}
              filas={ver.items.map((i) => [
                i.descripcion + (i.cuenta_codigo ? ` (${i.cuenta_codigo})` : ""),
                String(Number(i.cantidad)),
                moneda(i.costo_unitario, sistema.moneda),
                moneda(i.itbis, sistema.moneda),
                moneda(i.total, sistema.moneda),
              ])}
              pie={["Total", "", moneda(ver.subtotal, sistema.moneda), moneda(ver.itbis, sistema.moneda), moneda(ver.total, sistema.moneda)]}
            />
            {ver.notas && <p className="mt-4 text-[#475467]">Notas: {ver.notas}</p>}
          </>
        )}
      </Documento>

      <Modal
        abierto={!!anular}
        onCerrar={() => setAnular(null)}
        ancho="sm"
        titulo={`Anular ${anular?.numero ?? ""}`}
        descripcion="Se registra la salida del inventario comprado, se revierte el pago y el asiento."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAnular(null)}>
              Volver
            </Boton>
            <Boton variante="peligro" cargando={m.isPending} disabled={motivo.trim().length < 5} onClick={() => m.mutate()}>
              Anular compra
            </Boton>
          </>
        }
      >
        <AreaTexto etiqueta="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Modal>
    </Tarjeta>
  );
}

interface LineaCompra {
  clave: number;
  tipo: "inventario" | "gasto";
  item_id: string;
  cuenta: string;
  descripcion: string;
  cantidad: string;
  costo: string;
  conItbis: boolean;
  lote: string;
  vence: string;
}

const lineaVacia = (): LineaCompra => ({
  clave: Date.now() + Math.random(),
  tipo: "inventario",
  item_id: "",
  cuenta: "",
  descripcion: "",
  cantidad: "1",
  costo: "",
  conItbis: false,
  lote: "",
  vence: "",
});

function NuevaCompra({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const qc = useQueryClient();
  const proveedores = useProveedores(sistemaId);
  const inventario = useQuery({
    queryKey: claves.inventario(sistemaId),
    enabled: abierto,
    queryFn: async () => datos(await supabase.from("inventario_items").select("*").eq("sistema_id", sistemaId).order("nombre")),
  });
  const [proveedor, setProveedor] = useState("");
  const [forma, setForma] = useState("efectivo");
  const [ncf, setNcf] = useState("");
  const [fechaC, setFechaC] = useState(isoDia());
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaCompra[]>([lineaVacia()]);

  useEffect(() => {
    if (!abierto) return;
    setProveedor("");
    setForma("efectivo");
    setNcf("");
    setFechaC(isoDia());
    setNotas("");
    setLineas([lineaVacia()]);
  }, [abierto]);

  const set = (clave: number, cambios: Partial<LineaCompra>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const base = (l: LineaCompra) => (Number(l.cantidad) || 0) * (Number(l.costo) || 0);
  const itbis = (l: LineaCompra) => (l.conItbis ? Math.round(base(l) * 18) / 100 : 0);
  const subtotal = lineas.reduce((s, l) => s + base(l), 0);
  const totalItbis = lineas.reduce((s, l) => s + itbis(l), 0);
  const proveedorObligatorio = forma !== "efectivo";
  const lineasValidas = lineas.every((l) => Number(l.cantidad) > 0 && Number(l.costo) >= 0 && l.costo !== "" && (l.tipo === "inventario" ? !!l.item_id : !!l.cuenta && !!l.descripcion.trim()));

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_compra", {
          p_sistema: sistemaId,
          p_proveedor: proveedor || (null as unknown as string),
          p_fecha: fechaC,
          p_ncf: ncf,
          p_forma_pago: forma,
          p_notas: notas || undefined,
          p_items: lineas.map((l) => ({
            item_id: l.tipo === "inventario" ? l.item_id : null,
            cuenta: l.tipo === "gasto" ? l.cuenta : null,
            descripcion: l.tipo === "inventario" ? (inventario.data?.find((i) => i.id === l.item_id)?.nombre ?? "") : l.descripcion,
            cantidad: Number(l.cantidad),
            costo_unitario: Number(l.costo),
            itbis: itbis(l),
            lote: l.lote || null,
            vence_en: l.vence || null,
          })),
        }),
      ) as { numero: string },
    onSuccess: (r) => {
      toast.success(`Compra ${r.numero} registrada`);
      void qc.invalidateQueries({ queryKey: ["compras", sistemaId] });
      void qc.invalidateQueries({ queryKey: claves.inventario(sistemaId) });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      lateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva compra"
      descripcion="Los artículos de inventario entran al stock automáticamente."
      pie={
        <>
          <div className="mr-auto text-sm">
            <span className="text-texto-2">Total </span>
            <span className="text-lg font-semibold tabular">{moneda(subtotal + totalItbis, sistema.moneda)}</span>
          </div>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!lineasValidas || (proveedorObligatorio && !proveedor)} onClick={() => m.mutate()}>
            Registrar compra
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Forma de pago" value={forma} onChange={(e) => setForma(e.target.value)}>
            {Object.entries(FORMAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta={proveedorObligatorio ? "Proveedor (obligatorio)" : "Proveedor (opcional en efectivo)"}
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            error={proveedorObligatorio && !proveedor ? "Si no es 100% en efectivo, el proveedor es obligatorio." : undefined}
          >
            <option value="">—</option>
            {proveedores.data
              ?.filter((p) => p.activo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </Selector>
          <Entrada etiqueta="Fecha de la factura" type="date" max={isoDia()} value={fechaC} onChange={(e) => setFechaC(e.target.value)} />
          <Entrada etiqueta="NCF del proveedor" placeholder="B0100000000" value={ncf} onChange={(e) => setNcf(e.target.value.toUpperCase())} />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-texto-2">Líneas</span>
            <Boton variante="secundario" tamano="sm" icono={<Plus className="size-3.5" />} onClick={() => setLineas((l) => [...l, lineaVacia()])}>
              Agregar línea
            </Boton>
          </div>
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {lineas.map((l) => (
                <motion.div
                  key={l.clave}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 rounded-xl border border-borde p-3">
                    <div className="flex items-center gap-2">
                      <Segmentado
                        id={`tipo-${l.clave}`}
                        valor={l.tipo}
                        onChange={(tipo) => set(l.clave, { tipo })}
                        opciones={[
                          { valor: "inventario", etiqueta: "Inventario" },
                          { valor: "gasto", etiqueta: "Gasto / servicio" },
                        ]}
                      />
                      <span className="ml-auto text-sm font-semibold tabular">{moneda(base(l) + itbis(l), sistema.moneda)}</span>
                      <button
                        onClick={() => setLineas((x) => (x.length > 1 ? x.filter((y) => y.clave !== l.clave) : x))}
                        className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {l.tipo === "inventario" ? (
                      <Selector value={l.item_id} onChange={(e) => set(l.clave, { item_id: e.target.value })}>
                        <option value="">Artículo de inventario…</option>
                        {inventario.data
                          ?.filter((i) => i.activo)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nombre}
                              {i.codigo ? ` · ${i.codigo}` : ""}
                            </option>
                          ))}
                      </Selector>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <Entrada placeholder="Descripción" value={l.descripcion} onChange={(e) => set(l.clave, { descripcion: e.target.value })} />
                        <SelectorCuenta valor={l.cuenta || null} onChange={(cuenta) => set(l.clave, { cuenta })} tipos={["gasto", "costo", "activo"]} />
                      </div>
                    )}
                    <div className="grid grid-cols-4 items-end gap-3">
                      <Entrada etiqueta="Cantidad" type="number" min={0} step="any" value={l.cantidad} onChange={(e) => set(l.clave, { cantidad: e.target.value })} />
                      <Entrada etiqueta="Costo unitario" type="number" min={0} step="0.01" value={l.costo} onChange={(e) => set(l.clave, { costo: e.target.value })} />
                      {l.tipo === "inventario" ? (
                        <>
                          <Entrada etiqueta="Lote" value={l.lote} onChange={(e) => set(l.clave, { lote: e.target.value })} />
                          <Entrada etiqueta="Vence" type="date" value={l.vence} onChange={(e) => set(l.clave, { vence: e.target.value })} />
                        </>
                      ) : (
                        <div className="col-span-2" />
                      )}
                    </div>
                    <Interruptor activo={l.conItbis} onChange={(conItbis) => set(l.clave, { conItbis })} etiqueta={`ITBIS 18% (${moneda(itbis(l), sistema.moneda)})`} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <dl className="space-y-1.5 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-texto-2">Subtotal</dt>
            <dd className="tabular">{moneda(subtotal, sistema.moneda)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-texto-2">ITBIS</dt>
            <dd className="tabular">{moneda(totalItbis, sistema.moneda)}</dd>
          </div>
          <div className="flex justify-between border-t border-borde pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{moneda(subtotal + totalItbis, sistema.moneda)}</dd>
          </div>
        </dl>
        <AreaTexto etiqueta="Notas" className="min-h-16" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}

function Proveedores() {
  const { sistemaId, roles } = useSistema();
  const q = useProveedores(sistemaId);
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Fila<"proveedores"> | "nuevo" | null>(null);
  const e = editar && editar !== "nuevo" ? editar : null;
  const [f, setF] = useState({ nombre: "", rnc: "", telefono: "", email: "", contacto: "", direccion: "", activo: true });

  useEffect(() => {
    if (editar)
      setF(
        e
          ? { nombre: e.nombre, rnc: e.rnc ?? "", telefono: e.telefono ?? "", email: e.email ?? "", contacto: e.contacto ?? "", direccion: e.direccion ?? "", activo: e.activo }
          : { nombre: "", rnc: "", telefono: "", email: "", contacto: "", direccion: "", activo: true },
      );
  }, [editar, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = {
        nombre: f.nombre.trim(),
        rnc: f.rnc.trim() || null,
        telefono: f.telefono || null,
        email: f.email || null,
        contacto: f.contacto || null,
        direccion: f.direccion || null,
        activo: f.activo,
      };
      const r = e ? await supabase.from("proveedores").update(fila).eq("id", e.id) : await supabase.from("proveedores").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Proveedor guardado");
      void qc.invalidateQueries({ queryKey: ["proveedores", sistemaId] });
      setEditar(null);
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  const escribir = puedeEscribir.compras(roles);

  return (
    <Tarjeta className="overflow-hidden">
      {escribir && (
        <div className="flex justify-end border-b border-borde p-3">
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nuevo")}>
            Nuevo proveedor
          </Boton>
        </div>
      )}
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<Truck />} titulo="Sin proveedores" />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((p) => (
            <li key={p.id} className={cn("group flex items-center gap-4 px-5 py-3 text-sm", !p.activo && "opacity-50")}>
              <span className="grid size-8 place-items-center rounded-lg bg-marca-suave text-marca">
                <Truck className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.nombre}</span>
                <span className="block text-xs text-texto-3">{[p.rnc && `RNC ${p.rnc}`, p.contacto, p.telefono].filter(Boolean).join(" · ")}</span>
              </span>
              {!p.activo && <Insignia>Inactivo</Insignia>}
              {escribir && (
                <button onClick={() => setEditar(p)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2">
                  <Pencil className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        abierto={!!editar}
        onCerrar={() => setEditar(null)}
        titulo={e ? "Editar proveedor" : "Nuevo proveedor"}
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
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Nombre o razón social" contenedor="col-span-2" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} />
          <Entrada etiqueta="RNC" value={f.rnc} onChange={(x) => setF({ ...f, rnc: x.target.value })} />
          <Entrada etiqueta="Teléfono" value={f.telefono} onChange={(x) => setF({ ...f, telefono: x.target.value })} />
          <Entrada etiqueta="Correo" value={f.email} onChange={(x) => setF({ ...f, email: x.target.value })} />
          <Entrada etiqueta="Persona de contacto" value={f.contacto} onChange={(x) => setF({ ...f, contacto: x.target.value })} />
          <Entrada etiqueta="Dirección" contenedor="col-span-2" value={f.direccion} onChange={(x) => setF({ ...f, direccion: x.target.value })} />
          {e && <Interruptor activo={f.activo} onChange={(v) => setF({ ...f, activo: v })} etiqueta="Activo" />}
        </div>
      </Modal>
    </Tarjeta>
  );
}
