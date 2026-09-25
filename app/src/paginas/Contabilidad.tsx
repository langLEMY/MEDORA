import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenCheck, ChevronDown, FileDown, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { SelectorCuenta } from "@/components/SelectorCuenta";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { CATEGORIAS_SERVICIO, TIPOS_NCF, useCuentas, type CuentaContable } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

type Vista = "diario" | "balanza" | "catalogo" | "configuracion" | "ncf";

export default function Contabilidad() {
  const [vista, setVista] = useState<Vista>("diario");
  return (
    <>
      <EncabezadoPagina
        titulo="Contabilidad"
        descripcion="Cobros, anticipos, abonos, compras, comisiones y nómina generan sus asientos automáticamente."
      />
      <div className="mb-4">
        <Segmentado
          id="contabilidad"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "diario", etiqueta: "Libro diario" },
            { valor: "balanza", etiqueta: "Balanza" },
            { valor: "catalogo", etiqueta: "Catálogo de cuentas" },
            { valor: "configuracion", etiqueta: "Cuentas por concepto" },
            { valor: "ncf", etiqueta: "Comprobantes fiscales" },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {vista === "diario" && <LibroDiario />}
          {vista === "balanza" && <Balanza />}
          {vista === "catalogo" && <Catalogo />}
          {vista === "configuracion" && <Configuracion />}
          {vista === "ncf" && <Ncf />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

const ORIGENES: Record<string, string> = {
  manual: "Manual",
  cobro: "Cobro",
  anulacion: "Anulación",
  anticipo: "Anticipo",
  abono: "Abono",
  compra: "Compra",
  nomina: "Nómina",
  comision: "Comisiones",
  reverso: "Reverso",
};

interface Asiento {
  id: string;
  numero: number;
  fecha: string;
  concepto: string;
  origen: string;
  lineas: { cuenta_codigo: string; debe: number; haber: number; descripcion: string | null }[];
}

function LibroDiario() {
  const { sistema, sistemaId, roles } = useSistema();
  const cuentas = useCuentas(sistemaId);
  const hoy = new Date();
  const [desde, setDesde] = useState(isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDia());
  const [origen, setOrigen] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [pdf, setPdf] = useState(false);

  const q = useQuery({
    queryKey: ["libro-diario", sistemaId, desde, hasta, origen],
    queryFn: async () => {
      let c = supabase
        .from("asientos")
        .select("id, numero, fecha, concepto, origen, lineas:asiento_lineas(cuenta_codigo, debe, haber, descripcion)")
        .eq("sistema_id", sistemaId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .order("numero", { ascending: false })
        .limit(300);
      if (origen) c = c.eq("origen", origen);
      return datos(await c) as unknown as Asiento[];
    },
  });

  const nombre = (c: string) => cuentas.data?.find((x) => x.codigo === c)?.nombre ?? "";
  const $ = (v: number) => moneda(v, sistema.moneda);

  return (
    <>
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-3">
          <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} contenedor="w-40" />
          <Entrada etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} contenedor="w-40" />
          <Selector etiqueta="Origen" value={origen} onChange={(e) => setOrigen(e.target.value)} contenedor="w-40">
            <option value="">Todos</option>
            {Object.entries(ORIGENES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selector>
          <div className="ml-auto flex gap-2">
            <Boton variante="secundario" icono={<FileDown className="size-4" />} onClick={() => setPdf(true)} disabled={!q.data?.length}>
              PDF
            </Boton>
            {puedeEscribir.contabilidad(roles) && (
              <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>
                Asiento manual
              </Boton>
            )}
          </div>
        </div>
        {q.isLoading ? (
          <FilasEsqueleto />
        ) : (q.data?.length ?? 0) === 0 ? (
          <Vacio icono={<BookOpenCheck />} titulo="Sin asientos en el período" />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data!.map((a) => {
              const total = a.lineas.reduce((s, l) => s + Number(l.debe), 0);
              const exp = abierto === a.id;
              return (
                <li key={a.id}>
                  <button onClick={() => setAbierto(exp ? null : a.id)} className="flex w-full items-center gap-4 px-5 py-3 text-left text-sm transition-colors hover:bg-superficie-2/60">
                    <span className="w-14 font-mono text-xs text-texto-3 tabular">#{a.numero}</span>
                    <span className="w-28 whitespace-nowrap text-texto-2">{fecha(a.fecha + "T00:00:00")}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{a.concepto}</span>
                    <Insignia tono={a.origen === "manual" ? "violeta" : a.origen === "reverso" ? "peligro" : "neutro"}>{ORIGENES[a.origen]}</Insignia>
                    <span className="w-32 text-right font-semibold tabular">{$(total)}</span>
                    <ChevronDown className={cn("size-4 text-texto-3 transition-transform duration-200", exp && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {exp && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden"
                      >
                        <table className="mx-5 mb-4 w-[calc(100%-2.5rem)] rounded-xl bg-superficie-2/60 text-[13px]">
                          <tbody>
                            {[...a.lineas]
                              .sort((x, y) => Number(y.debe) - Number(x.debe))
                              .map((l, i) => (
                                <tr key={i} className="border-b border-borde/60 last:border-0">
                                  <td className={cn("px-4 py-2", Number(l.haber) > 0 && "pl-10")}>
                                    <span className="font-mono text-xs text-texto-3">{l.cuenta_codigo}</span> {nombre(l.cuenta_codigo)}
                                    {l.descripcion && <span className="ml-2 text-xs text-texto-3">· {l.descripcion}</span>}
                                  </td>
                                  <td className="w-32 px-4 py-2 text-right tabular">{Number(l.debe) ? $(l.debe) : ""}</td>
                                  <td className="w-32 px-4 py-2 text-right tabular">{Number(l.haber) ? $(l.haber) : ""}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
      <AsientoManual abierto={nuevo} onCerrar={() => setNuevo(false)} />
      <Documento abierto={pdf} onCerrar={() => setPdf(false)} titulo="Libro diario" nombreArchivo={`Libro diario ${desde} a ${hasta}`}>
        <EncabezadoDocumento titulo="Libro diario" subtitulo={`${fecha(desde + "T00:00:00")} – ${fecha(hasta + "T00:00:00")}`} />
        <TablaDocumento
          encabezados={["Fecha", "No.", "Cuenta / concepto", "Debe", "Haber"]}
          filas={[...(q.data ?? [])].reverse().flatMap((a) => [
            [fecha(a.fecha + "T00:00:00"), `#${a.numero}`, <b key="c">{a.concepto}</b>, "", ""],
            ...a.lineas.map((l) => ["", "", `   ${l.cuenta_codigo} ${nombre(l.cuenta_codigo)}`, Number(l.debe) ? $(l.debe) : "", Number(l.haber) ? $(l.haber) : ""]),
          ])}
          pie={[
            "",
            "",
            "Totales",
            $((q.data ?? []).flatMap((a) => a.lineas).reduce((s, l) => s + Number(l.debe), 0)),
            $((q.data ?? []).flatMap((a) => a.lineas).reduce((s, l) => s + Number(l.haber), 0)),
          ]}
        />
      </Documento>
    </>
  );
}

interface LineaManual {
  clave: number;
  cuenta: string;
  debe: string;
  haber: string;
  descripcion: string;
}

function AsientoManual({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const qc = useQueryClient();
  const nueva = (): LineaManual => ({ clave: Date.now() + Math.random(), cuenta: "", debe: "", haber: "", descripcion: "" });
  const [fechaA, setFechaA] = useState(isoDia());
  const [concepto, setConcepto] = useState("");
  const [lineas, setLineas] = useState<LineaManual[]>([nueva(), nueva()]);

  useEffect(() => {
    if (!abierto) return;
    setFechaA(isoDia());
    setConcepto("");
    setLineas([nueva(), nueva()]);
  }, [abierto]);

  const debe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
  const haber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
  const cuadra = Math.abs(debe - haber) < 0.005 && debe > 0;
  const set = (c: number, x: Partial<LineaManual>) => setLineas((ls) => ls.map((l) => (l.clave === c ? { ...l, ...x } : l)));

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_asiento_manual", {
          p_sistema: sistemaId,
          p_fecha: fechaA,
          p_concepto: concepto,
          p_lineas: lineas
            .filter((l) => l.cuenta && (Number(l.debe) || Number(l.haber)))
            .map((l) => ({ cuenta: l.cuenta, debe: Number(l.debe) || 0, haber: Number(l.haber) || 0, descripcion: l.descripcion || null })),
        }),
      ),
    onSuccess: () => {
      toast.success("Asiento registrado");
      void qc.invalidateQueries({ queryKey: ["libro-diario", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="xl"
      titulo="Asiento manual"
      descripcion="Solo cuentas que aceptan movimiento. Debe cuadrar para guardarse."
      pie={
        <>
          <span className={cn("mr-auto text-sm font-medium", cuadra ? "text-exito" : "text-aviso")}>
            {cuadra ? "Cuadrado" : `Diferencia: ${moneda(Math.abs(debe - haber), sistema.moneda)}`}
          </span>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!cuadra || concepto.trim().length < 3} onClick={() => m.mutate()}>
            Registrar asiento
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[180px_1fr] gap-4">
          <Entrada etiqueta="Fecha" type="date" value={fechaA} onChange={(e) => setFechaA(e.target.value)} />
          <Entrada etiqueta="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Depósito de efectivo al banco" />
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_150px_130px_130px_36px] gap-2 px-1 text-[11px] font-medium tracking-wide text-texto-3 uppercase">
            <span>Cuenta</span>
            <span>Descripción</span>
            <span className="text-right">Debe</span>
            <span className="text-right">Haber</span>
            <span />
          </div>
          {lineas.map((l) => (
            <div key={l.clave} className="grid grid-cols-[1fr_150px_130px_130px_36px] items-center gap-2">
              <SelectorCuenta valor={l.cuenta || null} onChange={(cuenta) => set(l.clave, { cuenta })} />
              <input value={l.descripcion} onChange={(e) => set(l.clave, { descripcion: e.target.value })} className="h-9 rounded-[10px] border border-borde bg-superficie px-2 text-sm" />
              <input
                type="number"
                min={0}
                step="0.01"
                value={l.debe}
                onChange={(e) => set(l.clave, { debe: e.target.value, haber: e.target.value ? "" : l.haber })}
                className="h-9 rounded-[10px] border border-borde bg-superficie px-2 text-right text-sm tabular"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={l.haber}
                onChange={(e) => set(l.clave, { haber: e.target.value, debe: e.target.value ? "" : l.debe })}
                className="h-9 rounded-[10px] border border-borde bg-superficie px-2 text-right text-sm tabular"
              />
              <button
                onClick={() => setLineas((x) => (x.length > 2 ? x.filter((y) => y.clave !== l.clave) : x))}
                className="grid size-9 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <Boton variante="fantasma" tamano="sm" icono={<Plus className="size-3.5" />} onClick={() => setLineas((x) => [...x, nueva()])}>
            Agregar línea
          </Boton>
        </div>
        <div className="flex justify-end gap-8 border-t border-borde pt-3 text-sm font-semibold tabular">
          <span>Debe {moneda(debe, sistema.moneda)}</span>
          <span>Haber {moneda(haber, sistema.moneda)}</span>
        </div>
      </div>
    </Modal>
  );
}

function Balanza() {
  const { sistema, sistemaId } = useSistema();
  const hoy = new Date();
  const [desde, setDesde] = useState(isoDia(new Date(hoy.getFullYear(), 0, 1)));
  const [hasta, setHasta] = useState(isoDia());
  const [pdf, setPdf] = useState(false);
  const q = useQuery({
    queryKey: ["balanza", sistemaId, desde, hasta],
    queryFn: async () => datos(await supabase.rpc("balanza_comprobacion", { p_sistema: sistemaId, p_desde: desde, p_hasta: hasta })) ?? [],
  });
  const $ = (v: number) => moneda(v, sistema.moneda);
  const filas = q.data ?? [];
  const td = filas.reduce((s, f) => s + Number(f.debe), 0);
  const th = filas.reduce((s, f) => s + Number(f.haber), 0);
  const res = (tipo: string[]) => filas.filter((f) => tipo.includes(f.tipo)).reduce((s, f) => s + Number(f.saldo), 0);
  const utilidad = res(["ingreso"]) - res(["costo", "gasto"]);

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Ingresos", res(["ingreso"])],
            ["Costos y gastos", res(["costo", "gasto"])],
            ["Resultado del período", utilidad],
          ] as const
        ).map(([k, v]) => (
          <Tarjeta key={k} className="p-5">
            <p className="text-[13px] text-texto-2">{k}</p>
            <p className={cn("mt-2 text-2xl font-semibold tracking-[-0.02em] tabular", k.startsWith("Resultado") && (v < 0 ? "text-peligro" : "text-exito"))}>{$(v)}</p>
          </Tarjeta>
        ))}
      </div>
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-3">
          <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} contenedor="w-40" />
          <Entrada etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} contenedor="w-40" />
          <Boton className="ml-auto" variante="secundario" icono={<FileDown className="size-4" />} onClick={() => setPdf(true)} disabled={!filas.length}>
            PDF
          </Boton>
        </div>
        {q.isLoading ? (
          <FilasEsqueleto />
        ) : filas.length === 0 ? (
          <Vacio icono={<BookOpenCheck />} titulo="Sin movimientos en el período" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2/60 text-left text-[11px] tracking-wide text-texto-3 uppercase">
                <th className="px-5 py-2 font-medium">Cuenta</th>
                <th className="px-5 py-2 text-right font-medium">Debe</th>
                <th className="px-5 py-2 text-right font-medium">Haber</th>
                <th className="px-5 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.codigo} className="border-b border-borde/60">
                  <td className="px-5 py-2">
                    <span className="font-mono text-xs text-texto-3">{f.codigo}</span> {f.nombre}
                  </td>
                  <td className="px-5 py-2 text-right tabular">{$(f.debe)}</td>
                  <td className="px-5 py-2 text-right tabular">{$(f.haber)}</td>
                  <td className="px-5 py-2 text-right font-medium tabular">{$(f.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-5 py-3">Totales {Math.abs(td - th) < 0.005 ? <Insignia tono="exito">Cuadra</Insignia> : <Insignia tono="peligro">Descuadre</Insignia>}</td>
                <td className="px-5 py-3 text-right tabular">{$(td)}</td>
                <td className="px-5 py-3 text-right tabular">{$(th)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Tarjeta>
      <Documento abierto={pdf} onCerrar={() => setPdf(false)} titulo="Balanza de comprobación" nombreArchivo={`Balanza ${desde} a ${hasta}`}>
        <EncabezadoDocumento titulo="Balanza de comprobación" subtitulo={`${fecha(desde + "T00:00:00")} – ${fecha(hasta + "T00:00:00")}`} />
        <TablaDocumento
          encabezados={["Código", "Cuenta", "Debe", "Haber", "Saldo"]}
          filas={filas.map((f) => [f.codigo, f.nombre, $(f.debe), $(f.haber), $(f.saldo)])}
          pie={["", "Totales", $(td), $(th), ""]}
        />
        <p className="mt-4 text-right font-semibold">Resultado del período: {$(utilidad)}</p>
      </Documento>
    </>
  );
}

function Catalogo() {
  const { sistemaId, roles } = useSistema();
  const cuentas = useCuentas(sistemaId);
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [editar, setEditar] = useState<CuentaContable | "nueva" | null>(null);
  const escribir = puedeEscribir.contabilidad(roles);

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (cuentas.data ?? []).filter((c) => !t || c.codigo.startsWith(t) || c.nombre.toLowerCase().includes(t));
  }, [cuentas.data, texto]);

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-borde p-3">
        <Entrada icono={<Search />} placeholder="Buscar por código o nombre…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="w-80" />
        {escribir && (
          <Boton className="ml-auto" icono={<Plus className="size-4" />} onClick={() => setEditar("nueva")}>
            Nueva cuenta
          </Boton>
        )}
      </div>
      {cuentas.isLoading ? (
        <FilasEsqueleto />
      ) : (
        <ul className="max-h-[60vh] divide-y divide-borde overflow-y-auto">
          {lista.map((c) => {
            const nivel = c.codigo.split(".").length - 1;
            return (
              <li key={c.codigo} className={cn("group flex items-center gap-3 px-5 py-2 text-sm", !c.activo && "opacity-50")}>
                <span className="font-mono text-xs text-texto-3 tabular" style={{ paddingLeft: nivel * 16, width: 110 }}>
                  {c.codigo}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", !c.acepta_movimiento && "font-semibold")}>{c.nombre}</span>
                <span className="text-xs text-texto-3 capitalize">{c.tipo}</span>
                {!c.acepta_movimiento && <Insignia>Agrupación</Insignia>}
                {escribir && (
                  <button onClick={() => setEditar(c)} className="grid size-7 place-items-center rounded-md text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2">
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FormCuenta cuenta={editar} onCerrar={() => setEditar(null)} onListo={() => void qc.invalidateQueries({ queryKey: ["cuentas", sistemaId] })} />
    </Tarjeta>
  );
}

function FormCuenta({ cuenta, onCerrar, onListo }: { cuenta: CuentaContable | "nueva" | null; onCerrar: () => void; onListo: () => void }) {
  const { sistemaId } = useSistema();
  const e = cuenta && cuenta !== "nueva" ? cuenta : null;
  const [f, setF] = useState({ codigo: "", nombre: "", tipo: "gasto", padre_codigo: "", acepta_movimiento: true, activo: true });
  useEffect(() => {
    if (!cuenta) return;
    setF(
      e
        ? { codigo: e.codigo, nombre: e.nombre, tipo: e.tipo, padre_codigo: e.padre_codigo ?? "", acepta_movimiento: e.acepta_movimiento, activo: e.activo }
        : { codigo: "", nombre: "", tipo: "gasto", padre_codigo: "", acepta_movimiento: true, activo: true },
    );
  }, [cuenta, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = { codigo: f.codigo.trim(), nombre: f.nombre.trim(), tipo: f.tipo, padre_codigo: f.padre_codigo || null, acepta_movimiento: f.acepta_movimiento, activo: f.activo };
      const r = e
        ? await supabase.from("cuentas_contables").update(fila).eq("sistema_id", sistemaId).eq("codigo", e.codigo)
        : await supabase.from("cuentas_contables").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Cuenta guardada");
      onListo();
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Modal
      abierto={!!cuenta}
      onCerrar={onCerrar}
      titulo={e ? "Editar cuenta" : "Nueva cuenta"}
      descripcion={e ? "Si cambias el código, se actualiza en todos los asientos existentes." : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!/^[0-9]+(\.[0-9]+)*$/.test(f.codigo) || f.nombre.trim().length < 2} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Entrada etiqueta="Código" placeholder="6.2.05" value={f.codigo} onChange={(x) => setF({ ...f, codigo: x.target.value })} />
        <Selector etiqueta="Tipo" value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })}>
          {["activo", "pasivo", "patrimonio", "ingreso", "costo", "gasto"].map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Nombre" contenedor="col-span-2" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} />
        <div className="col-span-2">
          <SelectorCuenta etiqueta="Cuenta padre (opcional)" valor={f.padre_codigo || null} onChange={(padre_codigo) => setF({ ...f, padre_codigo })} soloMovimiento={false} />
        </div>
        <Interruptor activo={f.acepta_movimiento} onChange={(v) => setF({ ...f, acepta_movimiento: v })} etiqueta="Acepta movimiento" />
        {e && <Interruptor activo={f.activo} onChange={(v) => setF({ ...f, activo: v })} etiqueta="Activa" />}
      </div>
    </Modal>
  );
}

const CONCEPTOS: { clave: string; etiqueta: string; grupo: string }[] = [
  ...Object.entries(CATEGORIAS_SERVICIO).map(([k, v]) => ({ clave: `ingreso_${k}`, etiqueta: `Ingresos · ${v}`, grupo: "Ingresos por categoría de servicio" })),
  { clave: "caja", etiqueta: "Caja (efectivo)", grupo: "Cobros y pagos" },
  { clave: "banco", etiqueta: "Banco (tarjeta, transferencia, cheque)", grupo: "Cobros y pagos" },
  { clave: "cxc_pacientes", etiqueta: "Cuentas por cobrar a pacientes", grupo: "Cobros y pagos" },
  { clave: "cxc_aseguradoras", etiqueta: "Cuentas por cobrar a ARS", grupo: "Cobros y pagos" },
  { clave: "anticipos_pacientes", etiqueta: "Anticipos de pacientes", grupo: "Cobros y pagos" },
  { clave: "descuentos", etiqueta: "Descuentos concedidos", grupo: "Cobros y pagos" },
  { clave: "inventario", etiqueta: "Inventario", grupo: "Compras" },
  { clave: "itbis_compras", etiqueta: "ITBIS pagado en compras", grupo: "Compras" },
  { clave: "cxp", etiqueta: "Cuentas por pagar a proveedores", grupo: "Compras" },
  { clave: "gasto_general", etiqueta: "Gasto general (predeterminado)", grupo: "Compras" },
  { clave: "gasto_comisiones", etiqueta: "Gasto de comisiones", grupo: "Comisiones" },
  { clave: "comisiones_por_pagar", etiqueta: "Comisiones por pagar", grupo: "Comisiones" },
  { clave: "gasto_sueldos", etiqueta: "Sueldos y salarios", grupo: "Nómina" },
  { clave: "gasto_aportes", etiqueta: "Aportes patronales", grupo: "Nómina" },
  { clave: "retenciones_tss", etiqueta: "Retenciones TSS por pagar", grupo: "Nómina" },
  { clave: "isr_por_pagar", etiqueta: "ISR retenido por pagar", grupo: "Nómina" },
  { clave: "otras_retenciones", etiqueta: "Otras retenciones", grupo: "Nómina" },
  { clave: "aportes_por_pagar", etiqueta: "Aportes patronales por pagar", grupo: "Nómina" },
  { clave: "sueldos_por_pagar", etiqueta: "Sueldos por pagar (neto)", grupo: "Nómina" },
];

function Configuracion() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cuentas-predeterminadas", sistemaId],
    queryFn: async () => datos(await supabase.from("cuentas_predeterminadas").select("clave, cuenta_codigo").eq("sistema_id", sistemaId)),
  });
  const m = useMutation({
    mutationFn: async ({ clave, cuenta }: { clave: string; cuenta: string }) => {
      const { error } = await supabase.from("cuentas_predeterminadas").upsert({ sistema_id: sistemaId, clave, cuenta_codigo: cuenta });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cuenta asignada");
      void qc.invalidateQueries({ queryKey: ["cuentas-predeterminadas", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const valor = (clave: string) => q.data?.find((x) => x.clave === clave)?.cuenta_codigo ?? null;
  const grupos = [...new Set(CONCEPTOS.map((c) => c.grupo))];
  const editable = puedeEscribir.contabilidad(roles);

  if (q.isLoading) return <Esqueleto className="h-80 rounded-2xl" />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {grupos.map((g) => (
        <Tarjeta key={g} className="p-5">
          <h2 className="mb-1 text-[15px] font-semibold">{g}</h2>
          {g.startsWith("Ingresos") && <p className="mb-3 text-xs text-texto-3">Cada cobro acredita el ingreso a la cuenta de la categoría del servicio.</p>}
          <div className="space-y-3">
            {CONCEPTOS.filter((c) => c.grupo === g).map((c) => (
              <div key={c.clave} className="grid grid-cols-[1fr_1.3fr] items-center gap-3">
                <span className="text-sm text-texto-2">{c.etiqueta}</span>
                {editable ? (
                  <SelectorCuenta compacto valor={valor(c.clave)} onChange={(cuenta) => m.mutate({ clave: c.clave, cuenta })} />
                ) : (
                  <span className="font-mono text-sm">{valor(c.clave) ?? "—"}</span>
                )}
              </div>
            ))}
          </div>
        </Tarjeta>
      ))}
    </div>
  );
}

function Ncf() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Fila<"secuencias_ncf"> | "nueva" | null>(null);
  const q = useQuery({
    queryKey: ["secuencias-ncf", sistemaId],
    queryFn: async () => datos(await supabase.from("secuencias_ncf").select("*").eq("sistema_id", sistemaId).order("tipo").order("creado_en", { ascending: false })),
  });
  const e = editar && editar !== "nueva" ? editar : null;
  const [f, setF] = useState({ tipo: "B02", desde: "1", hasta: "", siguiente: "1", vence_en: "", activo: true });
  useEffect(() => {
    if (!editar) return;
    setF(
      e
        ? { tipo: e.tipo, desde: String(e.desde), hasta: String(e.hasta), siguiente: String(e.siguiente), vence_en: e.vence_en ?? "", activo: e.activo }
        : { tipo: "B02", desde: "1", hasta: "", siguiente: "1", vence_en: "", activo: true },
    );
  }, [editar, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = { tipo: f.tipo, desde: Number(f.desde), hasta: Number(f.hasta), siguiente: Number(f.siguiente), vence_en: f.vence_en || null, activo: f.activo };
      const r = e ? await supabase.from("secuencias_ncf").update(fila).eq("id", e.id) : await supabase.from("secuencias_ncf").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Secuencia guardada");
      void qc.invalidateQueries({ queryKey: ["secuencias-ncf", sistemaId] });
      setEditar(null);
    },
    onError: (err) => toast.error(mensajeError(err)),
  });
  const escribir = puedeEscribir.contabilidad(roles);

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-borde p-3">
        <p className="text-xs text-texto-3">Rangos autorizados por la DGII. Solo una secuencia activa por tipo.</p>
        {escribir && (
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nueva")}>
            Nueva secuencia
          </Boton>
        )}
      </div>
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<Receipt />} titulo="Sin secuencias de NCF" descripcion="Registra el rango autorizado (p. ej. B02 del 1 al 500) para emitir facturas con comprobante fiscal." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((s) => {
            const usados = Number(s.siguiente) - Number(s.desde);
            const total = Number(s.hasta) - Number(s.desde) + 1;
            const pct = Math.min(100, (usados / total) * 100);
            const vencida = s.vence_en && s.vence_en < isoDia();
            return (
              <li key={s.id} className={cn("group flex items-center gap-4 px-5 py-3.5 text-sm", !s.activo && "opacity-50")}>
                <span className="w-44 font-medium">{TIPOS_NCF[s.tipo]}</span>
                <span className="font-mono text-xs text-texto-2">
                  {s.tipo}
                  {String(s.desde).padStart(8, "0")} → {s.tipo}
                  {String(s.hasta).padStart(8, "0")}
                </span>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs text-texto-3">
                    <span>
                      {usados} de {total} usados
                    </span>
                    {s.vence_en && <span className={cn(vencida && "text-peligro")}>Vence {fecha(s.vence_en + "T00:00:00")}</span>}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
                    <motion.div
                      className={cn("h-full rounded-full", pct > 90 ? "bg-peligro" : pct > 70 ? "bg-aviso" : "bg-marca")}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: "spring", duration: 0.8, bounce: 0 }}
                    />
                  </div>
                </div>
                {s.activo ? <Insignia tono="exito">Activa</Insignia> : <Insignia>Inactiva</Insignia>}
                {escribir && (
                  <button onClick={() => setEditar(s)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2">
                    <Pencil className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        abierto={!!editar}
        onCerrar={() => setEditar(null)}
        titulo={e ? "Editar secuencia" : "Nueva secuencia de NCF"}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setEditar(null)}>
              Cancelar
            </Boton>
            <Boton cargando={m.isPending} disabled={!(Number(f.hasta) >= Number(f.desde))} onClick={() => m.mutate()}>
              Guardar
            </Boton>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Tipo de comprobante" value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })} disabled={!!e}>
            {Object.entries(TIPOS_NCF).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selector>
          <Entrada etiqueta="Vence" type="date" value={f.vence_en} onChange={(x) => setF({ ...f, vence_en: x.target.value })} />
          <Entrada etiqueta="Desde" type="number" min={1} value={f.desde} onChange={(x) => setF({ ...f, desde: x.target.value, siguiente: e ? f.siguiente : x.target.value })} />
          <Entrada etiqueta="Hasta" type="number" min={1} value={f.hasta} onChange={(x) => setF({ ...f, hasta: x.target.value })} />
          <Entrada etiqueta="Próximo a emitir" type="number" min={1} value={f.siguiente} onChange={(x) => setF({ ...f, siguiente: x.target.value })} />
          <div className="flex items-end pb-2">
            <Interruptor activo={f.activo} onChange={(activo) => setF({ ...f, activo })} etiqueta="Activa" />
          </div>
        </div>
      </Modal>
    </Tarjeta>
  );
}
