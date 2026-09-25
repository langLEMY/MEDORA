import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  FileText,
  HandCoins,
  Lock,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Unlock,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { EstadoCuenta, type ContactoCuenta } from "@/components/EstadoCuenta";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { CATEGORIAS_SERVICIO, claves, METODOS_PAGO, TIPOS_NCF, useAseguradoras, usePersonal, useServicios } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type MetodoPago } from "@/lib/supabase";
import { cn, fecha, fechaHora, hora, isoDia, moneda, relativo } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";

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
  pagos: { metodo: MetodoPago; monto: number; referencia: string | null }[];
  detalles: { descripcion: string; categoria: string; cantidad: number; precio_unitario: number; cobertura: number; total: number }[];
}

const SELECT_COBRO =
  "id, numero, ncf, tipo_ncf, cliente_rnc, cliente_nombre, total, subtotal, cobertura_seguro, descuento, monto_credito, metodo, numero_autorizacion, creado_en, " +
  "paciente:pacientes!cobros_sistema_id_paciente_id_fkey(nombres, apellidos, expediente, documento), cajero:perfiles!cobros_cajero_perfil_fk(nombre_completo), " +
  "profesional:perfiles!cobros_profesional_perfil_fk(nombre_completo), aseguradora:aseguradoras!cobros_sistema_id_aseguradora_id_fkey(nombre), " +
  "anulacion:anulaciones_cobro(motivo), pagos:cobro_pagos(metodo, monto, referencia), detalles:cobro_detalles(descripcion, categoria, cantidad, precio_unitario, cobertura, total)";

type Vista = "cobros" | "anticipos" | "cxc" | "movimientos" | "turnos";

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
  const { sistema, sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const yo = sesion!.user.id;
  const operar = puedeEscribir.caja(roles);
  const [vista, setVista] = useState<Vista>("cobros");
  const [abrir, setAbrir] = useState(false);
  const [cerrar, setCerrar] = useState(false);
  const [cobrar, setCobrar] = useState(false);
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
        descripcion="Cobros con NCF, anticipos, cuentas por cobrar y cierres de turno."
        acciones={
          operar &&
          t && (
            <>
              <Boton variante="secundario" icono={<ArrowUpRight className="size-4" />} onClick={() => setMovimiento(true)}>
                Movimiento
              </Boton>
              <Boton variante="secundario" icono={<HandCoins className="size-4" />} onClick={() => setAnticipo(true)}>
                Anticipo
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
                  <p className="text-xs text-texto-3">
                    Desde las {hora(t.abierto_en)} · {relativo(t.abierto_en)}
                  </p>
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmentado
          id="caja"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "cobros", etiqueta: "Cobros de hoy" },
            { valor: "anticipos", etiqueta: "Anticipos" },
            { valor: "cxc", etiqueta: "Cuentas por cobrar" },
            { valor: "movimientos", etiqueta: "Movimientos" },
            { valor: "turnos", etiqueta: "Turnos" },
          ]}
        />
        {vista === "cobros" && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-texto-2">
              Facturado hoy: <span className="font-semibold text-texto tabular">{moneda(totalHoy, sistema.moneda)}</span>
            </p>
            <AccionesDatos titulo="Cobros del día" columnas={COLUMNAS_COBROS} obtener={async () => cobros.data ?? []} />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {vista === "cobros" && (
            <Tarjeta className="overflow-hidden">
              {cobros.isLoading ? (
                <Esqueleto className="m-5 h-40" />
              ) : (cobros.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Receipt />} titulo="Sin cobros hoy" />
              ) : (
                <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
                  {cobros.data!.map((c) => {
                    const anulado = !!c.anulacion?.length;
                    return (
                      <motion.li key={c.id} variants={itemEscalonado} className="group flex items-center gap-4 px-5 py-3 text-sm">
                        <span className="w-28">
                          <span className="block font-medium tabular">{c.numero}</span>
                          {c.ncf && <span className="block font-mono text-[11px] text-texto-3">{c.ncf}</span>}
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
                        <span className="w-32 text-right font-semibold tabular">{moneda(c.total, sistema.moneda)}</span>
                        <div className="flex w-20 justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => setRecibo(c)} title="Ver factura" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
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
              )}
            </Tarjeta>
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
                        {moneda(m.monto, sistema.moneda)}
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

      <AbrirTurno abierto={abrir} onCerrar={() => setAbrir(false)} onListo={invalidar} />
      {t && <CerrarTurno abierto={cerrar} onCerrar={() => setCerrar(false)} turnoId={t.id} esperado={esperado} onListo={invalidar} />}
      <NuevoCobro
        abierto={cobrar}
        onCerrar={() => setCobrar(false)}
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------
function Turnos() {
  const { sistema, sistemaId } = useSistema();
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
                    {dif < 0 ? "Faltante" : "Sobrante"} {moneda(Math.abs(dif), sistema.moneda)}
                  </Insignia>
                ) : (
                  <Insignia tono="neutro">Cuadrado</Insignia>
                )}
                <span className="w-32 text-right tabular">{x.monto_esperado !== null ? moneda(x.monto_esperado, sistema.moneda) : "—"}</span>
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
  const { sistema } = useSistema();
  const q = useQuery({
    queryKey: ["arqueo", turno?.id],
    enabled: !!turno,
    queryFn: async () =>
      datos(await supabase.from("movimientos_financieros").select("tipo, categoria, concepto, monto, metodo, creado_en").eq("turno_id", turno!.id).order("creado_en")) ?? [],
  });
  const $ = (v: number) => moneda(v, sistema.moneda);
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
            <div className="text-[12px]">
              {turno.notas && (
                <p>
                  <b>Notas de cierre:</b> {turno.notas}
                </p>
              )}
              <p className="mt-16 w-56 border-t border-[#101828] pt-1 text-center text-[11px]">Cajero</p>
              <p className="mt-12 w-56 border-t border-[#101828] pt-1 text-center text-[11px]">Supervisor</p>
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
              className={cn("overflow-hidden text-sm font-medium", dif < 0 ? "text-peligro" : "text-aviso")}
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
}

function NuevoCobro({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: (id: string) => void }) {
  const { sistema, sistemaId } = useSistema();
  const servicios = useServicios(sistemaId);
  const aseguradoras = useAseguradoras(sistemaId);
  const personal = usePersonal(sistemaId);
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [aseguradora, setAseguradora] = useState("");
  const [autorizacion, setAutorizacion] = useState("");
  const [descuento, setDescuento] = useState("0");
  const [tipoNcf, setTipoNcf] = useState("B02");
  const [clienteRnc, setClienteRnc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [profesional, setProfesional] = useState("");
  const [vendedor, setVendedor] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setPaciente(null);
    setLineas([]);
    setPagos([]);
    setAseguradora("");
    setAutorizacion("");
    setDescuento("0");
    setTipoNcf("B02");
    setClienteRnc("");
    setClienteNombre("");
    setProfesional("");
    setVendedor("");
  }, [abierto]);

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
  const pagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const credito = Math.max(total - pagado, 0);
  const excede = pagado - total > 0.004;

  // Ítems agrupados por categoría (como quedarán en la factura y en el asiento).
  const grupos = useMemo(() => {
    const g = new Map<string, Linea[]>();
    lineas.forEach((l) => g.set(l.categoria, [...(g.get(l.categoria) ?? []), l]));
    return [...g.entries()];
  }, [lineas]);

  const metodosUsados = new Set(pagos.map((p) => p.metodo));
  const disponibles = [...METODOS_DINERO, ...((saldoAnticipo.data ?? 0) > 0 ? (["anticipo"] as MetodoPago[]) : [])].filter((m) => !metodosUsados.has(m));

  const agregarLinea = (servicioId: string) => {
    const s = servicios.data?.find((x) => x.id === servicioId);
    setLineas((ls) => [
      ...ls,
      { clave: Date.now(), servicio_id: s?.id ?? "", descripcion: s?.nombre ?? "", categoria: s?.categoria ?? "otro", cantidad: 1, precio: Number(s?.precio ?? 0) },
    ]);
  };

  const agregarPago = () => {
    const metodo = disponibles[0];
    if (!metodo) return;
    const restante = Math.max(total - pagado, 0);
    const monto = metodo === "anticipo" ? Math.min(restante, saldoAnticipo.data ?? 0) : restante;
    setPagos((ps) => [...ps, { clave: Date.now(), metodo, monto: monto ? monto.toFixed(2) : "", referencia: "" }]);
  };

  const medicos = personal.data?.filter((m) => m.activo && m.atiende_agenda) ?? [];
  const activos = personal.data?.filter((m) => m.activo) ?? [];
  const hayNcf = (tipo: string) => secuencias.data?.some((s) => s.tipo === tipo);

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
          p_pagos: pagos.filter((p) => Number(p.monto) > 0).map((p) => ({ metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia || null })),
          p_aseguradora: aseguradora || undefined,
          p_autorizacion: autorizacion || undefined,
          p_descuento: Number(descuento) || 0,
          p_tipo_ncf: tipoNcf || undefined,
          p_cliente_rnc: clienteRnc || undefined,
          p_cliente_nombre: clienteNombre || undefined,
          p_profesional: profesional || undefined,
          p_vendedor: vendedor || undefined,
        }),
      ) as { id: string; numero: string; ncf: string | null },
    onSuccess: (r) => {
      toast.success(`Cobro ${r.numero}${r.ncf ? ` · NCF ${r.ncf}` : ""} registrado`);
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
      descripcion="Los montos definitivos los calcula el servidor con los precios del catálogo."
      pie={
        <>
          <div className="mr-auto text-sm">
            <span className="text-texto-2">Total </span>
            <span className="text-lg font-semibold tabular">
              <NumeroAnimado valor={total} formato={(n) => moneda(n, sistema.moneda)} />
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
        <SelectorPaciente valor={paciente} onChange={setPaciente} />

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-texto-2">Conceptos</span>
            <div className="flex gap-2">
              <Selector value="" onChange={(e) => e.target.value && agregarLinea(e.target.value)} contenedor="w-56">
                <option value="">+ Servicio…</option>
                {servicios.data
                  ?.filter((s) => s.activo)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} · {moneda(s.precio, sistema.moneda)}
                    </option>
                  ))}
              </Selector>
              <Boton variante="secundario" onClick={() => agregarLinea("")}>
                Otro
              </Boton>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-borde">
            {lineas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-texto-3">Agrega al menos un servicio o concepto.</p>
            ) : (
              grupos.map(([cat, ls]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between bg-superficie-2/70 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-texto-3 uppercase">
                    <span>{CATEGORIAS_SERVICIO[cat] ?? cat}</span>
                    <span className="tabular">{moneda(ls.reduce((s, l) => s + l.precio * l.cantidad, 0), sistema.moneda)}</span>
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
                            <span className="w-24 text-right text-sm tabular">{moneda(l.precio, sistema.moneda)}</span>
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
                          {cubierto(l) > 0 && <Insignia tono="info">−{moneda(cubierto(l), sistema.moneda)}</Insignia>}
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
          <Entrada etiqueta="Descuento" type="number" min={0} step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          <Selector etiqueta="Comprobante fiscal" value={tipoNcf} onChange={(e) => setTipoNcf(e.target.value)}>
            <option value="">Sin NCF (recibo interno)</option>
            {Object.entries(TIPOS_NCF).map(([k, v]) => (
              <option key={k} value={k} disabled={!hayNcf(k)}>
                {v}
                {!hayNcf(k) ? " (sin secuencia)" : ""}
              </option>
            ))}
          </Selector>
          <AnimatePresence initial={false}>
            {(tipoNcf === "B01" || tipoNcf === "B14" || tipoNcf === "B15") && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="col-span-2 grid grid-cols-2 gap-4 overflow-hidden"
              >
                <Entrada etiqueta="RNC / cédula del cliente" value={clienteRnc} onChange={(e) => setClienteRnc(e.target.value)} />
                <Entrada etiqueta="Razón social" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
              </motion.div>
            )}
          </AnimatePresence>
          <Selector etiqueta="Profesional que atendió" value={profesional} onChange={(e) => setProfesional(e.target.value)}>
            <option value="">—</option>
            {medicos.map((x) => (
              <option key={x.usuario_id} value={x.usuario_id}>
                {x.perfil?.nombre_completo}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Vendedor / comisionista" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">—</option>
            {activos.map((x) => (
              <option key={x.usuario_id} value={x.usuario_id}>
                {x.perfil?.nombre_completo}
              </option>
            ))}
          </Selector>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-texto-2">Pagos</span>
            <div className="flex items-center gap-3">
              {(saldoAnticipo.data ?? 0) > 0 && (
                <span className="text-xs text-exito">Anticipo disponible: {moneda(saldoAnticipo.data, sistema.moneda)}</span>
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
                      onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, monto: e.target.value } : y)))}
                      className="h-9 w-36 rounded-[10px] border border-borde bg-superficie px-3 text-right text-sm tabular"
                    />
                    <input
                      placeholder={p.metodo === "efectivo" || p.metodo === "anticipo" ? "" : "Referencia / últimos 4"}
                      disabled={p.metodo === "efectivo" || p.metodo === "anticipo"}
                      value={p.referencia}
                      onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, referencia: e.target.value } : y)))}
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-borde bg-superficie px-3 text-sm disabled:opacity-40"
                    />
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
            {pagos.length === 0 && <p className="rounded-xl bg-superficie-2 px-4 py-3 text-sm text-texto-3">Sin pagos: todo el monto quedará a crédito del paciente.</p>}
          </div>
        </section>

        <dl className="space-y-1.5 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          {[
            ["Subtotal", subtotal],
            ["Cobertura del seguro (CxC ARS)", -cobertura],
            ["Descuento", -(Number(descuento) || 0)],
            ["Total a cargo del paciente", total],
            ["Pagado", pagado],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between">
              <dt className="text-texto-2">{k}</dt>
              <dd className="tabular">{moneda(v as number, sistema.moneda)}</dd>
            </div>
          ))}
          <div className={cn("flex justify-between border-t border-borde pt-1.5 font-semibold", excede ? "text-peligro" : credito > 0 ? "text-aviso" : "text-exito")}>
            <dt>{excede ? "Los pagos superan el total" : credito > 0 ? "Queda a crédito (CxC paciente)" : "Pagado completo"}</dt>
            <dd className="tabular">{moneda(excede ? pagado - total : credito, sistema.moneda)}</dd>
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
  const { sistema } = useSistema();
  const [ultimo, setUltimo] = useState(cobro);
  useEffect(() => {
    if (cobro) setUltimo(cobro);
  }, [cobro]);
  const c = cobro ?? ultimo;
  if (!c) return null;

  const grupos = new Map<string, CobroFila["detalles"]>();
  (c.detalles ?? []).forEach((d) => grupos.set(d.categoria, [...(grupos.get(d.categoria) ?? []), d]));
  const linea = "my-2 border-dashed border-black/40";

  return (
    <Documento abierto={!!cobro} onCerrar={onCerrar} titulo={c.ncf ? `Factura ${c.ncf}` : `Recibo ${c.numero}`} nombreArchivo={`${c.ncf ?? c.numero} - ${c.paciente?.nombres} ${c.paciente?.apellidos}`} formato="ticket">
      <p className="text-center text-[14px] font-bold">{sistema.nombre}</p>
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
              <span>{moneda(Number(d.precio_unitario) * Number(d.cantidad), sistema.moneda)}</span>
            </div>
          ))}
        </div>
      ))}
      <hr className={linea} />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{moneda(c.subtotal, sistema.moneda)}</span>
      </div>
      {Number(c.cobertura_seguro) > 0 && (
        <div className="flex justify-between">
          <span>
            Seguro {c.aseguradora?.nombre ?? ""} {c.numero_autorizacion ? `(Aut. ${c.numero_autorizacion})` : ""}
          </span>
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
      <hr className={linea} />
      {(c.pagos ?? []).map((p) => (
        <div key={p.metodo} className="flex justify-between">
          <span>
            {METODOS_PAGO[p.metodo]}
            {p.referencia ? ` · ${p.referencia}` : ""}
          </span>
          <span>{moneda(p.monto, sistema.moneda)}</span>
        </div>
      ))}
      {Number(c.monto_credito) > 0 && (
        <div className="flex justify-between font-bold">
          <span>PENDIENTE (crédito)</span>
          <span>{moneda(c.monto_credito, sistema.moneda)}</span>
        </div>
      )}
      {c.anulacion?.length ? <p className="mt-2 text-center font-bold">*** ANULADO ***</p> : null}
      <hr className={linea} />
      <p className="text-center">Cajero: {c.cajero?.nombre_completo}</p>
      <p className="text-center">¡Gracias por su visita!</p>
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
  const { sistema, sistemaId } = useSistema();
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
              <span className="w-32 text-right font-semibold tabular">{moneda(a.monto, sistema.moneda)}</span>
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
      <p className="text-center text-[14px] font-bold">{sistema.nombre}</p>
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
      <div className="flex justify-between text-[14px] font-bold">
        <span>MONTO</span>
        <span>{moneda(x.monto, sistema.moneda)}</span>
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
  const { sistema, sistemaId, roles } = useSistema();
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
          Total por cobrar: <span className="font-semibold text-texto tabular">{moneda(total, sistema.moneda)}</span>
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
                  <span className="text-sm font-semibold tabular">{moneda(fs.reduce((s, f) => s + pend(f), 0), sistema.moneda)}</span>
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
                      <span className="ml-auto w-28 text-right font-medium tabular">{moneda(pend(f), sistema.moneda)}</span>
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
  const { sistema, sistemaId } = useSistema();
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
          ["Saldo restante", moneda(pendiente - Number(monto), sistema.moneda)],
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
      descripcion={`${d?.nombre ?? ""} · pendiente ${moneda(pendiente, sistema.moneda)}`}
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
