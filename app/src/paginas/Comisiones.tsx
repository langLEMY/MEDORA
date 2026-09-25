import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { BadgePercent, FileDown, HandCoins, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, FilasEsqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { CATEGORIAS_SERVICIO, usePersonal, useServicios } from "@/lib/consultas";
import { ETIQUETA_ROL, puedeEscribir, ROLES } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Fila, type Rol } from "@/lib/supabase";
import { cn, fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

export default function Comisiones() {
  const [vista, setVista] = useState<"reporte" | "reglas">("reporte");
  return (
    <>
      <EncabezadoPagina
        titulo="Comisiones"
        descripcion="Se calculan solas en cada cobro según las reglas. La regla más específica gana (persona > rol, servicio > categoría)."
      />
      <div className="mb-4">
        <Segmentado
          id="comisiones"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "reporte", etiqueta: "Reporte y liquidación" },
            { valor: "reglas", etiqueta: "Reglas" },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {vista === "reporte" ? <Reporte /> : <Reglas />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

interface FilaReporte {
  beneficiario_id: string;
  nombre: string;
  generado: number;
  liquidado: number;
  pendiente: number;
  operaciones: number;
}

function Reporte() {
  const { sistema, sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const hoy = new Date();
  const [desde, setDesde] = useState(isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDia());
  const [pdf, setPdf] = useState(false);
  const [detalle, setDetalle] = useState<FilaReporte | null>(null);

  const q = useQuery({
    queryKey: ["reporte-comisiones", sistemaId, desde, hasta],
    queryFn: async () => (datos(await supabase.rpc("reporte_comisiones", { p_sistema: sistemaId, p_desde: desde, p_hasta: hasta })) ?? []) as FilaReporte[],
  });

  const liquidar = useMutation({
    mutationFn: async (f: FilaReporte) =>
      datos(await supabase.rpc("liquidar_comisiones", { p_sistema: sistemaId, p_beneficiario: f.beneficiario_id, p_hasta: hasta })) as { numero: string; total: number },
    onSuccess: (r) => {
      toast.success(`Liquidación ${r.numero} por ${moneda(r.total, sistema.moneda)}. Asiento contable generado.`);
      void qc.invalidateQueries({ queryKey: ["reporte-comisiones", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const filas = q.data ?? [];
  const tot = (k: keyof FilaReporte) => filas.reduce((s, f) => s + Number(f[k]), 0);

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Generado en el período", tot("generado")],
            ["Liquidado", tot("liquidado")],
            ["Pendiente de liquidar", tot("pendiente")],
          ] as const
        ).map(([k, v]) => (
          <Tarjeta key={k} className="p-5">
            <p className="text-[13px] text-texto-2">{k}</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
              <NumeroAnimado valor={v} formato={(n) => moneda(n, sistema.moneda)} />
            </p>
          </Tarjeta>
        ))}
      </div>
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-3">
          <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} contenedor="w-40" />
          <Entrada etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} contenedor="w-40" />
          <Boton className="ml-auto" variante="secundario" icono={<FileDown className="size-4" />} onClick={() => setPdf(true)} disabled={filas.length === 0}>
            Reporte PDF
          </Boton>
        </div>
        {q.isLoading ? (
          <FilasEsqueleto />
        ) : filas.length === 0 ? (
          <Vacio icono={<BadgePercent />} titulo="Sin comisiones" descripcion="Crea reglas y asigna el profesional o vendedor al registrar los cobros." />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {filas.map((f) => (
              <motion.li key={f.beneficiario_id} variants={itemEscalonado} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                <Avatar nombre={f.nombre} />
                <button onClick={() => setDetalle(f)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium hover:underline">{f.nombre}</span>
                  <span className="block text-xs text-texto-3">{f.operaciones} operaciones en el período</span>
                </button>
                <span className="w-32 text-right tabular">
                  <span className="block text-[11px] text-texto-3">Generado</span>
                  {moneda(f.generado, sistema.moneda)}
                </span>
                <span className="w-32 text-right tabular">
                  <span className="block text-[11px] text-texto-3">Pendiente</span>
                  <span className={cn("font-semibold", Number(f.pendiente) > 0 && "text-aviso")}>{moneda(f.pendiente, sistema.moneda)}</span>
                </span>
                {puedeEscribir.comisiones(roles) && (
                  <Boton
                    tamano="sm"
                    variante="suave"
                    icono={<HandCoins className="size-3.5" />}
                    disabled={Number(f.pendiente) <= 0}
                    cargando={liquidar.isPending && liquidar.variables?.beneficiario_id === f.beneficiario_id}
                    onClick={() => liquidar.mutate(f)}
                  >
                    Liquidar
                  </Boton>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>

      <Documento abierto={pdf} onCerrar={() => setPdf(false)} titulo="Reporte de comisiones" nombreArchivo={`Comisiones ${desde} a ${hasta}`}>
        <EncabezadoDocumento titulo="Reporte de comisiones" subtitulo={`${fecha(desde + "T00:00:00")} – ${fecha(hasta + "T00:00:00")}`} />
        <TablaDocumento
          encabezados={["Beneficiario", "Operaciones", "Generado", "Liquidado", "Pendiente"]}
          filas={filas.map((f) => [f.nombre, String(f.operaciones), moneda(f.generado, sistema.moneda), moneda(f.liquidado, sistema.moneda), moneda(f.pendiente, sistema.moneda)])}
          pie={["Total", String(filas.reduce((s, f) => s + Number(f.operaciones), 0)), moneda(tot("generado"), sistema.moneda), moneda(tot("liquidado"), sistema.moneda), moneda(tot("pendiente"), sistema.moneda)]}
        />
      </Documento>
      <DetalleBeneficiario fila={detalle} desde={desde} hasta={hasta} onCerrar={() => setDetalle(null)} />
    </>
  );
}

function DetalleBeneficiario({ fila, desde, hasta, onCerrar }: { fila: FilaReporte | null; desde: string; hasta: string; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const q = useQuery({
    queryKey: ["comisiones-detalle", sistemaId, fila?.beneficiario_id, desde, hasta],
    enabled: !!fila,
    queryFn: async () =>
      datos(
        await supabase
          .from("comisiones")
          .select("id, concepto, base_monto, monto, creado_en, liquidacion:liquidacion_items(liquidacion_id)")
          .eq("sistema_id", sistemaId)
          .eq("beneficiario_id", fila!.beneficiario_id)
          .gte("creado_en", desde)
          .lte("creado_en", hasta + "T23:59:59")
          .order("creado_en"),
      ),
  });
  return (
    <Documento abierto={!!fila} onCerrar={onCerrar} titulo={`Comisiones · ${fila?.nombre ?? ""}`} nombreArchivo={`Comisiones ${fila?.nombre ?? ""} ${desde} a ${hasta}`}>
      <EncabezadoDocumento titulo="Detalle de comisiones" subtitulo={<>{fila?.nombre} · {fecha(desde + "T00:00:00")} – {fecha(hasta + "T00:00:00")}</>} />
      <TablaDocumento
        encabezados={["Fecha", "Concepto", "Base", "Comisión", "Estado"]}
        filas={(q.data ?? []).map((c) => [
          fecha(c.creado_en),
          c.concepto,
          moneda(c.base_monto, sistema.moneda),
          moneda(c.monto, sistema.moneda),
          (c.liquidacion as unknown[] | null)?.length ? "Liquidada" : "Pendiente",
        ])}
        pie={["", "Total", "", moneda((q.data ?? []).reduce((s, c) => s + Number(c.monto), 0), sistema.moneda), ""]}
      />
    </Documento>
  );
}

function Reglas() {
  const { sistema, sistemaId, roles } = useSistema();
  const personal = usePersonal(sistemaId);
  const servicios = useServicios(sistemaId);
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Fila<"reglas_comision"> | "nueva" | null>(null);

  const q = useQuery({
    queryKey: ["reglas-comision", sistemaId],
    queryFn: async () => datos(await supabase.from("reglas_comision").select("*").eq("sistema_id", sistemaId).order("creado_en")),
  });

  const nombrePersona = (id: string | null) => personal.data?.find((p) => p.usuario_id === id)?.perfil?.nombre_completo;
  const escribir = puedeEscribir.comisiones(roles);

  return (
    <Tarjeta className="overflow-hidden">
      {escribir && (
        <div className="flex justify-end border-b border-borde p-3">
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nueva")}>
            Nueva regla
          </Boton>
        </div>
      )}
      {q.isLoading ? (
        <FilasEsqueleto />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<BadgePercent />} titulo="Sin reglas" descripcion="Ej.: médicos 10% de consultas; el Dr. Pérez 15% de procedimientos; vendedores RD$200 fijos por estudio." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((r) => (
            <li key={r.id} className={cn("group flex items-center gap-4 px-5 py-3 text-sm", !r.activo && "opacity-50")}>
              <span className="grid size-9 place-items-center rounded-lg bg-marca-suave text-sm font-semibold text-marca tabular">
                {r.tipo === "porcentaje" ? `${Number(r.valor)}%` : "$"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.nombre}</span>
                <span className="block text-xs text-texto-3">
                  {r.tipo === "fijo" ? `${moneda(r.valor, sistema.moneda)} por unidad` : `${Number(r.valor)}% del ${r.base === "neto" ? "neto cobrado" : "precio bruto"}`}
                  {r.vigente_hasta ? ` · hasta ${fecha(r.vigente_hasta + "T00:00:00")}` : ""}
                </span>
              </span>
              <span className="flex flex-wrap justify-end gap-1.5">
                <Insignia tono={r.aplica_a === "vendedor" ? "violeta" : "info"}>{r.aplica_a === "vendedor" ? "Vendedor" : "Profesional"}</Insignia>
                {r.beneficiario_id ? <Insignia tono="marca">{nombrePersona(r.beneficiario_id) ?? "Persona"}</Insignia> : r.rol && <Insignia>{ETIQUETA_ROL[r.rol]}</Insignia>}
                {r.servicio_id ? (
                  <Insignia>{servicios.data?.find((s) => s.id === r.servicio_id)?.nombre}</Insignia>
                ) : r.categoria ? (
                  <Insignia>{CATEGORIAS_SERVICIO[r.categoria]}</Insignia>
                ) : (
                  <Insignia>Todos los servicios</Insignia>
                )}
              </span>
              {escribir && (
                <button onClick={() => setEditar(r)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2">
                  <Pencil className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormRegla regla={editar} onCerrar={() => setEditar(null)} onListo={() => void qc.invalidateQueries({ queryKey: ["reglas-comision", sistemaId] })} />
    </Tarjeta>
  );
}

function FormRegla({ regla, onCerrar, onListo }: { regla: Fila<"reglas_comision"> | "nueva" | null; onCerrar: () => void; onListo: () => void }) {
  const { sistemaId } = useSistema();
  const personal = usePersonal(sistemaId);
  const servicios = useServicios(sistemaId);
  const e = regla && regla !== "nueva" ? regla : null;
  const [f, setF] = useState({
    nombre: "",
    aplica_a: "profesional",
    quien: "rol" as "rol" | "persona",
    rol: "medico" as Rol,
    beneficiario_id: "",
    alcance: "todo" as "todo" | "categoria" | "servicio",
    categoria: "consulta",
    servicio_id: "",
    tipo: "porcentaje",
    valor: "",
    base: "bruto",
    vigente_desde: "",
    vigente_hasta: "",
    activo: true,
  });

  useEffect(() => {
    if (!regla) return;
    setF(
      e
        ? {
            nombre: e.nombre,
            aplica_a: e.aplica_a,
            quien: e.beneficiario_id ? "persona" : "rol",
            rol: (e.rol ?? "medico") as Rol,
            beneficiario_id: e.beneficiario_id ?? "",
            alcance: e.servicio_id ? "servicio" : e.categoria ? "categoria" : "todo",
            categoria: e.categoria ?? "consulta",
            servicio_id: e.servicio_id ?? "",
            tipo: e.tipo,
            valor: String(e.valor),
            base: e.base,
            vigente_desde: e.vigente_desde ?? "",
            vigente_hasta: e.vigente_hasta ?? "",
            activo: e.activo,
          }
        : {
            nombre: "",
            aplica_a: "profesional",
            quien: "rol",
            rol: "medico",
            beneficiario_id: "",
            alcance: "todo",
            categoria: "consulta",
            servicio_id: "",
            tipo: "porcentaje",
            valor: "",
            base: "bruto",
            vigente_desde: "",
            vigente_hasta: "",
            activo: true,
          },
    );
  }, [regla, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = {
        nombre: f.nombre.trim(),
        aplica_a: f.aplica_a,
        rol: f.quien === "rol" ? f.rol : null,
        beneficiario_id: f.quien === "persona" ? f.beneficiario_id : null,
        categoria: f.alcance === "categoria" ? f.categoria : null,
        servicio_id: f.alcance === "servicio" ? f.servicio_id : null,
        tipo: f.tipo,
        valor: Number(f.valor),
        base: f.base,
        vigente_desde: f.vigente_desde || null,
        vigente_hasta: f.vigente_hasta || null,
        activo: f.activo,
      };
      const r = e ? await supabase.from("reglas_comision").update(fila).eq("id", e.id) : await supabase.from("reglas_comision").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Regla guardada");
      onListo();
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  const valido =
    f.nombre.trim().length >= 2 &&
    Number(f.valor) > 0 &&
    (f.tipo === "fijo" || Number(f.valor) <= 100) &&
    (f.quien === "rol" || !!f.beneficiario_id) &&
    (f.alcance !== "servicio" || !!f.servicio_id);

  return (
    <Modal
      abierto={!!regla}
      onCerrar={onCerrar}
      ancho="lg"
      titulo={e ? "Editar regla de comisión" : "Nueva regla de comisión"}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!valido} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Entrada etiqueta="Nombre" placeholder="Ej. Médicos · 10% consultas" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} />
        <div className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Se paga al" value={f.aplica_a} onChange={(x) => setF({ ...f, aplica_a: x.target.value })}>
            <option value="profesional">Profesional que atendió</option>
            <option value="vendedor">Vendedor / comisionista</option>
          </Selector>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-texto-2">¿A quién?</p>
            <Segmentado
              id="quien"
              valor={f.quien}
              onChange={(quien) => setF({ ...f, quien })}
              opciones={[
                { valor: "rol", etiqueta: "Por rol" },
                { valor: "persona", etiqueta: "Persona específica" },
              ]}
            />
          </div>
          {f.quien === "rol" ? (
            <Selector etiqueta="Rol" value={f.rol} onChange={(x) => setF({ ...f, rol: x.target.value as Rol })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </Selector>
          ) : (
            <Selector etiqueta="Persona" value={f.beneficiario_id} onChange={(x) => setF({ ...f, beneficiario_id: x.target.value })}>
              <option value="">Seleccionar…</option>
              {personal.data
                ?.filter((p) => p.activo)
                .map((p) => (
                  <option key={p.usuario_id} value={p.usuario_id}>
                    {p.perfil?.nombre_completo}
                  </option>
                ))}
            </Selector>
          )}
          <Selector etiqueta="Aplica a" value={f.alcance} onChange={(x) => setF({ ...f, alcance: x.target.value as typeof f.alcance })}>
            <option value="todo">Todos los servicios</option>
            <option value="categoria">Una categoría</option>
            <option value="servicio">Un servicio</option>
          </Selector>
          {f.alcance === "categoria" && (
            <Selector etiqueta="Categoría" value={f.categoria} onChange={(x) => setF({ ...f, categoria: x.target.value })}>
              {Object.entries(CATEGORIAS_SERVICIO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selector>
          )}
          {f.alcance === "servicio" && (
            <Selector etiqueta="Servicio" value={f.servicio_id} onChange={(x) => setF({ ...f, servicio_id: x.target.value })}>
              <option value="">Seleccionar…</option>
              {servicios.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Selector etiqueta="Tipo" value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })}>
            <option value="porcentaje">Porcentaje</option>
            <option value="fijo">Monto fijo por unidad</option>
          </Selector>
          <Entrada etiqueta={f.tipo === "porcentaje" ? "Porcentaje (%)" : "Monto"} type="number" min={0} step="0.01" value={f.valor} onChange={(x) => setF({ ...f, valor: x.target.value })} />
          <Selector etiqueta="Base" value={f.base} onChange={(x) => setF({ ...f, base: x.target.value })} disabled={f.tipo === "fijo"}>
            <option value="bruto">Precio bruto</option>
            <option value="neto">Neto (sin cobertura ARS)</option>
          </Selector>
          <Entrada etiqueta="Vigente desde" type="date" value={f.vigente_desde} onChange={(x) => setF({ ...f, vigente_desde: x.target.value })} />
          <Entrada etiqueta="Vigente hasta" type="date" value={f.vigente_hasta} onChange={(x) => setF({ ...f, vigente_hasta: x.target.value })} />
          <div className="flex items-end pb-2">{e && <Interruptor activo={f.activo} onChange={(activo) => setF({ ...f, activo })} etiqueta="Activa" />}</div>
        </div>
      </div>
    </Modal>
  );
}
