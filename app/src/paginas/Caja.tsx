import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Ban, MoreHorizontal, Clock, HandCoins, Lock, Plus, Printer, Receipt, Search, Unlock, UserCheck, Wallet, HandHeart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada } from "@/components/ui/campos";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Paginacion, SelectorOrden, useListado, type OrdenListado } from "@/components/ui/listado";
import { EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, METODOS_PAGO, nombrePaciente, SELECT_CITA, useTurnosHoy, type CitaConRelaciones } from "@/lib/consultas";
import { destinoTurno, TicketTurno } from "@/components/TicketTurno";
import { useTiempoReal } from "@/lib/tiempoReal";
import { useAccionUrl } from "@/lib/accionUrl";
import { useAtajos } from "@/lib/atajos";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, hora, moneda } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { FranjaLlamados } from "@/components/LlamadosEnVivo";
import { CuadreDia } from "@/components/CuadreDia";
import { Anticipos, type Comprobante, ComprobanteTicket, NuevoAnticipo } from "./caja/Anticipos";
import { CuentasPorCobrar } from "./caja/CuentasPorCobrar";
import { AnularCobro, Factura } from "./caja/Factura";
import { CATEGORIAS_MOVIMIENTO, NuevoMovimiento } from "./caja/Movimientos";
import { NuevoCobro } from "./caja/NuevoCobro";
import { CerrarTurno, Turnos } from "./caja/Turnos";
import { type CobroFila, SELECT_COBRO } from "./caja/comun";

const ORDENES_COBROS: OrdenListado<CobroFila>[] = [
  { clave: "hora", etiqueta: "Más recientes", valor: (c) => c.creado_en, descendente: true },
  { clave: "monto", etiqueta: "Monto", valor: (c) => Number(c.total), descendente: true },
  { clave: "paciente", etiqueta: "Paciente", valor: (c) => `${c.paciente?.nombres ?? ""} ${c.paciente?.apellidos ?? ""}` },
  { clave: "recibo", etiqueta: "Recibo", valor: (c) => c.numero },
];

type Vista = "cobrar" | "cuadre" | "anticipos" | "cxc" | "movimientos" | "turnos";

/** Vistas secundarias (menú «Más»), con nombres del día a día. */
const OTRAS_VISTAS: Record<Exclude<Vista, "cobrar">, { titulo: string; detalle: string }> = {
  cuadre: { titulo: "Cuadre del día", detalle: "Como el Excel: por médico, por ARS y forma de pago, con la comisión y el 10 %." },
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

  // F2: nuevo cobro (si no hay otra ventana abierta encima).
  const hayVentana = cobrar || cerrar || anticipo || movimiento || !!recibo || !!anular || !!comprobante || !!exonerar || !!ticket;
  useAtajos({ F2: () => operar && setCobrar(true) }, !hayVentana);

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
  const [buscarCobro, setBuscarCobro] = useState("");
  const filtrados = useMemo(() => {
    const t = buscarCobro.trim().toLowerCase();
    if (!t) return cobros.data ?? [];
    return (cobros.data ?? []).filter((c) =>
      `${c.numero} ${c.ncf ?? ""} ${c.paciente?.nombres ?? ""} ${c.paciente?.apellidos ?? ""} ${c.paciente?.expediente ?? ""}`.toLowerCase().includes(t),
    );
  }, [cobros.data, buscarCobro]);
  const listado = useListado(filtrados, ORDENES_COBROS, { reiniciar: [buscarCobro] });
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
              <Boton icono={<Plus className="size-4" />} onClick={() => setCobrar(true)} title="Atajo: F2">
                Cobro sin turno
                <kbd className="ml-1 rounded bg-white/20 px-1 font-sans text-[0.6875rem]">F2</kbd>
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
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-texto-2">
                  Facturado hoy: <span className="font-semibold text-texto tabular">{moneda(totalHoy)}</span>
                </p>
                {(cobros.data?.length ?? 0) > 5 && (
                  <>
                    <Entrada icono={<Search />} placeholder="Recibo, NCF o paciente…" value={buscarCobro} onChange={(e) => setBuscarCobro(e.target.value)} contenedor="w-56" />
                    <SelectorOrden listado={listado} />
                  </>
                )}
                <AccionesDatos titulo="Cobros del día" columnas={COLUMNAS_COBROS} obtener={async () => cobros.data ?? []} />
              </div>
            </div>
            <Tarjeta className="overflow-hidden">
              {cobros.isLoading ? (
                <Esqueleto className="m-5 h-40" />
              ) : (cobros.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Receipt />} titulo="Aún no hay cobros hoy" />
              ) : listado.total === 0 ? (
                <Vacio icono={<Search />} titulo="Sin coincidencias" />
              ) : (
                <motion.ul key={`${listado.pagina}-${listado.orden}`} variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
                  {listado.visibles.map((c) => {
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
              <Paginacion listado={listado} />
            </Tarjeta>
            </>
          )}

          {vista === "cuadre" && <CuadreDia />}
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
                          {hora(m.creado_en)} · {m.autor?.nombre_completo} · {CATEGORIAS_MOVIMIENTO[m.categoria] ?? m.categoria}
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
