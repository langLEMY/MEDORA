import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  MoreHorizontal,
  Clock,
  FileText,
  HandCoins,
  Lock,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Unlock,
  UserCheck,
  Wallet,
  HandHeart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { EstadoCuenta, type ContactoCuenta } from "@/components/EstadoCuenta";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { SelectorServicio } from "@/components/SelectorServicio";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Campo, Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import {
  CATEGORIAS_SERVICIO,
  claves,
  METODOS_PAGO,
  nombrePaciente,
  SELECT_CITA,
  TIPOS_NCF,
  useAseguradoras,
  useMedicos,
  useServicios,
  useTurnosHoy,
  type CitaConRelaciones,
} from "@/lib/consultas";
import { BloqueTurno, destinoTurno, TicketTurno } from "@/components/TicketTurno";
import { useTiempoReal } from "@/lib/tiempoReal";
import { useAccionUrl } from "@/lib/accionUrl";
import { OpcionesMedicos } from "@/components/OpcionesMedicos";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Fila, type MetodoPago } from "@/lib/supabase";
import { cn, fecha, fechaHora, hora, isoDia, moneda } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { FranjaLlamados } from "@/components/LlamadosEnVivo";

const METODOS_DINERO: MetodoPago[] = ["efectivo", "tarjeta", "transferencia", "cheque", "otro"];

interface CobroFila {
  id: string;
  numero: string;
  ncf: string | null;
  tipo_ncf: string | null;
  cliente_rnc: string | null;
  cliente_nombre: string | null;
  total: number;
  subtotal: number;
  cobertura_seguro: number;
  monto_fondo: number;
  descuento: number;
  monto_credito: number;
  metodo: MetodoPago;
  numero_autorizacion: string | null;
  creado_en: string;
  paciente: { nombres: string; apellidos: string; expediente: string; documento: string | null } | null;
  cajero: { nombre_completo: string } | null;
  profesional: { nombre_completo: string } | null;
  aseguradora: { nombre: string } | null;
  anulacion: { motivo: string }[] | null;
  cita: { turno: string | null; especialidad: string | null; medico_id: string | null; medico: { nombre_completo: string } | null } | null;
  pagos: { metodo: MetodoPago; monto: number; referencia: string | null; recibido: number | null }[];
  detalles: { descripcion: string; categoria: string; cantidad: number; precio_unitario: number; cobertura: number; total: number }[];
}

const SELECT_COBRO =
  "id, numero, ncf, tipo_ncf, cliente_rnc, cliente_nombre, total, subtotal, cobertura_seguro, monto_fondo, descuento, monto_credito, metodo, numero_autorizacion, creado_en, " +
  "paciente:pacientes!cobros_sistema_id_paciente_id_fkey(nombres, apellidos, expediente, documento), cajero:perfiles!cobros_cajero_perfil_fk(nombre_completo), " +
  "profesional:perfiles!cobros_profesional_perfil_fk(nombre_completo), aseguradora:aseguradoras!cobros_sistema_id_aseguradora_id_fkey(nombre), " +
  "anulacion:anulaciones_cobro(motivo), cita:citas!cobros_sistema_id_cita_id_fkey(turno, especialidad, medico_id, medico:perfiles!citas_medico_perfil_fk(nombre_completo)), pagos:cobro_pagos(metodo, monto, referencia, recibido), detalles:cobro_detalles(descripcion, categoria, cantidad, precio_unitario, cobertura, total)";

type Vista = "cobrar" | "anticipos" | "cxc" | "movimientos" | "turnos";

/** Vistas secundarias (menú «Más»), con nombres del día a día. */
const OTRAS_VISTAS: Record<Exclude<Vista, "cobrar">, { titulo: string; detalle: string }> = {
  anticipos: { titulo: "Dinero adelantado", detalle: "Anticipos de pacientes y su saldo disponible." },
  cxc: { titulo: "Lo que deben", detalle: "Saldos a crédito de pacientes y coberturas pendientes de las ARS (cuentas por cobrar)." },
  movimientos: { titulo: "Movimientos de hoy", detalle: "Entradas y salidas de dinero de la caja." },
  turnos: { titulo: "Turnos de caja", detalle: "Aperturas, cierres y arqueos." },
};

const COLUMNAS_COBROS: ColumnaDatos<CobroFila>[] = [
  { titulo: "Recibo", valor: (c) => c.numero },
  { titulo: "NCF", valor: (c) => c.ncf },
  { titulo: "Fecha", valor: (c) => c.creado_en, tipo: "fechaHora" },
  { titulo: "Paciente", valor: (c) => `${c.paciente?.nombres ?? ""} ${c.paciente?.apellidos ?? ""}` },
  { titulo: "Expediente", valor: (c) => c.paciente?.expediente, soloExcel: true },
  { titulo: "Métodos", valor: (c) => (c.pagos ?? []).map((p) => `${METODOS_PAGO[p.metodo]} ${p.monto}`).join(" + ") },
  { titulo: "Subtotal", valor: (c) => c.subtotal, tipo: "moneda", soloExcel: true },
  { titulo: "Seguro", valor: (c) => c.cobertura_seguro, tipo: "moneda" },
  { titulo: "Descuento", valor: (c) => c.descuento, tipo: "moneda", soloExcel: true },
  { titulo: "Total", valor: (c) => c.total, tipo: "moneda" },
  { titulo: "Crédito", valor: (c) => c.monto_credito, tipo: "moneda" },
  { titulo: "Cajero", valor: (c) => c.cajero?.nombre_completo, soloExcel: true },
  { titulo: "Estado", valor: (c) => (c.anulacion?.length ? "Anulado" : "Vigente") },
];

export default function Caja() {
  const { sesion } = useSesion();
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const yo = sesion!.user.id;
  const operar = puedeEscribir.caja(roles);
  const [vista, setVista] = useState<Vista>("cobrar");
  const navegarDonacion = useNavigate();
  const [cerrar, setCerrar] = useState(false);
  const [cobrar, setCobrar] = useState(false);
  // Paciente que llegó a recepción y espera cobro para recibir su turno.
  const [citaCobro, setCitaCobro] = useState<CitaConRelaciones | null>(null);
  const [exonerar, setExonerar] = useState<CitaConRelaciones | null>(null);
  const [ticket, setTicket] = useState<CitaConRelaciones | null>(null);
  useAccionUrl({
    cobro: () => operar && setCobrar(true),
    anticipo: () => operar && setAnticipo(true),
    movimiento: () => {
      if (!operar) return;
      // El movimiento manual necesita el turno abierto (se abre solo con el primer cobro).
      if (turno.data) setMovimiento(true);
      else toast.info("Primero registra un cobro: el turno de caja se abre solo.");
    },
  });
  const [anticipo, setAnticipo] = useState(false);
  const [movimiento, setMovimiento] = useState(false);
  const [recibo, setRecibo] = useState<CobroFila | null>(null);
  const [anular, setAnular] = useState<CobroFila | null>(null);
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);

  const turno = useQuery({
    queryKey: [...claves.caja(sistemaId), "turno", yo],
    queryFn: async () =>
      datos(await supabase.from("turnos_caja").select("*").eq("sistema_id", sistemaId).eq("cajero_id", yo).eq("estado", "abierto").maybeSingle()),
  });

  const fondo = useQuery({
    queryKey: ["sistema", sistemaId, "fondo_caja"],
    enabled: operar,
    queryFn: async () => Number(datos(await supabase.from("sistemas").select("fondo_caja").eq("id", sistemaId).single())?.fondo_caja ?? 0),
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
        await supabase.from("cobros").select(SELECT_COBRO).eq("sistema_id", sistemaId).gte("creado_en", inicioHoy).order("creado_en", { ascending: false }),
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

  const t = turno.data;
  const delTurno = movimientos.data?.filter((m) => m.turno_id === t?.id) ?? [];
  const efectivo = (tipo: string) => delTurno.filter((m) => m.tipo === tipo && m.metodo === "efectivo").reduce((s, m) => s + Number(m.monto), 0);
  const esperado = Number(t?.monto_apertura ?? 0) + efectivo("ingreso") - efectivo("egreso");
  const totalHoy = (cobros.data ?? []).filter((c) => !c.anulacion?.length).reduce((s, c) => s + Number(c.total), 0);
  const invalidar = () => void qc.invalidateQueries({ queryKey: claves.caja(sistemaId) });

  return (
    <>
      <EncabezadoPagina
        titulo="Caja y facturación"
        descripcion="Cobra a quien espera y lleva el control de la caja."
        acciones={
          <>
            <Menu
              alinear="derecha"
              ancho={250}
              disparador={() => (
                <Boton variante="secundario" icono={<MoreHorizontal className="size-4" />}>
                  Más
                </Boton>
              )}
            >
              {(cerrarMenu) => (
                <>
                  {operar && (
                    <>
                      <ItemMenu icono={<HandCoins />} onClick={() => (setAnticipo(true), cerrarMenu())}>
                        Registrar dinero adelantado
                      </ItemMenu>
                      <ItemMenu
                        icono={<ArrowUpRight />}
                        onClick={() => {
                          cerrarMenu();
                          if (t) setMovimiento(true);
                          else toast.info("Primero registra un cobro: el turno de caja se abre solo.");
                        }}
                      >
                        Entrada o salida de caja
                      </ItemMenu>
                      <ItemMenu icono={<HandHeart />} onClick={() => (navegarDonacion("/finanzas?vista=donaciones&accion=nueva"), cerrarMenu())}>
                        Registrar donación
                      </ItemMenu>
                      <SeparadorMenu />
                    </>
                  )}
                  {(Object.keys(OTRAS_VISTAS) as Exclude<Vista, "cobrar">[]).map((v) => (
                    <ItemMenu key={v} activo={vista === v} onClick={() => (setVista(v), cerrarMenu())}>
                      {OTRAS_VISTAS[v].titulo}
                    </ItemMenu>
                  ))}
                </>
              )}
            </Menu>
            {operar && (
              <Boton icono={<Plus className="size-4" />} onClick={() => setCobrar(true)}>
                Cobro sin turno
              </Boton>
            )}
          </>
        }
      />

      <FranjaLlamados />

      {operar && (
        <Tarjeta className="mb-4 overflow-hidden">
          {turno.isLoading ? (
            <Esqueleto className="m-3 h-8" />
          ) : t ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
              <span className="relative grid size-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--exito)_12%,var(--superficie))] text-exito">
                <Unlock className="size-4" />
                <span className="absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full bg-exito ring-2 ring-superficie" />
              </span>
              <p className="text-sm">
                <span className="font-semibold">Caja abierta</span>
                <span className="text-texto-3"> desde las {hora(t.abierto_en)}</span>
              </p>
              <p
                className="text-sm text-texto-2"
                title={`Fondo ${moneda(Number(t.monto_apertura))} + entradas ${moneda(efectivo("ingreso"))} − salidas ${moneda(efectivo("egreso"))}`}
              >
                Efectivo en caja:{" "}
                <span className="font-semibold text-texto tabular">
                  <NumeroAnimado valor={esperado} formato={(n) => moneda(n)} />
                </span>
              </p>
              <Boton variante="fantasma" tamano="sm" className="ml-auto" icono={<Lock className="size-3.5" />} onClick={() => setCerrar(true)}>
                Cerrar turno
              </Boton>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-8 place-items-center rounded-lg bg-superficie-2 text-texto-3">
                <Lock className="size-4" />
              </span>
              <p className="text-sm">
                <span className="font-semibold">Caja cerrada</span>
                <span className="text-texto-3"> · se abre sola con el primer cobro, con {moneda(fondo.data ?? 0)} de fondo.</span>
              </p>
            </div>
          )}
        </Tarjeta>
      )}

      {vista !== "cobrar" && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Boton variante="secundario" tamano="sm" icono={<ArrowLeft className="size-3.5" />} onClick={() => setVista("cobrar")}>
            Cobrar
          </Boton>
          <div>
            <p className="text-[0.9375rem] font-semibold">{OTRAS_VISTAS[vista].titulo}</p>
            <p className="text-xs text-texto-3">{OTRAS_VISTAS[vista].detalle}</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {vista === "cobrar" && (
            <>
            {operar && (
              <PendientesCobro
                onCobrar={(c) => {
                  setCitaCobro(c);
                  setCobrar(true);
                }}
                onExonerar={setExonerar}
              />
            )}
            <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.9375rem] font-semibold">Cobrados hoy</p>
              <div className="flex items-center gap-3">
                <p className="text-sm text-texto-2">
                  Facturado hoy: <span className="font-semibold text-texto tabular">{moneda(totalHoy)}</span>
                </p>
                <AccionesDatos titulo="Cobros del día" columnas={COLUMNAS_COBROS} obtener={async () => cobros.data ?? []} />
              </div>
            </div>
            <Tarjeta className="overflow-hidden">
              {cobros.isLoading ? (
                <Esqueleto className="m-5 h-40" />
              ) : (cobros.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Receipt />} titulo="Aún no hay cobros hoy" />
              ) : (
                <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
                  {cobros.data!.map((c) => {
                    const anulado = !!c.anulacion?.length;
                    return (
                      <motion.li key={c.id} variants={itemEscalonado} className="group flex items-center gap-4 px-5 py-3 text-sm">
                        <span className="w-28">
                          <span className="block font-medium tabular">{c.numero}</span>
                          {c.ncf && <span className="block font-mono text-[0.6875rem] text-texto-3">{c.ncf}</span>}
                        </span>
                        <span className="w-12 text-texto-3 tabular">{hora(c.creado_en)}</span>
                        <span className={cn("min-w-0 flex-1 truncate", anulado && "text-texto-3 line-through")}>
                          {c.paciente?.nombres} {c.paciente?.apellidos}
                        </span>
                        <span className="flex w-52 flex-wrap justify-end gap-1">
                          {(c.pagos ?? []).map((p) => (
                            <Insignia key={p.metodo}>{METODOS_PAGO[p.metodo]}</Insignia>
                          ))}
                          {Number(c.monto_credito) > 0 && <Insignia tono="aviso">Crédito</Insignia>}
                          {Number(c.cobertura_seguro) > 0 && <Insignia tono="info">ARS</Insignia>}
                          {anulado && <Insignia tono="peligro">Anulado</Insignia>}
                        </span>
                        <span className="w-32 text-right font-semibold tabular">{moneda(c.total)}</span>
                        <div className="flex w-20 justify-end gap-1">
                          <button onClick={() => setRecibo(c)} title="Imprimir factura" className="grid size-8 place-items-center rounded-lg text-texto-2 hover:bg-superficie-2 hover:text-texto">
                            <Printer className="size-4" />
                          </button>
                          {operar && !anulado && (
                            <button onClick={() => setAnular(c)} title="Anular" className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-peligro">
                              <Ban className="size-4" />
                            </button>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </Tarjeta>
            </>
          )}

          {vista === "anticipos" && <Anticipos onComprobante={setComprobante} />}
          {vista === "cxc" && <CuentasPorCobrar onComprobante={setComprobante} />}

          {vista === "movimientos" && (
            <Tarjeta className="overflow-hidden">
              {(movimientos.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Wallet />} titulo="Sin movimientos hoy" />
              ) : (
                <ul className="divide-y divide-borde">
                  {movimientos.data!.map((m) => (
                    <li key={m.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                      <span
                        className={cn(
                          "grid size-8 place-items-center rounded-lg",
                          m.tipo === "ingreso"
                            ? "bg-[color-mix(in_oklab,var(--exito)_12%,var(--superficie))] text-exito"
                            : "bg-[color-mix(in_oklab,var(--peligro)_10%,var(--superficie))] text-peligro",
                        )}
                      >
                        {m.tipo === "ingreso" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.concepto}</span>
                        <span className="block text-xs text-texto-3">
                          {hora(m.creado_en)} · {m.autor?.nombre_completo} · {m.categoria}
                        </span>
                      </span>
                      <span className="text-texto-2">{METODOS_PAGO[m.metodo]}</span>
                      <span className={cn("w-32 text-right font-semibold tabular", m.tipo === "egreso" && "text-peligro")}>
                        {m.tipo === "egreso" ? "−" : ""}
                        {moneda(m.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {vista === "turnos" && <Turnos />}
        </motion.div>
      </AnimatePresence>

      {t && <CerrarTurno abierto={cerrar} onCerrar={() => setCerrar(false)} turnoId={t.id} esperado={esperado} onListo={invalidar} />}
      <NuevoCobro
        abierto={cobrar}
        cita={citaCobro}
        onCerrar={() => {
          setCobrar(false);
          setCitaCobro(null);
        }}
        onListo={async (id) => {
          invalidar();
          const { data } = await supabase.from("cobros").select(SELECT_COBRO).eq("id", id).single();
          if (data) setRecibo(data as unknown as CobroFila);
        }}
      />
      <NuevoAnticipo
        abierto={anticipo}
        onCerrar={() => setAnticipo(false)}
        onListo={(c) => {
          invalidar();
          setComprobante(c);
        }}
      />
      <NuevoMovimiento abierto={movimiento} onCerrar={() => setMovimiento(false)} onListo={invalidar} />
      <Factura cobro={recibo} onCerrar={() => setRecibo(null)} />
      <AnularCobro cobro={anular} onCerrar={() => setAnular(null)} onListo={invalidar} />
      <ComprobanteTicket comprobante={comprobante} onCerrar={() => setComprobante(null)} />
      <Exonerar
        cita={exonerar}
        onCerrar={() => setExonerar(null)}
        onListo={(c) => {
          setExonerar(null);
          setTicket(c);
        }}
      />
      <TicketTurno cita={ticket} onCerrar={() => setTicket(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pendientes de cobro (llegaron a recepción; al cobrar reciben su turno)
// ---------------------------------------------------------------------------
function PendientesCobro({ onCobrar, onExonerar }: { onCobrar: (c: CitaConRelaciones) => void; onExonerar: (c: CitaConRelaciones) => void }) {
  const { sistemaId, roles } = useSistema();
  const turnos = useTurnosHoy(sistemaId);
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);
  const pendientes = (turnos.data ?? []).filter((c) => c.estado === "por_cobrar").sort((a, b) => (a.llegada_en ?? "").localeCompare(b.llegada_en ?? ""));
  const admin = roles.includes("admin");

  if (!turnos.isLoading && !pendientes.length)
    return (
      <Tarjeta className="flex items-center gap-4 px-5 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--exito)_12%,var(--superficie))] text-exito">
          <UserCheck className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Nadie esperando cobro</p>
          <p className="text-xs text-texto-3">Cuando recepción registre una llegada, el paciente aparece aquí al instante, listo para cobrar.</p>
        </div>
      </Tarjeta>
    );

  return (
    <Tarjeta className="overflow-hidden border-aviso/40">
      <div className="flex items-center gap-2 border-b border-borde px-5 py-3">
        <Clock className="size-4 text-aviso" />
        <span className="text-[0.9375rem] font-semibold">Esperando cobro</span>
        <Insignia tono="aviso">{pendientes.length}</Insignia>
        <span className="ml-auto text-xs text-texto-3">Al cobrar reciben su turno</span>
      </div>
      <ul className="divide-y divide-borde">
        {pendientes.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate font-medium", !c.paciente && "text-aviso")}>
                {c.turno && <span className="mr-1.5 font-mono font-bold text-marca-texto">{c.turno}</span>}
                {nombrePaciente(c)}
              </span>
              <span className="block truncate text-xs text-texto-3">
                {!c.paciente && "Al cobrar, búscalo o regístralo · "}
                {destinoTurno(c)}
                {c.servicio ? ` · ${c.servicio.nombre}` : ""}
                {c.llegada_en ? ` · llegó ${hora(c.llegada_en)}` : ""}
              </span>
            </span>
            {c.prioridad && <Insignia tono="aviso">{c.motivo_prioridad ?? "Prioridad"}</Insignia>}
            {admin && (
              <Boton variante="fantasma" tamano="sm" onClick={() => onExonerar(c)}>
                Exonerar
              </Boton>
            )}
            <Boton tamano="sm" icono={<Receipt className="size-3.5" />} onClick={() => onCobrar(c)}>
              Cobrar
            </Boton>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function Exonerar({ cita, onCerrar, onListo }: { cita: CitaConRelaciones | null; onCerrar: () => void; onListo: (c: CitaConRelaciones) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  // Turno del quiosco sin paciente: hay que saber a quién se exonera.
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  useEffect(() => {
    if (cita) {
      setMotivo("");
      setPaciente(null);
    }
  }, [cita]);
  const falta = !!cita && !cita.paciente_id;
  const m = useMutation({
    mutationFn: async () => {
      if (falta) datos(await supabase.rpc("identificar_turno", { p_cita: cita!.id, p_paciente: paciente!.id }));
      datos(await supabase.rpc("exonerar_turno", { p_cita: cita!.id, p_motivo: motivo }));
      return datos(await supabase.from("citas").select(SELECT_CITA).eq("id", cita!.id).single()) as unknown as CitaConRelaciones;
    },
    onSuccess: (c) => {
      toast.success(`Exonerado · turno ${c.turno}`);
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      onListo(c);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={!!cita}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Exonerar el pago"
      descripcion={
        cita
          ? `${falta ? "El paciente" : nombrePaciente(cita)} pasa a la consulta sin cobrar. Queda registrado quién lo autorizó.`
          : undefined
      }
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={motivo.trim().length < 3 || (falta && !paciente)} onClick={() => m.mutate()}>
            Exonerar y dar turno
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {falta && (
          <SelectorPaciente etiqueta="¿Quién es? (tomó turno en el quiosco)" valor={paciente} onChange={setPaciente} textoInicial={cita?.cedula_llegada ?? undefined} />
        )}
        <AreaTexto etiqueta="Motivo" placeholder="Ej. paciente de escasos recursos, jornada gratuita…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------
function Turnos() {
  const { sistemaId } = useSistema();
  const [arqueo, setArqueo] = useState<{ id: string; cajero: string; abierto_en: string; cerrado_en: string | null; apertura: number; esperado: number | null; declarado: number | null; notas: string | null } | null>(null);
  const turnos = useQuery({
    queryKey: [...claves.caja(sistemaId), "turnos"],
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
  return (
    <Tarjeta className="overflow-hidden">
      {turnos.isLoading ? (
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
                    {dif < 0 ? "Faltante" : "Sobrante"} {moneda(Math.abs(dif))}
                  </Insignia>
                ) : (
                  <Insignia tono="neutro">Cuadrado</Insignia>
                )}
                <span className="w-32 text-right tabular">{x.monto_esperado !== null ? moneda(x.monto_esperado) : "—"}</span>
                <button
                  title="Reporte de arqueo"
                  onClick={() =>
                    setArqueo({
                      id: x.id,
                      cajero: x.cajero?.nombre_completo ?? "",
                      abierto_en: x.abierto_en,
                      cerrado_en: x.cerrado_en,
                      apertura: Number(x.monto_apertura),
                      esperado: x.monto_esperado === null ? null : Number(x.monto_esperado),
                      declarado: x.monto_declarado === null ? null : Number(x.monto_declarado),
                      notas: x.notas_cierre,
                    })
                  }
                  className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
                >
                  <Printer className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Arqueo turno={arqueo} onCerrar={() => setArqueo(null)} />
    </Tarjeta>
  );
}

/** Reporte de cierre de turno: movimientos por método y cuadre del efectivo. */
function Arqueo({
  turno,
  onCerrar,
}: {
  turno: { id: string; cajero: string; abierto_en: string; cerrado_en: string | null; apertura: number; esperado: number | null; declarado: number | null; notas: string | null } | null;
  onCerrar: () => void;
}) {
  const q = useQuery({
    queryKey: ["arqueo", turno?.id],
    enabled: !!turno,
    queryFn: async () =>
      datos(await supabase.from("movimientos_financieros").select("tipo, categoria, concepto, monto, metodo, creado_en").eq("turno_id", turno!.id).order("creado_en")) ?? [],
  });
  const $ = (v: number) => moneda(v);
  const movs = q.data ?? [];
  const metodos = [...new Set(movs.map((m) => m.metodo))];
  const suma = (tipo: string, metodo?: string) => movs.filter((m) => m.tipo === tipo && (!metodo || m.metodo === metodo)).reduce((s, m) => s + Number(m.monto), 0);
  const esperadoEfectivo = turno ? turno.apertura + suma("ingreso", "efectivo") - suma("egreso", "efectivo") : 0;
  const esperado = turno?.esperado ?? esperadoEfectivo;
  const dif = turno?.declarado !== null && turno?.declarado !== undefined ? turno.declarado - esperado : null;

  return (
    <Documento abierto={!!turno} onCerrar={onCerrar} titulo="Arqueo de caja" nombreArchivo={`Arqueo ${turno?.cajero ?? ""} ${turno?.abierto_en.slice(0, 10) ?? ""}`}>
      {turno && (
        <>
          <EncabezadoDocumento
            titulo="Arqueo de caja"
            subtitulo={
              <>
                {turno.cajero} · {fechaHora(turno.abierto_en)} → {turno.cerrado_en ? fechaHora(turno.cerrado_en) : "turno abierto"}
              </>
            }
          />
          <TablaDocumento
            encabezados={["Método", "Ingresos", "Egresos", "Neto"]}
            filas={metodos.map((m) => [METODOS_PAGO[m], $(suma("ingreso", m)), $(suma("egreso", m)), $(suma("ingreso", m) - suma("egreso", m))])}
            pie={["Total", $(suma("ingreso")), $(suma("egreso")), $(suma("ingreso") - suma("egreso"))]}
          />
          <div className="mt-6 grid grid-cols-2 gap-8">
            <TablaDocumento
              encabezados={["Cuadre de efectivo", "Monto"]}
              filas={[
                ["Fondo de apertura", $(turno.apertura)],
                ["Ingresos en efectivo", $(suma("ingreso", "efectivo"))],
                ["Egresos en efectivo", $(-suma("egreso", "efectivo"))],
                ["Efectivo esperado", $(esperado)],
                ["Efectivo contado", turno.declarado !== null ? $(turno.declarado) : "—"],
              ]}
              pie={["Diferencia", dif === null ? "—" : `${dif < 0 ? "Faltante " : dif > 0 ? "Sobrante " : ""}${$(Math.abs(dif))}`]}
            />
            <div className="text-[0.75rem]">
              {turno.notas && (
                <p>
                  <b>Notas de cierre:</b> {turno.notas}
                </p>
              )}
              <p className="mt-16 w-56 border-t border-[#101828] pt-1 text-center text-[0.6875rem]">Cajero</p>
              <p className="mt-12 w-56 border-t border-[#101828] pt-1 text-center text-[0.6875rem]">Supervisor</p>
            </div>
          </div>
          <div className="mt-6">
            <TablaDocumento
              encabezados={["Hora", "Concepto", "Método", "Ingreso", "Egreso"]}
              filas={movs.map((m) => [hora(m.creado_en), m.concepto, METODOS_PAGO[m.metodo], m.tipo === "ingreso" ? $(m.monto) : "", m.tipo === "egreso" ? $(m.monto) : ""])}
            />
          </div>
        </>
      )}
    </Documento>
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
          <span className="font-semibold tabular">{moneda(esperado)}</span>
        </div>
        <Entrada etiqueta="Efectivo contado" type="number" step="0.01" value={declarado} onChange={(e) => setDeclarado(e.target.value)} />
        <AnimatePresence>
          {dif !== null && Math.abs(dif) >= 0.01 && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn("overflow-hidden text-sm font-medium", dif < 0 ? "text-peligro" : "text-aviso")}
            >
              {dif < 0 ? "Faltante" : "Sobrante"} de {moneda(Math.abs(dif))}
            </motion.p>
          )}
        </AnimatePresence>
        <AreaTexto etiqueta="Notas de cierre" className="min-h-16" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Nuevo cobro: conceptos, pagos combinados (sin repetir método), NCF y comisiones
// ---------------------------------------------------------------------------
interface Linea {
  clave: number;
  servicio_id: string;
  descripcion: string;
  categoria: string;
  cantidad: number;
  precio: number;
}
interface Pago {
  clave: number;
  metodo: MetodoPago;
  monto: string;
  referencia: string;
  /** Efectivo que entregó el paciente (para calcular la devuelta). */
  recibido?: string;
  /** Sigue el total mientras la cajera no escriba otro monto. */
  auto?: boolean;
}

/** Línea de cobro para un servicio del catálogo (o en blanco para "Otro concepto"). */
function lineaDe(s: Fila<"servicios"> | undefined, enBlanco = false): Linea[] {
  if (!s && !enBlanco) return [];
  return [{ clave: Date.now(), servicio_id: s?.id ?? "", descripcion: s?.nombre ?? "", categoria: s?.categoria ?? "otro", cantidad: 1, precio: Number(s?.precio ?? 0) }];
}

function NuevoCobro({
  abierto,
  cita,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  /** Si viene de recepción: paciente, servicio y médico ya elegidos; al cobrar se activa el turno. */
  cita?: CitaConRelaciones | null;
  onCerrar: () => void;
  onListo: (id: string) => void;
}) {
  const { sistemaId } = useSistema();
  const servicios = useServicios(sistemaId);
  const aseguradoras = useAseguradoras(sistemaId);
  const personal = useMedicos(sistemaId);
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  // Clave única por intento de cobro: si el clic se repite o la red reintenta, no se cobra dos veces.
  const claveCobro = useRef(crypto.randomUUID());
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [aseguradora, setAseguradora] = useState("");
  const [autorizacion, setAutorizacion] = useState("");
  const [descuento, setDescuento] = useState("0");
  const [conNcf, setConNcf] = useState(false);
  const [tipoNcf, setTipoNcf] = useState("B02");
  const [clienteRnc, setClienteRnc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [profesional, setProfesional] = useState("");
  const { perfil } = useSesion();
  const [area, setArea] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    claveCobro.current = crypto.randomUUID();
    setArea(cita?.especialidad ?? null);
    setPaciente(cita?.paciente ? { ...cita.paciente } : null);
    setLineas([]);
    // Por defecto el paciente paga todo en efectivo; para dejarlo a crédito se quita el pago.
    setPagos([{ clave: 1, metodo: "efectivo", monto: "", referencia: "", auto: true }]);
    setAseguradora("");
    setAutorizacion("");
    setDescuento("0");
    setTipoNcf("B02");
    setClienteRnc("");
    setClienteNombre("");
    setProfesional(cita?.medico_id ?? "");
    setConNcf(false);
  }, [abierto, cita]);

  // El servicio que eligió recepción entra solo (cuando el catálogo ya cargó).
  useEffect(() => {
    if (!abierto || !cita?.servicio_id || !servicios.data) return;
    setLineas((ls) => (ls.length ? ls : lineaDe(servicios.data!.find((s) => s.id === cita.servicio_id))));
  }, [abierto, cita, servicios.data]);

  useEffect(() => {
    setAseguradora(paciente?.aseguradora_id ?? "");
  }, [paciente]);

  const secuencias = useQuery({
    queryKey: ["ncf-activas", sistemaId],
    enabled: abierto,
    queryFn: async () => datos(await supabase.from("secuencias_ncf").select("tipo").eq("sistema_id", sistemaId).eq("activo", true)) ?? [],
  });

  const saldoAnticipo = useQuery({
    queryKey: ["saldo-anticipo", sistemaId, paciente?.id],
    enabled: !!paciente,
    queryFn: async () => {
      const r = datos(await supabase.from("saldos_anticipo").select("anticipado, aplicado").eq("sistema_id", sistemaId).eq("paciente_id", paciente!.id).maybeSingle());
      return r ? Number(r.anticipado) - Number(r.aplicado) : 0;
    },
  });

  const coberturas = useQuery({
    queryKey: ["coberturas", sistemaId, aseguradora],
    enabled: !!aseguradora,
    queryFn: async () => datos(await supabase.from("coberturas").select("servicio_id, monto_cubierto, precio").eq("aseguradora_id", aseguradora)),
  });

  // Tarifario de la aseguradora elegida: precio pactado y monto cubierto por servicio.
  const pactados = useMemo(
    () =>
      aseguradora && coberturas.data
        ? new Map(coberturas.data.map((c) => [c.servicio_id, { precio: c.precio === null ? null : Number(c.precio), monto_cubierto: Number(c.monto_cubierto) }]))
        : null,
    [aseguradora, coberturas.data],
  );
  // Vista previa; el servidor recalcula con las mismas reglas (registrar_cobro).
  const precioLinea = (l: Linea) => (l.servicio_id ? (pactados?.get(l.servicio_id)?.precio ?? l.precio) : l.precio);
  const cubierto = (l: Linea) => {
    const c = l.servicio_id ? pactados?.get(l.servicio_id) : undefined;
    return c ? Math.min(c.monto_cubierto, precioLinea(l)) * l.cantidad : 0;
  };
  const subtotal = lineas.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);
  const cobertura = lineas.reduce((s, l) => s + cubierto(l), 0);
  const total = Math.max(subtotal - cobertura - (Number(descuento) || 0), 0);
  const pagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const credito = Math.max(total - pagado, 0);
  const excede = pagado - total > 0.004;
  const devuelta = pagos.reduce((s, p) => (p.metodo === "efectivo" && Number(p.recibido) > Number(p.monto) ? s + Number(p.recibido) - Number(p.monto) : s), 0);

  useEffect(() => {
    setPagos((ps) => (ps.some((p) => p.auto) ? ps.map((p) => (p.auto ? { ...p, monto: total > 0 ? total.toFixed(2) : "" } : p)) : ps));
  }, [total]);

  // Ítems agrupados por categoría (como quedarán en la factura y en el asiento).
  const grupos = useMemo(() => {
    const g = new Map<string, Linea[]>();
    lineas.forEach((l) => g.set(l.categoria, [...(g.get(l.categoria) ?? []), l]));
    return [...g.entries()];
  }, [lineas]);

  const metodosUsados = new Set(pagos.map((p) => p.metodo));
  const disponibles = [...METODOS_DINERO, ...((saldoAnticipo.data ?? 0) > 0 ? (["anticipo"] as MetodoPago[]) : [])].filter((m) => !metodosUsados.has(m));

  const agregarLinea = (servicioId: string) => {
    setLineas((ls) => [...ls, ...lineaDe(servicios.data?.find((x) => x.id === servicioId), true)]);
  };

  const agregarPago = () => {
    const metodo = disponibles[0];
    if (!metodo) return;
    const restante = Math.max(total - pagado, 0);
    const monto = metodo === "anticipo" ? Math.min(restante, saldoAnticipo.data ?? 0) : restante;
    setPagos((ps) => [...ps, { clave: Date.now(), metodo, monto: monto ? monto.toFixed(2) : "", referencia: "" }]);
  };

  // Médicos del área elegida (si hay alguno); si no, todos, agrupados por especialidad.
  const todosMedicos = personal.data ?? [];
  const delArea = area ? todosMedicos.filter((m) => m.especialidad === area) : [];
  const medicos = delArea.length ? delArea : todosMedicos;
  const hayNcf = (tipo: string) => !!secuencias.data?.some((s) => s.tipo === tipo);
  const haySecuencias = (secuencias.data?.length ?? 0) > 0;

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_cobro", {
          p_sistema: sistemaId,
          p_paciente: paciente!.id,
          p_items: lineas.map((l) =>
            l.servicio_id
              ? { servicio_id: l.servicio_id, cantidad: l.cantidad }
              : { descripcion: l.descripcion, categoria: l.categoria, cantidad: l.cantidad, precio_unitario: l.precio },
          ),
          p_pagos: pagos
            .filter((p) => Number(p.monto) > 0)
            .map((p) => ({ metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia || null, recibido: p.metodo === "efectivo" && Number(p.recibido) > 0 ? Number(p.recibido) : null })),
          p_aseguradora: aseguradora || undefined,
          p_autorizacion: autorizacion || undefined,
          p_descuento: Number(descuento) || 0,
          p_tipo_ncf: conNcf ? tipoNcf : undefined,
          p_cliente_rnc: clienteRnc || undefined,
          p_cliente_nombre: clienteNombre || undefined,
          p_profesional: profesional || undefined,
          p_cita: cita?.id,
          p_idempotencia: claveCobro.current,
        }),
      ) as { id: string; numero: string; ncf: string | null; turno: string | null },
    onSuccess: (r) => {
      claveCobro.current = crypto.randomUUID();
      toast.success(`Cobro ${r.numero}${r.ncf ? ` · NCF ${r.ncf}` : ""} registrado${r.turno ? ` · turno ${r.turno}` : ""}`);
      onCerrar();
      onListo(r.id);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      lateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nuevo cobro"
      pie={
        <>
          <div className="mr-auto text-sm">
            <span className="text-texto-2">Total </span>
            <span className="text-lg font-semibold tabular">
              <NumeroAnimado valor={total} formato={(n) => moneda(n)} />
            </span>
          </div>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!paciente || lineas.length === 0 || excede} onClick={() => m.mutate()}>
            Registrar cobro
          </Boton>
        </>
      }
    >
      <div className="space-y-6">
        {/* Turno del quiosco sin registrar: llega con su cédula ya buscada (o se registra aquí). */}
        <SelectorPaciente valor={paciente} onChange={setPaciente} textoInicial={cita && !cita.paciente ? (cita.cedula_llegada ?? undefined) : undefined} />

        {/* El seguro va antes que los servicios: define precios pactados y cobertura. */}
        <section className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Seguro médico" value={aseguradora} onChange={(e) => setAseguradora(e.target.value)}>
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
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.8125rem] font-medium text-texto-2">Servicios</span>
            <div className="flex gap-2">
              <SelectorServicio servicios={servicios.data ?? []} pactados={pactados} area={area} onArea={setArea} onElegir={(s) => agregarLinea(s.id)} />
              <Boton variante="secundario" onClick={() => agregarLinea("")} title="Cobrar algo que no está en el catálogo">
                Otro concepto
              </Boton>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-borde">
            {lineas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-texto-3">Agrega al menos un servicio o concepto.</p>
            ) : (
              grupos.map(([cat, ls]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between bg-superficie-2/70 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-wide text-texto-3 uppercase">
                    <span>{CATEGORIAS_SERVICIO[cat] ?? cat}</span>
                    <span className="tabular">{moneda(ls.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0))}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {ls.map((l) => (
                      <motion.div
                        key={l.clave}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden border-t border-borde"
                      >
                        <div className="flex items-center gap-2 px-3 py-2">
                          {l.servicio_id ? (
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.descripcion}</span>
                          ) : (
                            <>
                              <input
                                placeholder="Descripción"
                                value={l.descripcion}
                                onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, descripcion: e.target.value } : y)))}
                                className="h-8 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-2 text-sm"
                              />
                              <select
                                value={l.categoria}
                                onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, categoria: e.target.value } : y)))}
                                className="h-8 rounded-lg border border-borde bg-superficie px-1.5 text-xs"
                              >
                                {Object.entries(CATEGORIAS_SERVICIO).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <input
                            type="number"
                            min={1}
                            value={l.cantidad}
                            onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, cantidad: Math.max(1, Number(e.target.value)) } : y)))}
                            className="h-8 w-14 rounded-lg border border-borde bg-superficie px-2 text-sm tabular"
                          />
                          {l.servicio_id ? (
                            <span className="w-24 text-right text-sm tabular">{moneda(precioLinea(l))}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.precio}
                              onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, precio: Number(e.target.value) } : y)))}
                              className="h-8 w-24 rounded-lg border border-borde bg-superficie px-2 text-right text-sm tabular"
                            />
                          )}
                          {cubierto(l) > 0 ? (
                            <Insignia tono="info">−{moneda(cubierto(l))}</Insignia>
                          ) : (
                            aseguradora && pactados && <Insignia tono="aviso">No lo cubre el seguro</Insignia>
                          )}
                          <button
                            onClick={() => setLineas((x) => x.filter((y) => y.clave !== l.clave))}
                            className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Médico que atendió" value={profesional} onChange={(e) => setProfesional(e.target.value)}>
            <option value="">Seleccionar…</option>
            <OpcionesMedicos medicos={medicos} />
          </Selector>
          <Entrada etiqueta="Descuento" type="number" min={0} step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          {/* Quien cobra es el vendedor/comisionista: lo fija el servidor con la sesión. */}
          <Campo etiqueta="Procesado por" className="col-span-2">
            {() => (
              <div className="flex h-9 items-center gap-2.5 rounded-[10px] border border-borde bg-superficie-2 px-2.5 text-sm">
                <Avatar nombre={perfil?.nombre_completo} foto={perfil?.foto} tamano={22} />
                <span className="flex-1 truncate font-medium">{perfil?.nombre_completo}</span>
                <Lock className="size-3.5 text-texto-3" />
              </div>
            )}
          </Campo>
        </section>

        <section className="space-y-3 rounded-xl border border-borde p-3.5">
          <Interruptor
            activo={conNcf}
            onChange={(v) => {
              setConNcf(v);
              // Al activarlo, preselecciona un tipo con secuencia disponible (B02 si la hay).
              if (v && !hayNcf(tipoNcf)) setTipoNcf(secuencias.data?.[0]?.tipo ?? "B02");
            }}
            etiqueta="Emitir comprobante fiscal (NCF)"
            disabled={!haySecuencias}
          />
          {!haySecuencias && <p className="text-xs text-texto-3">Primero hay que cargar los comprobantes autorizados por la DGII (Contabilidad → Comprobantes fiscales).</p>}
          <AnimatePresence initial={false}>
            {conNcf && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <Selector etiqueta="Tipo de comprobante" contenedor="col-span-2" value={tipoNcf} onChange={(e) => setTipoNcf(e.target.value)}>
                    {Object.entries(TIPOS_NCF)
                      .filter(([k]) => hayNcf(k))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </Selector>
                  {tipoNcf !== "B02" && (
                    <>
                      <Entrada etiqueta="RNC / cédula del cliente" value={clienteRnc} onChange={(e) => setClienteRnc(e.target.value)} />
                      <Entrada etiqueta="Razón social" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.8125rem] font-medium text-texto-2">Pagos</span>
            <div className="flex items-center gap-3">
              {(saldoAnticipo.data ?? 0) > 0 && (
                <span className="text-xs text-exito">Anticipo disponible: {moneda(saldoAnticipo.data)}</span>
              )}
              <Boton variante="secundario" tamano="sm" icono={<Plus className="size-3.5" />} disabled={disponibles.length === 0} onClick={agregarPago}>
                Agregar pago
              </Boton>
            </div>
          </div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {pagos.map((p) => (
                <motion.div
                  key={p.clave}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={p.metodo}
                      onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, metodo: e.target.value as MetodoPago } : y)))}
                      className="h-9 w-40 rounded-[10px] border border-borde bg-superficie px-2 text-sm"
                    >
                      {[p.metodo, ...disponibles].map((mt) => (
                        <option key={mt} value={mt}>
                          {METODOS_PAGO[mt]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Monto"
                      value={p.monto}
                      onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, monto: e.target.value, auto: false } : y)))}
                      className="h-9 w-36 rounded-[10px] border border-borde bg-superficie px-3 text-right text-sm tabular"
                    />
                    {p.metodo === "efectivo" ? (
                      // En efectivo: cuánto entregó el paciente, para la devuelta.
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Recibe RD$"
                        title="Efectivo que entrega el paciente"
                        value={p.recibido ?? ""}
                        onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, recibido: e.target.value } : y)))}
                        className="h-9 min-w-0 flex-1 rounded-[10px] border border-borde bg-superficie px-3 text-right text-sm tabular"
                      />
                    ) : (
                      <input
                        placeholder={p.metodo === "anticipo" ? "" : "Referencia / últimos 4"}
                        disabled={p.metodo === "anticipo"}
                        value={p.referencia}
                        onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, referencia: e.target.value } : y)))}
                        className="h-9 min-w-0 flex-1 rounded-[10px] border border-borde bg-superficie px-3 text-sm disabled:opacity-40"
                      />
                    )}
                    <button
                      onClick={() => setPagos((x) => x.filter((y) => y.clave !== p.clave))}
                      className="grid size-9 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {pagos.length === 0 && (
              <p className="rounded-xl bg-[color-mix(in_oklab,var(--aviso)_10%,var(--superficie))] px-4 py-3 text-sm text-aviso">
                Sin pagos: el total quedará como deuda del paciente.
              </p>
            )}
          </div>
        </section>

        <dl className="space-y-1.5 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          {[
            ["Subtotal", subtotal],
            ["Cubre el seguro", -cobertura],
            ["Descuento", -(Number(descuento) || 0)],
            ["Paga el paciente", total],
            ["Pagado", pagado],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between">
              <dt className="text-texto-2">{k}</dt>
              <dd className="tabular">{moneda(v as number)}</dd>
            </div>
          ))}
          {devuelta > 0 && (
            <div className="flex justify-between text-base font-semibold">
              <dt>Devuelta</dt>
              <dd className="tabular">{moneda(devuelta)}</dd>
            </div>
          )}
          <div className={cn("flex justify-between border-t border-borde pt-1.5 font-semibold", excede ? "text-peligro" : credito > 0 ? "text-aviso" : "text-exito")}>
            <dt>{excede ? "Los pagos superan el total" : credito > 0 ? "Queda debiendo" : "Pagado completo"}</dt>
            <dd className="tabular">{moneda(excede ? pagado - total : credito)}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Factura / recibo con ítems agrupados por categoría
// ---------------------------------------------------------------------------
function Factura({ cobro, onCerrar }: { cobro: CobroFila | null; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const emisor = useQuery({
    queryKey: ["sistema", sistemaId, "membrete"],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      datos(await supabase.from("sistemas").select("razon_social, rnc, direccion, telefono").eq("id", sistemaId).single()),
  }).data;
  const [ultimo, setUltimo] = useState(cobro);
  useEffect(() => {
    if (cobro) setUltimo(cobro);
  }, [cobro]);
  const c = cobro ?? ultimo;
  if (!c) return null;

  const grupos = new Map<string, CobroFila["detalles"]>();
  (c.detalles ?? []).forEach((d) => grupos.set(d.categoria, [...(grupos.get(d.categoria) ?? []), d]));
  const linea = "my-2 border-dashed border-black/40";
  const pagado = (c.pagos ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const cobertura = Number(c.subtotal) > 0 ? Math.round((Number(c.cobertura_seguro) / Number(c.subtotal)) * 100) : 0;

  return (
    <Documento abierto={!!cobro} onCerrar={onCerrar} titulo={c.ncf ? `Factura ${c.ncf}` : `Recibo ${c.numero}`} nombreArchivo={`${c.ncf ?? c.numero} - ${c.paciente?.nombres} ${c.paciente?.apellidos}`} formato="ticket">
      {(sistema.logo_factura ?? sistema.logo_url) && <img src={(sistema.logo_factura ?? sistema.logo_url)!} alt="" className="mx-auto mb-1.5 max-h-20 w-auto" />}
      <p className="text-center text-[0.875rem] font-bold">{(emisor?.razon_social || sistema.nombre).toUpperCase()}</p>
      {emisor?.rnc && <p className="text-center">RNC {emisor.rnc}</p>}
      {emisor?.direccion && <p className="text-center">{emisor.direccion}</p>}
      {emisor?.telefono && <p className="text-center">Tel. {emisor.telefono}</p>}
      <hr className={linea} />
      {c.ncf ? (
        <>
          <p className="text-center font-bold">{TIPOS_NCF[c.tipo_ncf ?? ""]?.split(" · ")[1]?.toUpperCase() ?? "FACTURA"}</p>
          <p className="text-center">NCF: {c.ncf}</p>
        </>
      ) : (
        <p className="text-center">Recibo {c.numero}</p>
      )}
      <p className="text-center">{fechaHora(c.creado_en)}</p>
      <hr className={linea} />
      <p>
        Paciente: {c.paciente?.nombres} {c.paciente?.apellidos}
      </p>
      <p>Expediente: {c.paciente?.expediente}</p>
      {c.cliente_rnc && (
        <p>
          Cliente: {c.cliente_nombre ?? ""} · RNC {c.cliente_rnc}
        </p>
      )}
      {c.profesional && <p>Atendido por: {c.profesional.nombre_completo}</p>}
      <hr className={linea} />
      {[...grupos.entries()].map(([cat, ds]) => (
        <div key={cat} className="mb-1.5">
          <p className="font-bold">{(CATEGORIAS_SERVICIO[cat] ?? cat).toUpperCase()}</p>
          {ds.map((d, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="truncate">
                {Number(d.cantidad)} × {d.descripcion}
              </span>
              <span>{moneda(Number(d.precio_unitario) * Number(d.cantidad))}</span>
            </div>
          ))}
        </div>
      ))}
      <hr className={linea} />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{moneda(c.subtotal)}</span>
      </div>
      {c.aseguradora && (
        <>
          <div className="flex justify-between">
            <span>
              Cubre {c.aseguradora.nombre} ({cobertura}%)
            </span>
            <span>−{moneda(c.cobertura_seguro)}</span>
          </div>
          {c.numero_autorizacion && <p>Autorización: {c.numero_autorizacion}</p>}
        </>
      )}
      {Number(c.monto_fondo) > 0 && (
        <div className="flex justify-between">
          <span>Fondo interno de la fundación</span>
          <span>{moneda(c.monto_fondo)}</span>
        </div>
      )}
      {Number(c.descuento) > 0 && (
        <div className="flex justify-between">
          <span>Descuento</span>
          <span>−{moneda(c.descuento)}</span>
        </div>
      )}
      <div className="flex justify-between text-[0.875rem] font-bold">
        <span>TOTAL</span>
        <span>{moneda(c.total)}</span>
      </div>
      <hr className={linea} />
      {(c.pagos ?? []).map((p) => (
        <div key={p.metodo} className="flex justify-between">
          <span>
            {METODOS_PAGO[p.metodo]}
            {p.referencia ? ` · ${p.referencia}` : ""}
          </span>
          <span>{moneda(p.monto)}</span>
        </div>
      ))}
      <div className="flex justify-between">
        <span>Monto pagado</span>
        <span>{moneda(pagado)}</span>
      </div>
      {(c.pagos ?? [])
        .filter((p) => p.recibido && Number(p.recibido) > Number(p.monto))
        .map((p) => (
          <div key={`dev-${p.metodo}`}>
            <div className="flex justify-between">
              <span>Efectivo recibido</span>
              <span>{moneda(p.recibido)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Devuelta</span>
              <span>{moneda(Number(p.recibido) - Number(p.monto))}</span>
            </div>
          </div>
        ))}
      {Number(c.monto_credito) > 0 && (
        <div className="flex justify-between font-bold">
          <span>SALDO PENDIENTE</span>
          <span>{moneda(c.monto_credito)}</span>
        </div>
      )}
      {c.anulacion?.length ? <p className="mt-2 text-center font-bold">*** ANULADO ***</p> : null}
      {c.cita?.turno && !c.anulacion?.length && <BloqueTurno turno={c.cita.turno} destino={destinoTurno(c.cita)} />}
      <hr className={linea} />
      <p className="text-center">Cajero: {c.cajero?.nombre_completo}</p>
      <p className="text-center">¡Gracias por confiar en nosotros!</p>
    </Documento>
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
      descripcion="Se registran egresos compensatorios, se revierte el asiento y las comisiones. El cobro original se conserva."
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
      titulo="Registrar movimiento de caja"
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
        <Entrada etiqueta="Concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Pago de mensajería" />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Selector etiqueta="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_DINERO.map((x) => (
              <option key={x} value={x}>
                {METODOS_PAGO[x]}
              </option>
            ))}
          </Selector>
        </div>
        <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {["general", "suministros", "servicios", "mantenimiento", "reembolso", "otro"].map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </Selector>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Anticipos
// ---------------------------------------------------------------------------
interface Comprobante {
  titulo: string;
  numero: string;
  fecha: string;
  lineas: [string, string][];
  monto: number;
}

function Anticipos({ onComprobante }: { onComprobante: (c: Comprobante) => void }) {
  const { sistemaId } = useSistema();
  const q = useQuery({
    queryKey: [...claves.caja(sistemaId), "anticipos"],
    queryFn: async () =>
      datos(
        await supabase
          .from("anticipos")
          .select("id, numero, monto, metodo, referencia, fecha, notas, creado_en, paciente:pacientes!anticipos_sistema_id_paciente_id_fkey(nombres, apellidos, expediente)")
          .eq("sistema_id", sistemaId)
          .order("creado_en", { ascending: false })
          .limit(100),
      ),
  });
  return (
    <Tarjeta className="overflow-hidden">
      {q.isLoading ? (
        <Esqueleto className="m-5 h-40" />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<HandCoins />} titulo="Sin anticipos" descripcion="Los pagos adelantados de pacientes se aplican luego como método de pago en sus cobros." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((a) => (
            <li key={a.id} className="group flex items-center gap-4 px-5 py-3 text-sm">
              <span className="w-28 font-medium tabular">{a.numero}</span>
              <span className="w-28 text-texto-2">{fecha(a.fecha + "T00:00:00")}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.paciente?.nombres} {a.paciente?.apellidos}
              </span>
              <Insignia>{METODOS_PAGO[a.metodo]}</Insignia>
              <span className="w-32 text-right font-semibold tabular">{moneda(a.monto)}</span>
              <button
                title="Comprobante"
                onClick={() =>
                  onComprobante({
                    titulo: "Comprobante de anticipo",
                    numero: a.numero,
                    fecha: a.fecha,
                    monto: Number(a.monto),
                    lineas: [
                      ["Paciente", `${a.paciente?.nombres} ${a.paciente?.apellidos}`],
                      ["Expediente", a.paciente?.expediente ?? ""],
                      ["Método", METODOS_PAGO[a.metodo]],
                      ...(a.referencia ? ([["Referencia", a.referencia]] as [string, string][]) : []),
                      ...(a.notas ? ([["Notas", a.notas]] as [string, string][]) : []),
                    ],
                  })
                }
                className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto"
              >
                <Printer className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function NuevoAnticipo({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: (c: Comprobante) => void }) {
  const { sistemaId } = useSistema();
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [fechaAnt, setFechaAnt] = useState(isoDia());
  const [notas, setNotas] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setPaciente(null);
    setMonto("");
    setMetodo("efectivo");
    setReferencia("");
    setFechaAnt(isoDia());
    setNotas("");
  }, [abierto]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_anticipo", {
          p_sistema: sistemaId,
          p_paciente: paciente!.id,
          p_monto: Number(monto),
          p_metodo: metodo,
          p_referencia: referencia || undefined,
          p_fecha: fechaAnt,
          p_notas: notas || undefined,
        }),
      ) as { numero: string },
    onSuccess: (r) => {
      toast.success(`Anticipo ${r.numero} registrado`);
      onCerrar();
      onListo({
        titulo: "Comprobante de anticipo",
        numero: r.numero,
        fecha: fechaAnt,
        monto: Number(monto),
        lineas: [
          ["Paciente", `${paciente!.nombres} ${paciente!.apellidos}`],
          ["Expediente", paciente!.expediente],
          ["Método", METODOS_PAGO[metodo]],
          ...(referencia ? ([["Referencia", referencia]] as [string, string][]) : []),
        ],
      });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const atrasado = fechaAnt < isoDia();

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar anticipo"
      descripcion="Queda como saldo a favor del paciente y se aplica en sus próximos cobros."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!paciente || !(Number(monto) > 0)} onClick={() => m.mutate()}>
            Registrar anticipo
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorPaciente valor={paciente} onChange={setPaciente} />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Selector etiqueta="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_DINERO.map((x) => (
              <option key={x} value={x}>
                {METODOS_PAGO[x]}
              </option>
            ))}
          </Selector>
          <Entrada
            etiqueta="Fecha del pago"
            type="date"
            max={isoDia()}
            value={fechaAnt}
            onChange={(e) => setFechaAnt(e.target.value)}
            ayuda={atrasado ? "Registro con fecha anterior (queda en la bitácora)." : undefined}
          />
          <Entrada etiqueta="Referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} disabled={metodo === "efectivo"} />
        </div>
        <AreaTexto etiqueta="Notas" className="min-h-16" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Depósito para cirugía programada" />
      </div>
    </Modal>
  );
}

function ComprobanteTicket({ comprobante: c, onCerrar }: { comprobante: Comprobante | null; onCerrar: () => void }) {
  const { sistema } = useSistema();
  const [ultimo, setUltimo] = useState(c);
  useEffect(() => {
    if (c) setUltimo(c);
  }, [c]);
  const x = c ?? ultimo;
  if (!x) return null;
  return (
    <Documento abierto={!!c} onCerrar={onCerrar} titulo={`${x.titulo} ${x.numero}`} nombreArchivo={`${x.titulo} ${x.numero}`} formato="ticket">
      <p className="text-center text-[0.875rem] font-bold">{sistema.nombre}</p>
      <p className="text-center font-bold">{x.titulo.toUpperCase()}</p>
      <p className="text-center">
        {x.numero} · {fecha(x.fecha + "T00:00:00")}
      </p>
      <hr className="my-2 border-dashed border-black/40" />
      {x.lineas.map(([k, v]) => (
        <p key={k}>
          {k}: {v}
        </p>
      ))}
      <hr className="my-2 border-dashed border-black/40" />
      <div className="flex justify-between text-[0.875rem] font-bold">
        <span>MONTO</span>
        <span>{moneda(x.monto)}</span>
      </div>
      <p className="mt-6 text-center">______________________</p>
      <p className="text-center">Firma</p>
    </Documento>
  );
}

// ---------------------------------------------------------------------------
// Cuentas por cobrar
// ---------------------------------------------------------------------------
interface Cxc {
  cobro_id: string;
  numero: string;
  ncf: string | null;
  creado_en: string;
  paciente_id: string;
  aseguradora_id: string | null;
  numero_autorizacion: string | null;
  pendiente_paciente: number;
  pendiente_aseguradora: number;
}

function CuentasPorCobrar({ onComprobante }: { onComprobante: (c: Comprobante) => void }) {
  const { sistemaId, roles } = useSistema();
  const [deudor, setDeudor] = useState<"paciente" | "aseguradora">("paciente");
  const [abonar, setAbonar] = useState<{ cxc: Cxc; nombre: string } | null>(null);
  const [estado, setEstado] = useState<ContactoCuenta | null>(null);
  const aseguradoras = useAseguradoras(sistemaId);

  const q = useQuery({
    queryKey: [...claves.caja(sistemaId), "cxc"],
    queryFn: async () => {
      const filas = (datos(await supabase.from("cuentas_por_cobrar").select("*").eq("sistema_id", sistemaId).order("creado_en")) ?? []) as unknown as Cxc[];
      const ids = [...new Set(filas.map((f) => f.paciente_id))];
      const pacientes = ids.length
        ? (datos(await supabase.from("pacientes").select("id, nombres, apellidos, expediente").in("id", ids)) ?? [])
        : [];
      return { filas, pacientes: new Map(pacientes.map((p) => [p.id, p])) };
    },
  });

  const pendientes = (q.data?.filas ?? []).filter((f) => (deudor === "paciente" ? Number(f.pendiente_paciente) : Number(f.pendiente_aseguradora)) > 0.004);
  const grupos = new Map<string, Cxc[]>();
  pendientes.forEach((f) => {
    const k = deudor === "paciente" ? f.paciente_id : (f.aseguradora_id ?? "");
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  });
  const nombreDe = (k: string) => {
    if (deudor === "paciente") {
      const p = q.data?.pacientes.get(k);
      return p ? `${p.nombres} ${p.apellidos}` : "Paciente";
    }
    return aseguradoras.data?.find((a) => a.id === k)?.nombre ?? "Aseguradora";
  };
  const pend = (f: Cxc) => Number(deudor === "paciente" ? f.pendiente_paciente : f.pendiente_aseguradora);
  const total = pendientes.reduce((s, f) => s + pend(f), 0);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Segmentado
          id="cxc-deudor"
          valor={deudor}
          onChange={setDeudor}
          opciones={[
            { valor: "paciente", etiqueta: "Pacientes" },
            { valor: "aseguradora", etiqueta: "Aseguradoras (ARS)" },
          ]}
        />
        <p className="text-sm text-texto-2">
          Total por cobrar: <span className="font-semibold text-texto tabular">{moneda(total)}</span>
        </p>
      </div>
      <Tarjeta className="overflow-hidden">
        {q.isLoading ? (
          <Esqueleto className="m-5 h-40" />
        ) : grupos.size === 0 ? (
          <Vacio icono={<FileText />} titulo="Nada pendiente" descripcion={deudor === "paciente" ? "Ningún paciente tiene saldo a crédito." : "No hay coberturas de ARS pendientes de cobro."} />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {[...grupos.entries()].map(([k, fs]) => (
              <motion.li key={k} variants={itemEscalonado} className="px-5 py-3.5">
                <div className="mb-2 flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombreDe(k)}</span>
                  <span className="text-sm font-semibold tabular">{moneda(fs.reduce((s, f) => s + pend(f), 0))}</span>
                  <Boton
                    tamano="sm"
                    variante="secundario"
                    icono={<FileText className="size-3.5" />}
                    onClick={() => setEstado({ tipo: deudor, id: k, nombre: nombreDe(k), detalle: deudor === "paciente" ? q.data?.pacientes.get(k)?.expediente : undefined })}
                  >
                    Estado de cuenta
                  </Boton>
                </div>
                <ul className="space-y-1">
                  {fs.map((f) => (
                    <li key={f.cobro_id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-superficie-2/60">
                      <span className="w-28 tabular text-texto-2">{f.ncf ?? f.numero}</span>
                      <span className="w-24 text-texto-3">{fecha(f.creado_en)}</span>
                      {deudor === "aseguradora" && (
                        <span className="min-w-0 flex-1 truncate text-texto-2">
                          {q.data?.pacientes.get(f.paciente_id)?.nombres} {q.data?.pacientes.get(f.paciente_id)?.apellidos}
                          {f.numero_autorizacion ? ` · Aut. ${f.numero_autorizacion}` : ""}
                        </span>
                      )}
                      <span className="ml-auto w-28 text-right font-medium tabular">{moneda(pend(f))}</span>
                      {puedeEscribir.abonos(roles) && (
                        <Boton tamano="sm" variante="suave" onClick={() => setAbonar({ cxc: f, nombre: nombreDe(k) })}>
                          Abonar
                        </Boton>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>
      <Abonar
        datos_={abonar}
        deudor={deudor}
        pendiente={abonar ? pend(abonar.cxc) : 0}
        onCerrar={() => setAbonar(null)}
        onListo={onComprobante}
      />
      <EstadoCuenta contacto={estado} onCerrar={() => setEstado(null)} />
    </>
  );
}

function Abonar({
  datos_: d,
  deudor,
  pendiente,
  onCerrar,
  onListo,
}: {
  datos_: { cxc: Cxc; nombre: string } | null;
  deudor: "paciente" | "aseguradora";
  pendiente: number;
  onCerrar: () => void;
  onListo: (c: Comprobante) => void;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [fechaAb, setFechaAb] = useState(isoDia());

  useEffect(() => {
    if (!d) return;
    setMonto(pendiente.toFixed(2));
    setMetodo(deudor === "aseguradora" ? "transferencia" : "efectivo");
    setReferencia("");
    setFechaAb(isoDia());
  }, [d, pendiente, deudor]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_abono", {
          p_sistema: sistemaId,
          p_cobro: d!.cxc.cobro_id,
          p_deudor: deudor,
          p_monto: Number(monto),
          p_metodo: metodo,
          p_referencia: referencia || undefined,
          p_fecha: fechaAb,
        }),
      ) as { numero: string },
    onSuccess: (r) => {
      toast.success(`Abono ${r.numero} registrado`);
      void qc.invalidateQueries({ queryKey: claves.caja(sistemaId) });
      onCerrar();
      onListo({
        titulo: "Recibo de abono",
        numero: r.numero,
        fecha: fechaAb,
        monto: Number(monto),
        lineas: [
          [deudor === "paciente" ? "Paciente" : "Aseguradora", d!.nombre],
          ["Aplicado a", d!.cxc.ncf ?? d!.cxc.numero],
          ["Método", METODOS_PAGO[metodo]],
          ["Saldo restante", moneda(pendiente - Number(monto))],
        ],
      });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!d}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={`Abonar a ${d?.cxc.ncf ?? d?.cxc.numero ?? ""}`}
      descripcion={`${d?.nombre ?? ""} · pendiente ${moneda(pendiente)}`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!(Number(monto) > 0) || Number(monto) - pendiente > 0.004} onClick={() => m.mutate()}>
            Registrar abono
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Selector etiqueta="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
          {METODOS_DINERO.map((x) => (
            <option key={x} value={x}>
              {METODOS_PAGO[x]}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Fecha del pago" type="date" max={isoDia()} value={fechaAb} onChange={(e) => setFechaAb(e.target.value)} />
        <Entrada etiqueta="Referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} disabled={metodo === "efectivo"} />
      </div>
    </Modal>
  );
}
