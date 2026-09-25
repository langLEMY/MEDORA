import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Ban, Lock, Plus, Printer, Receipt, Trash2, Unlock, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, useAseguradoras, useServicios } from "@/lib/consultas";
import { imprimir } from "@/lib/escritorio";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type MetodoPago } from "@/lib/supabase";
import { fechaHora, hora, moneda, relativo } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "cheque", etiqueta: "Cheque" },
  { valor: "otro", etiqueta: "Otro" },
];

interface CobroFila {
  id: string;
  numero: string;
  total: number;
  subtotal: number;
  cobertura_seguro: number;
  descuento: number;
  metodo: MetodoPago;
  creado_en: string;
  paciente: { nombres: string; apellidos: string; expediente: string } | null;
  cajero: { nombre_completo: string } | null;
  anulacion: { motivo: string }[] | null;
  detalles: { descripcion: string; cantidad: number; precio_unitario: number; cobertura: number; total: number }[];
}

export default function Caja() {
  const { sesion } = useSesion();
  const { sistema, sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const yo = sesion!.user.id;
  const operar = puedeEscribir.caja(roles);
  const [vista, setVista] = useState<"cobros" | "movimientos" | "turnos">("cobros");
  const [abrir, setAbrir] = useState(false);
  const [cerrar, setCerrar] = useState(false);
  const [cobrar, setCobrar] = useState(false);
  const [movimiento, setMovimiento] = useState(false);
  const [recibo, setRecibo] = useState<CobroFila | null>(null);
  const [anular, setAnular] = useState<CobroFila | null>(null);

  const turno = useQuery({
    queryKey: [...claves.caja(sistemaId), "turno", yo],
    queryFn: async () =>
      datos(
        await supabase
          .from("turnos_caja")
          .select("*")
          .eq("sistema_id", sistemaId)
          .eq("cajero_id", yo)
          .eq("estado", "abierto")
          .maybeSingle(),
      ),
  });

  const inicioHoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const cobros = useQuery({
    queryKey: [...claves.caja(sistemaId), "cobros", inicioHoy],
    queryFn: async () =>
      datos(
        await supabase
          .from("cobros")
          .select(
            "id, numero, total, subtotal, cobertura_seguro, descuento, metodo, creado_en, paciente:pacientes!cobros_sistema_id_paciente_id_fkey(nombres, apellidos, expediente), cajero:perfiles!cobros_cajero_perfil_fk(nombre_completo), anulacion:anulaciones_cobro(motivo), detalles:cobro_detalles(descripcion, cantidad, precio_unitario, cobertura, total)",
          )
          .eq("sistema_id", sistemaId)
          .gte("creado_en", inicioHoy)
          .order("creado_en", { ascending: false }),
      ) as unknown as CobroFila[],
  });

  const movimientos = useQuery({
    queryKey: [...claves.caja(sistemaId), "movimientos", inicioHoy],
    queryFn: async () =>
      datos(
        await supabase
          .from("movimientos_financieros")
          .select("id, tipo, categoria, concepto, monto, metodo, turno_id, creado_en, autor:perfiles!movimientos_autor_perfil_fk(nombre_completo)")
          .eq("sistema_id", sistemaId)
          .gte("creado_en", inicioHoy)
          .order("creado_en", { ascending: false }),
      ),
  });

  const turnos = useQuery({
    queryKey: [...claves.caja(sistemaId), "turnos"],
    enabled: vista === "turnos",
    queryFn: async () =>
      datos(
        await supabase
          .from("turnos_caja")
          .select("*, cajero:perfiles!turnos_cajero_perfil_fk(nombre_completo)")
          .eq("sistema_id", sistemaId)
          .order("abierto_en", { ascending: false })
          .limit(30),
      ),
  });

  const t = turno.data;
  const delTurno = movimientos.data?.filter((m) => m.turno_id === t?.id) ?? [];
  const efectivo = (tipo: string) => delTurno.filter((m) => m.tipo === tipo && m.metodo === "efectivo").reduce((s, m) => s + Number(m.monto), 0);
  const esperado = Number(t?.monto_apertura ?? 0) + efectivo("ingreso") - efectivo("egreso");
  const totalHoy = (cobros.data ?? []).filter((c) => !c.anulacion?.length).reduce((s, c) => s + Number(c.total), 0);
  const invalidar = () => void qc.invalidateQueries({ queryKey: claves.caja(sistemaId) });

  return (
    <>
      <EncabezadoPagina
        titulo="Caja"
        descripcion="Cobros, movimientos y cierres de turno."
        acciones={
          operar &&
          t && (
            <>
              <Boton variante="secundario" icono={<ArrowUpRight className="size-4" />} onClick={() => setMovimiento(true)}>
                Movimiento
              </Boton>
              <Boton icono={<Plus className="size-4" />} onClick={() => setCobrar(true)}>
                Nuevo cobro
              </Boton>
            </>
          )
        }
      />

      {operar && (
        <Tarjeta className="mb-4 overflow-hidden">
          {turno.isLoading ? (
            <Esqueleto className="m-5 h-16" />
          ) : t ? (
            <div className="flex flex-wrap items-center gap-6 p-5">
              <div className="flex items-center gap-3">
                <span className="relative grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--exito)_12%,var(--superficie))] text-exito">
                  <Unlock className="size-[18px]" />
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full bg-exito ring-2 ring-superficie" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Turno abierto</p>
                  <p className="text-xs text-texto-3">Desde las {hora(t.abierto_en)} · {relativo(t.abierto_en)}</p>
                </div>
              </div>
              {[
                ["Apertura", Number(t.monto_apertura)],
                ["Ingresos en efectivo", efectivo("ingreso")],
                ["Egresos en efectivo", efectivo("egreso")],
                ["Efectivo esperado", esperado],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-xs text-texto-3">{k}</p>
                  <p className="text-[17px] font-semibold tracking-[-0.01em]">
                    <NumeroAnimado valor={v as number} formato={(n) => moneda(n, sistema.moneda)} />
                  </p>
                </div>
              ))}
              <Boton variante="secundario" className="ml-auto" icono={<Lock className="size-4" />} onClick={() => setCerrar(true)}>
                Cerrar turno
              </Boton>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-superficie-2 text-texto-3">
                <Lock className="size-[18px]" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">No tienes un turno abierto</p>
                <p className="text-xs text-texto-3">Abre tu turno con el efectivo inicial para empezar a cobrar.</p>
              </div>
              <Boton icono={<Unlock className="size-4" />} onClick={() => setAbrir(true)}>
                Abrir turno
              </Boton>
            </div>
          )}
        </Tarjeta>
      )}

      <div className="mb-4 flex items-center justify-between">
        <Segmentado
          id="caja"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "cobros", etiqueta: "Cobros de hoy" },
            { valor: "movimientos", etiqueta: "Movimientos" },
            { valor: "turnos", etiqueta: "Turnos" },
          ]}
        />
        <p className="text-sm text-texto-2">
          Total cobrado hoy: <span className="font-semibold text-texto tabular">{moneda(totalHoy, sistema.moneda)}</span>
        </p>
      </div>

      <Tarjeta className="overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={vista} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {vista === "cobros" &&
              (cobros.isLoading ? (
                <Esqueleto className="m-5 h-40" />
              ) : (cobros.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Receipt />} titulo="Sin cobros hoy" />
              ) : (
                <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
                  {cobros.data!.map((c) => {
                    const anulado = !!c.anulacion?.length;
                    return (
                      <motion.li key={c.id} variants={itemEscalonado} className="group flex items-center gap-4 px-5 py-3 text-sm">
                        <span className="w-28 font-medium tabular">{c.numero}</span>
                        <span className="w-14 text-texto-3 tabular">{hora(c.creado_en)}</span>
                        <span className={`min-w-0 flex-1 truncate ${anulado ? "text-texto-3 line-through" : ""}`}>
                          {c.paciente?.nombres} {c.paciente?.apellidos}
                        </span>
                        <span className="w-28 text-texto-2 capitalize">{c.metodo}</span>
                        <span className="w-20">{anulado && <Insignia tono="peligro">Anulado</Insignia>}</span>
                        <span className="w-32 text-right font-semibold tabular">{moneda(c.total, sistema.moneda)}</span>
                        <div className="flex w-20 justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => setRecibo(c)} title="Ver recibo" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
                            <Printer className="size-4" />
                          </button>
                          {operar && !anulado && (
                            <button onClick={() => setAnular(c)} title="Anular" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro">
                              <Ban className="size-4" />
                            </button>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              ))}

            {vista === "movimientos" &&
              ((movimientos.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Wallet />} titulo="Sin movimientos hoy" />
              ) : (
                <ul className="divide-y divide-borde">
                  {movimientos.data!.map((m) => (
                    <li key={m.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                      <span
                        className={`grid size-8 place-items-center rounded-lg ${m.tipo === "ingreso" ? "bg-[color-mix(in_oklab,var(--exito)_12%,var(--superficie))] text-exito" : "bg-[color-mix(in_oklab,var(--peligro)_10%,var(--superficie))] text-peligro"}`}
                      >
                        {m.tipo === "ingreso" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.concepto}</span>
                        <span className="block text-xs text-texto-3">
                          {hora(m.creado_en)} · {m.autor?.nombre_completo} · {m.categoria}
                        </span>
                      </span>
                      <span className="text-texto-2 capitalize">{m.metodo}</span>
                      <span className={`w-32 text-right font-semibold tabular ${m.tipo === "egreso" ? "text-peligro" : ""}`}>
                        {m.tipo === "egreso" ? "−" : ""}
                        {moneda(m.monto, sistema.moneda)}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}

            {vista === "turnos" &&
              (turnos.isLoading ? (
                <Esqueleto className="m-5 h-40" />
              ) : (
                <ul className="divide-y divide-borde">
                  {turnos.data?.map((x) => {
                    const dif = x.monto_declarado !== null && x.monto_esperado !== null ? Number(x.monto_declarado) - Number(x.monto_esperado) : null;
                    return (
                      <li key={x.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{x.cajero?.nombre_completo}</span>
                          <span className="block text-xs text-texto-3">
                            {fechaHora(x.abierto_en)} → {x.cerrado_en ? hora(x.cerrado_en) : "abierto"}
                          </span>
                        </span>
                        {x.estado === "abierto" ? (
                          <Insignia tono="exito" punto>
                            Abierto
                          </Insignia>
                        ) : dif !== null && Math.abs(dif) >= 0.01 ? (
                          <Insignia tono={dif < 0 ? "peligro" : "aviso"}>
                            {dif < 0 ? "Faltante" : "Sobrante"} {moneda(Math.abs(dif), sistema.moneda)}
                          </Insignia>
                        ) : (
                          <Insignia tono="neutro">Cuadrado</Insignia>
                        )}
                        <span className="w-32 text-right tabular">{x.monto_esperado !== null ? moneda(x.monto_esperado, sistema.moneda) : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </motion.div>
        </AnimatePresence>
      </Tarjeta>

      <AbrirTurno abierto={abrir} onCerrar={() => setAbrir(false)} onListo={invalidar} />
      {t && <CerrarTurno abierto={cerrar} onCerrar={() => setCerrar(false)} turnoId={t.id} esperado={esperado} onListo={invalidar} />}
      <NuevoCobro
        abierto={cobrar}
        onCerrar={() => setCobrar(false)}
        onListo={async (id) => {
          invalidar();
          const r = await cobros.refetch();
          const c = r.data?.find((x) => x.id === id);
          if (c) setRecibo(c);
        }}
      />
      <NuevoMovimiento abierto={movimiento} onCerrar={() => setMovimiento(false)} onListo={invalidar} />
      <Recibo cobro={recibo} onCerrar={() => setRecibo(null)} />
      <AnularCobro cobro={anular} onCerrar={() => setAnular(null)} onListo={invalidar} />
    </>
  );
}

function AbrirTurno({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const { sistemaId } = useSistema();
  const [monto, setMonto] = useState("0");
  const m = useMutation({
    mutationFn: async () => datos(await supabase.rpc("abrir_turno_caja", { p_sistema: sistemaId, p_monto_apertura: Number(monto) || 0 })),
    onSuccess: () => {
      toast.success("Turno abierto");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Abrir turno de caja"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} onClick={() => m.mutate()}>
            Abrir turno
          </Boton>
        </>
      }
    >
      <Entrada etiqueta="Efectivo inicial en caja" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
    </Modal>
  );
}

function CerrarTurno({
  abierto,
  onCerrar,
  turnoId,
  esperado,
  onListo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  turnoId: string;
  esperado: number;
  onListo: () => void;
}) {
  const { sistema } = useSistema();
  const [declarado, setDeclarado] = useState("");
  const [notas, setNotas] = useState("");
  const dif = declarado === "" ? null : Number(declarado) - esperado;
  const m = useMutation({
    mutationFn: async () =>
      datos(await supabase.rpc("cerrar_turno_caja", { p_turno: turnoId, p_monto_declarado: Number(declarado), p_notas: notas || undefined })),
    onSuccess: () => {
      toast.success("Turno cerrado");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Cerrar turno"
      descripcion="Cuenta el efectivo en caja y regístralo. El sistema calcula la diferencia."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={declarado === ""} onClick={() => m.mutate()}>
            Cerrar turno
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          <span className="text-texto-2">Efectivo esperado</span>
          <span className="font-semibold tabular">{moneda(esperado, sistema.moneda)}</span>
        </div>
        <Entrada etiqueta="Efectivo contado" type="number" step="0.01" value={declarado} onChange={(e) => setDeclarado(e.target.value)} />
        <AnimatePresence>
          {dif !== null && Math.abs(dif) >= 0.01 && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`overflow-hidden text-sm font-medium ${dif < 0 ? "text-peligro" : "text-aviso"}`}
            >
              {dif < 0 ? "Faltante" : "Sobrante"} de {moneda(Math.abs(dif), sistema.moneda)}
            </motion.p>
          )}
        </AnimatePresence>
        <AreaTexto etiqueta="Notas de cierre" className="min-h-16" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}

interface Linea {
  clave: number;
  servicio_id: string;
  descripcion: string;
  cantidad: number;
  precio: number;
}

function NuevoCobro({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: (id: string) => void }) {
  const { sistema, sistemaId } = useSistema();
  const servicios = useServicios(sistemaId);
  const aseguradoras = useAseguradoras(sistemaId);
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [aseguradora, setAseguradora] = useState("");
  const [autorizacion, setAutorizacion] = useState("");
  const [descuento, setDescuento] = useState("0");

  useEffect(() => {
    if (!abierto) return;
    setPaciente(null);
    setLineas([]);
    setMetodo("efectivo");
    setAseguradora("");
    setAutorizacion("");
    setDescuento("0");
  }, [abierto]);

  useEffect(() => {
    setAseguradora(paciente?.aseguradora_id ?? "");
  }, [paciente]);

  const coberturas = useQuery({
    queryKey: ["coberturas", sistemaId, aseguradora],
    enabled: !!aseguradora,
    queryFn: async () => datos(await supabase.from("coberturas").select("servicio_id, monto_cubierto").eq("aseguradora_id", aseguradora)),
  });

  const cubierto = (l: Linea) => {
    if (!aseguradora || !l.servicio_id) return 0;
    const c = coberturas.data?.find((x) => x.servicio_id === l.servicio_id);
    return c ? Math.min(Number(c.monto_cubierto), l.precio) * l.cantidad : 0;
  };
  const subtotal = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const cobertura = lineas.reduce((s, l) => s + cubierto(l), 0);
  const total = Math.max(subtotal - cobertura - (Number(descuento) || 0), 0);

  const agregar = (servicioId: string) => {
    const s = servicios.data?.find((x) => x.id === servicioId);
    setLineas((ls) => [
      ...ls,
      { clave: Date.now(), servicio_id: s?.id ?? "", descripcion: s?.nombre ?? "", cantidad: 1, precio: Number(s?.precio ?? 0) },
    ]);
  };

  const m = useMutation({
    mutationFn: async () => {
      const r = datos(
        await supabase.rpc("registrar_cobro", {
          p_sistema: sistemaId,
          p_paciente: paciente!.id,
          p_items: lineas.map((l) =>
            l.servicio_id
              ? { servicio_id: l.servicio_id, cantidad: l.cantidad }
              : { descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio },
          ),
          p_metodo: metodo,
          p_aseguradora: aseguradora || undefined,
          p_autorizacion: autorizacion || undefined,
          p_descuento: Number(descuento) || 0,
        }),
      ) as { id: string; numero: string };
      return r;
    },
    onSuccess: (r) => {
      toast.success(`Cobro ${r.numero} registrado`);
      onCerrar();
      onListo(r.id);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Nuevo cobro"
      pie={
        <>
          <div className="mr-auto text-sm">
            <span className="text-texto-2">Total a cobrar </span>
            <span className="text-lg font-semibold tabular">
              <NumeroAnimado valor={total} formato={(n) => moneda(n, sistema.moneda)} />
            </span>
          </div>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!paciente || lineas.length === 0} onClick={() => m.mutate()}>
            Cobrar
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <SelectorPaciente valor={paciente} onChange={setPaciente} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-texto-2">Conceptos</span>
            <div className="flex gap-2">
              <Selector value="" onChange={(e) => e.target.value && agregar(e.target.value)} contenedor="w-60">
                <option value="">+ Agregar servicio…</option>
                {servicios.data
                  ?.filter((s) => s.activo)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} · {moneda(s.precio, sistema.moneda)}
                    </option>
                  ))}
              </Selector>
              <Boton variante="secundario" onClick={() => agregar("")}>
                Otro concepto
              </Boton>
            </div>
          </div>
          <div className="rounded-xl border border-borde">
            {lineas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-texto-3">Agrega al menos un servicio o concepto.</p>
            ) : (
              <AnimatePresence initial={false}>
                {lineas.map((l) => (
                  <motion.div
                    key={l.clave}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="overflow-hidden border-b border-borde last:border-0"
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      {l.servicio_id ? (
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.descripcion}</span>
                      ) : (
                        <input
                          placeholder="Descripción"
                          value={l.descripcion}
                          onChange={(e) => setLineas((ls) => ls.map((x) => (x.clave === l.clave ? { ...x, descripcion: e.target.value } : x)))}
                          className="h-8 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-2 text-sm"
                        />
                      )}
                      <input
                        type="number"
                        min={1}
                        value={l.cantidad}
                        onChange={(e) => setLineas((ls) => ls.map((x) => (x.clave === l.clave ? { ...x, cantidad: Math.max(1, Number(e.target.value)) } : x)))}
                        className="h-8 w-16 rounded-lg border border-borde bg-superficie px-2 text-sm tabular"
                      />
                      {l.servicio_id ? (
                        <span className="w-28 text-right text-sm tabular">{moneda(l.precio, sistema.moneda)}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.precio}
                          onChange={(e) => setLineas((ls) => ls.map((x) => (x.clave === l.clave ? { ...x, precio: Number(e.target.value) } : x)))}
                          className="h-8 w-28 rounded-lg border border-borde bg-superficie px-2 text-right text-sm tabular"
                        />
                      )}
                      {cubierto(l) > 0 && <Insignia tono="info">−{moneda(cubierto(l), sistema.moneda)}</Insignia>}
                      <button
                        onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                        className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Método de pago" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.etiqueta}
              </option>
            ))}
          </Selector>
          <Entrada etiqueta="Descuento" type="number" min={0} step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          <Selector etiqueta="Aseguradora" value={aseguradora} onChange={(e) => setAseguradora(e.target.value)}>
            <option value="">Sin seguro (privado)</option>
            {aseguradoras.data
              ?.filter((a) => a.activo)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
          </Selector>
          <Entrada etiqueta="No. de autorización" value={autorizacion} onChange={(e) => setAutorizacion(e.target.value)} disabled={!aseguradora} />
        </div>

        <dl className="space-y-1.5 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-texto-2">Subtotal</dt>
            <dd className="tabular">{moneda(subtotal, sistema.moneda)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-texto-2">Cobertura del seguro</dt>
            <dd className="tabular">−{moneda(cobertura, sistema.moneda)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-texto-2">Descuento</dt>
            <dd className="tabular">−{moneda(Number(descuento) || 0, sistema.moneda)}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}

function NuevoMovimiento({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const { sistemaId } = useSistema();
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState("general");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");

  useEffect(() => {
    if (abierto) {
      setConcepto("");
      setMonto("");
    }
  }, [abierto]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_movimiento", {
          p_sistema: sistemaId,
          p_tipo: tipo,
          p_concepto: concepto,
          p_monto: Number(monto),
          p_metodo: metodo,
          p_categoria: categoria,
        }),
      ),
    onSuccess: () => {
      toast.success("Movimiento registrado");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Registrar movimiento"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!concepto.trim() || !(Number(monto) > 0)} onClick={() => m.mutate()}>
            Registrar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          id="tipo-mov"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: "egreso", etiqueta: "Egreso" },
            { valor: "ingreso", etiqueta: "Ingreso" },
          ]}
        />
        <Entrada etiqueta="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Compra de material de oficina" />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Selector etiqueta="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.etiqueta}
              </option>
            ))}
          </Selector>
        </div>
        <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {["general", "suministros", "servicios", "nomina", "mantenimiento", "reembolso", "otro"].map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </Selector>
      </div>
    </Modal>
  );
}

function AnularCobro({ cobro, onCerrar, onListo }: { cobro: CobroFila | null; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: async () => datos(await supabase.rpc("anular_cobro", { p_cobro: cobro!.id, p_motivo: motivo })),
    onSuccess: () => {
      toast.success("Cobro anulado");
      setMotivo("");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={!!cobro}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={`Anular ${cobro?.numero ?? ""}`}
      descripcion="Se registra un egreso compensatorio. El cobro original se conserva."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Volver
          </Boton>
          <Boton variante="peligro" cargando={m.isPending} disabled={motivo.trim().length < 5} onClick={() => m.mutate()}>
            Anular cobro
          </Boton>
        </>
      }
    >
      <AreaTexto etiqueta="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </Modal>
  );
}

function Recibo({ cobro, onCerrar }: { cobro: CobroFila | null; onCerrar: () => void }) {
  const { sistema } = useSistema();
  const [ultimo, setUltimo] = useState(cobro);
  useEffect(() => {
    if (cobro) setUltimo(cobro);
  }, [cobro]);
  const c = cobro ?? ultimo;
  if (!c) return null;

  const contenido = (
    <div className="mx-auto max-w-[320px] font-mono text-[12px] leading-relaxed text-black">
      <p className="text-center text-[14px] font-bold">{sistema.nombre}</p>
      <p className="text-center">Recibo {c.numero}</p>
      <p className="text-center">{fechaHora(c.creado_en)}</p>
      <hr className="my-2 border-dashed border-black/40" />
      <p>
        Paciente: {c.paciente?.nombres} {c.paciente?.apellidos}
      </p>
      <p>Expediente: {c.paciente?.expediente}</p>
      <hr className="my-2 border-dashed border-black/40" />
      {c.detalles.map((d, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span className="truncate">
            {d.cantidad} × {d.descripcion}
          </span>
          <span>{moneda(Number(d.precio_unitario) * Number(d.cantidad), sistema.moneda)}</span>
        </div>
      ))}
      <hr className="my-2 border-dashed border-black/40" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{moneda(c.subtotal, sistema.moneda)}</span>
      </div>
      {Number(c.cobertura_seguro) > 0 && (
        <div className="flex justify-between">
          <span>Seguro</span>
          <span>−{moneda(c.cobertura_seguro, sistema.moneda)}</span>
        </div>
      )}
      {Number(c.descuento) > 0 && (
        <div className="flex justify-between">
          <span>Descuento</span>
          <span>−{moneda(c.descuento, sistema.moneda)}</span>
        </div>
      )}
      <div className="flex justify-between text-[14px] font-bold">
        <span>TOTAL</span>
        <span>{moneda(c.total, sistema.moneda)}</span>
      </div>
      <p className="capitalize">Pago: {c.metodo}</p>
      {c.anulacion?.length ? <p className="mt-2 text-center font-bold">*** ANULADO ***</p> : null}
      <hr className="my-2 border-dashed border-black/40" />
      <p className="text-center">Atendido por {c.cajero?.nombre_completo}</p>
      <p className="text-center">¡Gracias por su visita!</p>
    </div>
  );

  return (
    <>
      <Modal
        abierto={!!cobro}
        onCerrar={onCerrar}
        ancho="sm"
        titulo={`Recibo ${c.numero}`}
        pie={
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cerrar
            </Boton>
            <Boton icono={<Printer className="size-4" />} onClick={() => imprimir()}>
              Imprimir
            </Boton>
          </>
        }
      >
        <div className="rounded-xl bg-white p-5 shadow-inner ring-1 ring-borde">{contenido}</div>
      </Modal>
      {cobro && createPortal(<div className="area-impresion hidden">{contenido}</div>, document.body)}
    </>
  );
}
