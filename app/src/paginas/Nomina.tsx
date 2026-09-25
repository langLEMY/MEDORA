import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { BookCheck, CheckCircle2, FileDown, Pencil, Plus, Trash2, UserPlus, Users, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, Esqueleto, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { usePersonal } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { IMPORTACIONES } from "@/lib/importaciones";

type Vista = "nominas" | "empleados" | "parametros";

export default function Nomina() {
  const [vista, setVista] = useState<Vista>("nominas");
  return (
    <>
      <EncabezadoPagina titulo="Nómina" descripcion="Retenciones de ley (AFP, SFS, ISR), aportes patronales y contabilización con vista previa." />
      <div className="mb-4">
        <Segmentado
          id="nomina"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "nominas", etiqueta: "Nóminas" },
            { valor: "empleados", etiqueta: "Empleados" },
            { valor: "parametros", etiqueta: "Parámetros TSS / ISR" },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {vista === "nominas" && <Nominas />}
          {vista === "empleados" && <Empleados />}
          {vista === "parametros" && <Parametros />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
interface Linea {
  id: string;
  salario: number;
  horas_extra: number;
  bonos: number;
  otros_ingresos: number;
  bruto: number;
  afp: number;
  sfs: number;
  isr: number;
  otras_deducciones: number;
  neto: number;
  afp_patronal: number;
  sfs_patronal: number;
  srl_patronal: number;
  infotep: number;
  empleado: { nombres: string; apellidos: string; cedula: string | null; cargo: string | null; banco: string | null; cuenta_bancaria: string | null } | null;
}

function Nominas() {
  const { sistema, sistemaId, roles } = useSistema();
  const [generar, setGenerar] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["nominas", sistemaId],
    queryFn: async () =>
      datos(
        await supabase
          .from("nominas")
          .select("id, numero, descripcion, desde, hasta, frecuencia, estado, aprobada_en, lineas:nomina_lineas(neto, bruto)")
          .eq("sistema_id", sistemaId)
          .order("desde", { ascending: false }),
      ),
  });
  const escribir = puedeEscribir.nomina(roles);
  return (
    <>
      <Tarjeta className="overflow-hidden">
        {escribir && (
          <div className="flex justify-end border-b border-borde p-3">
            <Boton icono={<Plus className="size-4" />} onClick={() => setGenerar(true)}>
              Generar nómina
            </Boton>
          </div>
        )}
        {q.isLoading ? (
          <FilasEsqueleto />
        ) : (q.data?.length ?? 0) === 0 ? (
          <Vacio icono={<WalletCards />} titulo="Sin nóminas" descripcion="Registra los empleados y genera la nómina del período." />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {q.data!.map((n) => (
              <motion.li key={n.id} variants={itemEscalonado}>
                <button onClick={() => setAbierta(n.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-sm transition-colors hover:bg-superficie-2/60">
                  <span className="w-24 font-medium tabular">{n.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.descripcion}</span>
                    <span className="block text-xs text-texto-3">
                      {fecha(n.desde + "T00:00:00")} – {fecha(n.hasta + "T00:00:00")} · {n.frecuencia} · {n.lineas.length} empleados
                    </span>
                  </span>
                  <Insignia tono={n.estado === "aprobada" ? "exito" : "aviso"} punto>
                    {n.estado === "aprobada" ? "Aprobada" : "Borrador"}
                  </Insignia>
                  <span className="w-36 text-right tabular">
                    <span className="block text-[11px] text-texto-3">Neto a pagar</span>
                    <span className="font-semibold">{moneda(n.lineas.reduce((s, l) => s + Number(l.neto), 0), sistema.moneda)}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>
      <GenerarNomina abierto={generar} onCerrar={() => setGenerar(false)} onCreada={setAbierta} />
      <DetalleNomina id={abierta} onCerrar={() => setAbierta(null)} />
    </>
  );
}

function GenerarNomina({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: (id: string) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const hoy = new Date();
  const [frecuencia, setFrecuencia] = useState<"mensual" | "quincenal">("mensual");
  const [desde, setDesde] = useState(isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDia(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)));
  const [descripcion, setDescripcion] = useState("");

  useEffect(() => {
    const d = new Date(desde + "T00:00:00");
    if (frecuencia === "mensual") setHasta(isoDia(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    else setHasta(isoDia(d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth(), 15) : new Date(d.getFullYear(), d.getMonth() + 1, 0)));
  }, [desde, frecuencia]);

  const m = useMutation({
    mutationFn: async () =>
      datos(await supabase.rpc("generar_nomina", { p_sistema: sistemaId, p_desde: desde, p_hasta: hasta, p_frecuencia: frecuencia, p_descripcion: descripcion || undefined })) as string,
    onSuccess: (id) => {
      toast.success("Nómina generada en borrador");
      void qc.invalidateQueries({ queryKey: ["nominas", sistemaId] });
      onCerrar();
      onCreada(id);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Generar nómina"
      descripcion="Incluye a los empleados activos con esa frecuencia de pago."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} onClick={() => m.mutate()}>
            Generar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          id="frecuencia"
          valor={frecuencia}
          onChange={setFrecuencia}
          opciones={[
            { valor: "mensual", etiqueta: "Mensual" },
            { valor: "quincenal", etiqueta: "Quincenal" },
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Entrada etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Entrada etiqueta="Descripción (opcional)" placeholder="Nómina septiembre 2026" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
    </Modal>
  );
}

function DetalleNomina({ id, onCerrar }: { id: string | null; onCerrar: () => void }) {
  const { sistema, sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [preview, setPreview] = useState(false);
  const [volantes, setVolantes] = useState(false);
  const [resumen, setResumen] = useState(false);

  const q = useQuery({
    queryKey: ["nomina", sistemaId, id],
    enabled: !!id,
    queryFn: async () => {
      const n = datos(await supabase.from("nominas").select("*").eq("id", id!).single());
      const lineas = datos(
        await supabase
          .from("nomina_lineas")
          .select("*, empleado:empleados!nomina_lineas_sistema_id_empleado_id_fkey(nombres, apellidos, cedula, cargo, banco, cuenta_bancaria)")
          .eq("nomina_id", id!)
          .order("bruto", { ascending: false }),
      ) as unknown as Linea[];
      return { n, lineas };
    },
  });

  const asiento = useQuery({
    queryKey: ["nomina-asiento", id],
    enabled: preview && !!id,
    queryFn: async () =>
      (datos(await supabase.rpc("vista_previa_asiento_nomina", { p_nomina: id! })) ?? []) as { cuenta: string; nombre: string; descripcion: string; debe?: number; haber?: number }[],
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["nomina", sistemaId, id] });
    void qc.invalidateQueries({ queryKey: ["nominas", sistemaId] });
    void qc.invalidateQueries({ queryKey: ["nomina-asiento", id] });
  };

  const actualizar = useMutation({
    mutationFn: async (l: Linea) =>
      datos(
        await supabase.rpc("actualizar_linea_nomina", {
          p_linea: l.id,
          p_horas_extra: Number(l.horas_extra) || 0,
          p_bonos: Number(l.bonos) || 0,
          p_otros_ingresos: Number(l.otros_ingresos) || 0,
          p_otras_deducciones: Number(l.otras_deducciones) || 0,
        }),
      ),
    onSuccess: refrescar,
    onError: (e) => toast.error(mensajeError(e)),
  });
  const aprobar = useMutation({
    mutationFn: async () => datos(await supabase.rpc("aprobar_nomina", { p_nomina: id! })),
    onSuccess: () => {
      toast.success("Nómina aprobada y contabilizada");
      setPreview(false);
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const eliminar = useMutation({
    mutationFn: async () => datos(await supabase.rpc("eliminar_nomina_borrador", { p_nomina: id! })),
    onSuccess: () => {
      toast.success("Borrador eliminado");
      void qc.invalidateQueries({ queryKey: ["nominas", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const n = q.data?.n;
  const lineas = q.data?.lineas ?? [];
  const borrador = n?.estado === "borrador" && puedeEscribir.nomina(roles);
  const suma = (k: keyof Linea) => lineas.reduce((s, l) => s + Number(l[k] ?? 0), 0);
  const $ = (v: number) => moneda(v, sistema.moneda);

  return (
    <>
      <Modal
        abierto={!!id}
        onCerrar={onCerrar}
        ancho="xl"
        titulo={n ? `${n.numero} · ${n.descripcion}` : "Nómina"}
        descripcion={n ? `${fecha(n.desde + "T00:00:00")} – ${fecha(n.hasta + "T00:00:00")} · ${n.estado === "aprobada" ? "Aprobada (solo lectura)" : "Borrador: edita horas extra, bonos y deducciones"}` : undefined}
        pie={
          <>
            {borrador && (
              <Boton variante="fantasma" className="mr-auto text-peligro" icono={<Trash2 className="size-4" />} cargando={eliminar.isPending} onClick={() => eliminar.mutate()}>
                Eliminar borrador
              </Boton>
            )}
            <Boton variante="secundario" icono={<FileDown className="size-4" />} onClick={() => setResumen(true)} disabled={!lineas.length}>
              Resumen PDF
            </Boton>
            <Boton variante="secundario" icono={<FileDown className="size-4" />} onClick={() => setVolantes(true)} disabled={!lineas.length}>
              Volantes de pago
            </Boton>
            <Boton icono={<BookCheck className="size-4" />} onClick={() => setPreview(true)} disabled={!lineas.length}>
              {borrador ? "Vista previa y aprobar" : "Ver asiento"}
            </Boton>
          </>
        }
      >
        {q.isLoading ? (
          <Esqueleto className="h-60" />
        ) : lineas.length === 0 ? (
          <Vacio icono={<Users />} titulo="Sin empleados en esta nómina" descripcion="Verifica que existan empleados activos con esa frecuencia de pago." />
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] tracking-wide text-texto-3 uppercase">
                  <th className="px-4 py-2 font-medium">Empleado</th>
                  {["Salario", "Horas extra", "Bonos", "Otros ing.", "AFP", "SFS", "ISR", "Otras ded.", "Neto"].map((h) => (
                    <th key={h} className="px-2 py-2 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <FilaNomina key={l.id} l={l} editable={!!borrador} onGuardar={(x) => actualizar.mutate(x)} moneda_={sistema.moneda} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borde-fuerte font-semibold">
                  <td className="px-4 py-2">Totales</td>
                  {(["salario", "horas_extra", "bonos", "otros_ingresos", "afp", "sfs", "isr", "otras_deducciones", "neto"] as const).map((k) => (
                    <td key={k} className="px-2 py-2 text-right tabular">
                      {$(suma(k))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
            <p className="px-4 pt-3 text-xs text-texto-3">
              Aportes patronales del período (AFP, SFS, SRL, INFOTEP): {$(suma("afp_patronal") + suma("sfs_patronal") + suma("srl_patronal") + suma("infotep"))}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        abierto={preview}
        onCerrar={() => setPreview(false)}
        ancho="lg"
        titulo="Vista previa del asiento contable"
        descripcion={borrador ? "Así quedará contabilizada la nómina al aprobarla. Después ya no podrá modificarse." : "Asiento registrado para esta nómina."}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setPreview(false)}>
              {borrador ? "Volver a editar" : "Cerrar"}
            </Boton>
            {borrador && (
              <Boton icono={<CheckCircle2 className="size-4" />} cargando={aprobar.isPending} onClick={() => aprobar.mutate()}>
                Aprobar y contabilizar
              </Boton>
            )}
          </>
        }
      >
        {asiento.isLoading ? (
          <Esqueleto className="h-40" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-[11px] tracking-wide text-texto-3 uppercase">
                <th className="py-2 font-medium">Cuenta</th>
                <th className="py-2 text-right font-medium">Debe</th>
                <th className="py-2 text-right font-medium">Haber</th>
              </tr>
            </thead>
            <tbody>
              {asiento.data?.map((a) => (
                <tr key={a.cuenta + a.descripcion} className="border-b border-borde/60">
                  <td className={cn("py-2", a.haber && "pl-6")}>
                    <span className="font-mono text-xs text-texto-3">{a.cuenta}</span> {a.nombre}
                    <span className="block text-xs text-texto-3">{a.descripcion}</span>
                  </td>
                  <td className="py-2 text-right tabular">{a.debe ? $(a.debe) : ""}</td>
                  <td className="py-2 text-right tabular">{a.haber ? $(a.haber) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2">Totales</td>
                <td className="py-2 text-right tabular">{$(asiento.data?.reduce((s, a) => s + Number(a.debe ?? 0), 0) ?? 0)}</td>
                <td className="py-2 text-right tabular">{$(asiento.data?.reduce((s, a) => s + Number(a.haber ?? 0), 0) ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Modal>

      <Documento abierto={resumen} onCerrar={() => setResumen(false)} titulo="Resumen de nómina" nombreArchivo={`Nómina ${n?.numero ?? ""}`}>
        <EncabezadoDocumento titulo={`Nómina ${n?.numero ?? ""}`} subtitulo={n && `${n.descripcion} · ${fecha(n.desde + "T00:00:00")} – ${fecha(n.hasta + "T00:00:00")}`} />
        <TablaDocumento
          encabezados={["Empleado", "Cédula", "Bruto", "AFP", "SFS", "ISR", "Otras ded.", "Neto"]}
          filas={lineas.map((l) => [
            `${l.empleado?.nombres} ${l.empleado?.apellidos}`,
            l.empleado?.cedula ?? "",
            $(l.bruto),
            $(l.afp),
            $(l.sfs),
            $(l.isr),
            $(l.otras_deducciones),
            $(l.neto),
          ])}
          pie={["Totales", "", $(suma("bruto")), $(suma("afp")), $(suma("sfs")), $(suma("isr")), $(suma("otras_deducciones")), $(suma("neto"))]}
        />
      </Documento>

      <Documento abierto={volantes} onCerrar={() => setVolantes(false)} titulo="Volantes de pago" nombreArchivo={`Volantes ${n?.numero ?? ""}`}>
        {lineas.map((l, i) => (
          <div key={l.id} className={cn("pb-6", i > 0 && "border-t border-dashed border-[#98a2b3] pt-6", "break-inside-avoid")}>
            <EncabezadoDocumento titulo="Volante de pago" subtitulo={n && `${fecha(n.desde + "T00:00:00")} – ${fecha(n.hasta + "T00:00:00")}`} />
            <p className="mb-3">
              <b>
                {l.empleado?.nombres} {l.empleado?.apellidos}
              </b>{" "}
              · {l.empleado?.cargo ?? ""} · Cédula {l.empleado?.cedula ?? "—"}
              {l.empleado?.cuenta_bancaria && (
                <>
                  {" "}
                  · {l.empleado.banco} {l.empleado.cuenta_bancaria}
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-8">
              <TablaDocumento
                encabezados={["Ingresos", "Monto"]}
                filas={[
                  ["Salario", $(l.salario)],
                  ["Horas extra", $(l.horas_extra)],
                  ["Bonos", $(l.bonos)],
                  ["Otros ingresos", $(l.otros_ingresos)],
                ]}
                pie={["Total bruto", $(l.bruto)]}
              />
              <TablaDocumento
                encabezados={["Deducciones", "Monto"]}
                filas={[
                  ["AFP", $(l.afp)],
                  ["SFS", $(l.sfs)],
                  ["ISR", $(l.isr)],
                  ["Otras deducciones", $(l.otras_deducciones)],
                ]}
                pie={["Neto a pagar", $(l.neto)]}
              />
            </div>
            <p className="mt-8 w-56 border-t border-[#101828] pt-1 text-center text-[11px]">Recibí conforme</p>
          </div>
        ))}
      </Documento>
    </>
  );
}

function FilaNomina({ l, editable, onGuardar, moneda_ }: { l: Linea; editable: boolean; onGuardar: (l: Linea) => void; moneda_: string }) {
  const [v, setV] = useState(l);
  useEffect(() => setV(l), [l]);
  const celda = (k: "horas_extra" | "bonos" | "otros_ingresos" | "otras_deducciones") =>
    editable ? (
      <input
        type="number"
        min={0}
        step="0.01"
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value as unknown as number })}
        onBlur={() => Number(v[k]) !== Number(l[k]) && onGuardar(v)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-8 w-24 rounded-lg border border-borde bg-superficie px-2 text-right tabular outline-none focus:border-marca"
      />
    ) : (
      moneda(l[k], moneda_)
    );
  return (
    <tr className="border-b border-borde/60">
      <td className="px-4 py-2">
        <span className="flex items-center gap-2">
          <Avatar nombre={`${l.empleado?.nombres} ${l.empleado?.apellidos}`} tamano={26} />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {l.empleado?.nombres} {l.empleado?.apellidos}
            </span>
            <span className="block text-xs text-texto-3">{l.empleado?.cargo}</span>
          </span>
        </span>
      </td>
      <td className="px-2 py-2 text-right tabular">{moneda(l.salario, moneda_)}</td>
      <td className="px-2 py-2 text-right">{celda("horas_extra")}</td>
      <td className="px-2 py-2 text-right">{celda("bonos")}</td>
      <td className="px-2 py-2 text-right">{celda("otros_ingresos")}</td>
      <td className="px-2 py-2 text-right text-texto-2 tabular">{moneda(l.afp, moneda_)}</td>
      <td className="px-2 py-2 text-right text-texto-2 tabular">{moneda(l.sfs, moneda_)}</td>
      <td className="px-2 py-2 text-right text-texto-2 tabular">{moneda(l.isr, moneda_)}</td>
      <td className="px-2 py-2 text-right">{celda("otras_deducciones")}</td>
      <td className="px-2 py-2 text-right font-semibold tabular">{moneda(l.neto, moneda_)}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
const COLUMNAS_EMPLEADOS: ColumnaDatos<Fila<"empleados">>[] = [
  { titulo: "Nombres", valor: (e) => e.nombres },
  { titulo: "Apellidos", valor: (e) => e.apellidos },
  { titulo: "Cédula", valor: (e) => e.cedula },
  { titulo: "Cargo", valor: (e) => e.cargo },
  { titulo: "Departamento", valor: (e) => e.departamento },
  { titulo: "Fecha de ingreso", valor: (e) => e.fecha_ingreso, tipo: "fecha" },
  { titulo: "Salario mensual", valor: (e) => e.salario_mensual, tipo: "moneda" },
  { titulo: "Frecuencia de pago", valor: (e) => e.frecuencia },
  { titulo: "Banco", valor: (e) => e.banco, soloExcel: true },
  { titulo: "Cuenta bancaria", valor: (e) => e.cuenta_bancaria, soloExcel: true },
  { titulo: "Activo", valor: (e) => e.activo, soloExcel: true },
];

function Empleados() {
  const { sistema, sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const personal = usePersonal(sistemaId);
  const [editar, setEditar] = useState<Fila<"empleados"> | "nuevo" | null>(null);
  const q = useQuery({
    queryKey: ["empleados", sistemaId],
    queryFn: async () => datos(await supabase.from("empleados").select("*").eq("sistema_id", sistemaId).order("apellidos")),
  });
  const e = editar && editar !== "nuevo" ? editar : null;
  const vacio = {
    nombres: "",
    apellidos: "",
    cedula: "",
    cargo: "",
    departamento: "",
    fecha_ingreso: "",
    salario_mensual: "",
    frecuencia: "mensual",
    banco: "",
    cuenta_bancaria: "",
    usuario_id: "",
    activo: true,
  };
  const [f, setF] = useState(vacio);
  useEffect(() => {
    if (!editar) return;
    setF(
      e
        ? {
            nombres: e.nombres,
            apellidos: e.apellidos,
            cedula: e.cedula ?? "",
            cargo: e.cargo ?? "",
            departamento: e.departamento ?? "",
            fecha_ingreso: e.fecha_ingreso ?? "",
            salario_mensual: String(e.salario_mensual),
            frecuencia: e.frecuencia,
            banco: e.banco ?? "",
            cuenta_bancaria: e.cuenta_bancaria ?? "",
            usuario_id: e.usuario_id ?? "",
            activo: e.activo,
          }
        : vacio,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editar, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = {
        nombres: f.nombres.trim(),
        apellidos: f.apellidos.trim(),
        cedula: f.cedula.trim() || null,
        cargo: f.cargo || null,
        departamento: f.departamento || null,
        fecha_ingreso: f.fecha_ingreso || null,
        salario_mensual: Number(f.salario_mensual) || 0,
        frecuencia: f.frecuencia,
        banco: f.banco || null,
        cuenta_bancaria: f.cuenta_bancaria || null,
        usuario_id: f.usuario_id || null,
        activo: f.activo,
      };
      const r = e ? await supabase.from("empleados").update(fila).eq("id", e.id) : await supabase.from("empleados").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Empleado guardado");
      void qc.invalidateQueries({ queryKey: ["empleados", sistemaId] });
      setEditar(null);
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  const escribir = puedeEscribir.nomina(roles);
  const importar = (usuarioId: string) => {
    const p = personal.data?.find((x) => x.usuario_id === usuarioId);
    const partes = (p?.perfil?.nombre_completo ?? "").split(" ");
    setF((x) => ({
      ...x,
      usuario_id: usuarioId,
      nombres: x.nombres || partes.slice(0, Math.ceil(partes.length / 2)).join(" "),
      apellidos: x.apellidos || partes.slice(Math.ceil(partes.length / 2)).join(" "),
      cargo: x.cargo || p?.especialidad || "",
    }));
  };

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex justify-end gap-2 border-b border-borde p-3">
        <AccionesDatos
          titulo="Empleados"
          columnas={COLUMNAS_EMPLEADOS}
          importaciones={escribir ? [IMPORTACIONES.empleados] : []}
          onImportado={() => void qc.invalidateQueries({ queryKey: ["empleados", sistemaId] })}
          obtener={async () => q.data ?? []}
        />
        {escribir && (
          <Boton icono={<UserPlus className="size-4" />} onClick={() => setEditar("nuevo")}>
            Nuevo empleado
          </Boton>
        )}
      </div>
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<Users />} titulo="Sin empleados" descripcion="Incluye también al personal que no usa MEDORA (limpieza, mantenimiento…)." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((x) => (
            <li key={x.id} className={cn("group flex items-center gap-4 px-5 py-3 text-sm", !x.activo && "opacity-50")}>
              <Avatar nombre={`${x.nombres} ${x.apellidos}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {x.nombres} {x.apellidos}
                </span>
                <span className="block text-xs text-texto-3">{[x.cargo, x.departamento, x.cedula].filter(Boolean).join(" · ")}</span>
              </span>
              <Insignia>{x.frecuencia === "quincenal" ? "Quincenal" : "Mensual"}</Insignia>
              {!x.activo && <Insignia tono="peligro">Inactivo</Insignia>}
              <span className="w-32 text-right font-semibold tabular">{moneda(x.salario_mensual, sistema.moneda)}</span>
              {escribir && (
                <button onClick={() => setEditar(x)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2">
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
        ancho="lg"
        titulo={e ? "Editar empleado" : "Nuevo empleado"}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setEditar(null)}>
              Cancelar
            </Boton>
            <Boton cargando={m.isPending} disabled={!f.nombres.trim() || !f.apellidos.trim()} onClick={() => m.mutate()}>
              Guardar
            </Boton>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Vincular con usuario de MEDORA (opcional)" contenedor="col-span-2" value={f.usuario_id} onChange={(x) => importar(x.target.value)}>
            <option value="">Sin cuenta en MEDORA</option>
            {personal.data?.map((p) => (
              <option key={p.usuario_id} value={p.usuario_id}>
                {p.perfil?.nombre_completo}
              </option>
            ))}
          </Selector>
          <Entrada etiqueta="Nombres" value={f.nombres} onChange={(x) => setF({ ...f, nombres: x.target.value })} />
          <Entrada etiqueta="Apellidos" value={f.apellidos} onChange={(x) => setF({ ...f, apellidos: x.target.value })} />
          <Entrada etiqueta="Cédula" value={f.cedula} onChange={(x) => setF({ ...f, cedula: x.target.value })} />
          <Entrada etiqueta="Fecha de ingreso" type="date" value={f.fecha_ingreso} onChange={(x) => setF({ ...f, fecha_ingreso: x.target.value })} />
          <Entrada etiqueta="Cargo" value={f.cargo} onChange={(x) => setF({ ...f, cargo: x.target.value })} />
          <Entrada etiqueta="Departamento" value={f.departamento} onChange={(x) => setF({ ...f, departamento: x.target.value })} />
          <Entrada etiqueta="Salario mensual" type="number" min={0} step="0.01" value={f.salario_mensual} onChange={(x) => setF({ ...f, salario_mensual: x.target.value })} />
          <Selector etiqueta="Frecuencia de pago" value={f.frecuencia} onChange={(x) => setF({ ...f, frecuencia: x.target.value })}>
            <option value="mensual">Mensual</option>
            <option value="quincenal">Quincenal</option>
          </Selector>
          <Entrada etiqueta="Banco" value={f.banco} onChange={(x) => setF({ ...f, banco: x.target.value })} />
          <Entrada etiqueta="Cuenta bancaria" value={f.cuenta_bancaria} onChange={(x) => setF({ ...f, cuenta_bancaria: x.target.value })} />
          {e && <Interruptor activo={f.activo} onChange={(activo) => setF({ ...f, activo })} etiqueta="Activo" />}
        </div>
      </Modal>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
interface Tramo {
  hasta: number | null;
  exceso_de: number;
  tasa: number;
  fijo: number;
}

function Parametros() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["parametros-nomina", sistemaId],
    queryFn: async () => datos(await supabase.from("parametros_nomina").select("*").eq("sistema_id", sistemaId).maybeSingle()),
  });
  const [f, setF] = useState<Record<string, string>>({});
  const [escala, setEscala] = useState<Tramo[]>([]);

  useEffect(() => {
    if (!q.data) return;
    const p = q.data;
    setF({
      afp_empleado: String(p.afp_empleado),
      sfs_empleado: String(p.sfs_empleado),
      afp_empleador: String(p.afp_empleador),
      sfs_empleador: String(p.sfs_empleador),
      srl_empleador: String(p.srl_empleador),
      infotep: String(p.infotep),
      tope_afp_mensual: p.tope_afp_mensual?.toString() ?? "",
      tope_sfs_mensual: p.tope_sfs_mensual?.toString() ?? "",
    });
    setEscala(p.escala_isr as unknown as Tramo[]);
  }, [q.data]);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("parametros_nomina")
        .update({
          afp_empleado: Number(f.afp_empleado),
          sfs_empleado: Number(f.sfs_empleado),
          afp_empleador: Number(f.afp_empleador),
          sfs_empleador: Number(f.sfs_empleador),
          srl_empleador: Number(f.srl_empleador),
          infotep: Number(f.infotep),
          tope_afp_mensual: f.tope_afp_mensual ? Number(f.tope_afp_mensual) : null,
          tope_sfs_mensual: f.tope_sfs_mensual ? Number(f.tope_sfs_mensual) : null,
          escala_isr: escala as unknown as never,
        })
        .eq("sistema_id", sistemaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parámetros guardados. Recalcula las nóminas en borrador para aplicarlos.");
      void qc.invalidateQueries({ queryKey: ["parametros-nomina", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  if (q.isLoading) return <Esqueleto className="h-80 rounded-2xl" />;
  const editable = puedeEscribir.contabilidad(roles);
  const campo = (k: string, etiqueta: string, ayuda?: string) => (
    <Entrada key={k} etiqueta={etiqueta} ayuda={ayuda} type="number" step="0.01" disabled={!editable} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Tarjeta className="space-y-5 p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Seguridad social (TSS)</h2>
          <p className="text-xs text-texto-3">Porcentajes vigentes; actualízalos cuando la TSS los cambie.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {campo("afp_empleado", "AFP empleado (%)")}
          {campo("afp_empleador", "AFP empleador (%)")}
          {campo("sfs_empleado", "SFS empleado (%)")}
          {campo("sfs_empleador", "SFS empleador (%)")}
          {campo("srl_empleador", "Riesgos laborales (%)")}
          {campo("infotep", "INFOTEP (%)")}
          {campo("tope_afp_mensual", "Tope cotizable AFP (mensual)", "Vacío = sin tope")}
          {campo("tope_sfs_mensual", "Tope cotizable SFS (mensual)", "Vacío = sin tope")}
        </div>
      </Tarjeta>
      <Tarjeta className="space-y-5 p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Escala anual de ISR (DGII)</h2>
          <p className="text-xs text-texto-3">ISR = fijo + tasa × (ingreso anual gravable − excedente). Se prorratea por período.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-texto-3 uppercase">
              <th className="pb-2 font-medium">Desde (excedente de)</th>
              <th className="pb-2 font-medium">Hasta</th>
              <th className="pb-2 font-medium">Tasa %</th>
              <th className="pb-2 font-medium">Fijo</th>
            </tr>
          </thead>
          <tbody>
            {escala.map((t, i) => (
              <tr key={i}>
                {(["exceso_de", "hasta", "tasa", "fijo"] as const).map((k) => (
                  <td key={k} className="pr-2 pb-2">
                    <input
                      type="number"
                      step="0.01"
                      disabled={!editable}
                      placeholder={k === "hasta" ? "En adelante" : ""}
                      value={t[k] ?? ""}
                      onChange={(e) => setEscala((s) => s.map((x, j) => (j === i ? { ...x, [k]: e.target.value === "" ? null : Number(e.target.value) } : x)))}
                      className="h-9 w-full rounded-lg border border-borde bg-superficie px-2 text-right tabular disabled:opacity-60"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="flex justify-end">
            <Boton cargando={m.isPending} onClick={() => m.mutate()}>
              Guardar parámetros
            </Boton>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
