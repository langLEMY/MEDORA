import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  HandCoins,
  HandHeart,
  Landmark,
  Printer,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { Documento, EncabezadoDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, EASE_SALIDA, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { useAccionUrl } from "@/lib/accionUrl";
import { METODOS_PAGO } from "@/lib/consultas";
import { puede } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, fechaHora, isoDia, moneda } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

/**
 * Finanzas: lo que entra, lo que sale y lo que queda, explicado para quien no
 * es contador. Todo sale de la contabilidad (resumen_financiero), así que los
 * números siempre coinciden con la balanza.
 */

// ---------------------------------------------------------------------------
// Rangos de fechas
// ---------------------------------------------------------------------------
type Rango = "mes" | "anterior" | "trimestre" | "anio" | "doce";
const RANGOS: [Rango, string][] = [
  ["mes", "Este mes"],
  ["anterior", "Mes pasado"],
  ["trimestre", "Últimos 3 meses"],
  ["anio", "Este año"],
  ["doce", "Últimos 12 meses"],
];
function rango(r: Rango): [string, string] {
  const h = new Date();
  const d = (y: number, m: number, dia: number) => isoDia(new Date(y, m, dia));
  switch (r) {
    case "anterior":
      return [d(h.getFullYear(), h.getMonth() - 1, 1), d(h.getFullYear(), h.getMonth(), 0)];
    case "trimestre":
      return [d(h.getFullYear(), h.getMonth() - 2, 1), isoDia(h)];
    case "anio":
      return [d(h.getFullYear(), 0, 1), isoDia(h)];
    case "doce":
      return [d(h.getFullYear(), h.getMonth() - 11, 1), isoDia(h)];
    default:
      return [d(h.getFullYear(), h.getMonth(), 1), isoDia(h)];
  }
}
const agruparPara = (desde: string, hasta: string) => {
  const dias = (new Date(hasta).getTime() - new Date(desde).getTime()) / 864e5 + 1;
  return dias <= 35 ? "dia" : dias <= 120 ? "semana" : "mes";
};

function ChipsRango({ valor, onChange }: { valor: Rango; onChange: (r: Rango) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RANGOS.map(([r, etiqueta]) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            "relative rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
            valor === r ? "text-marca-texto" : "text-texto-2 hover:bg-superficie-2 hover:text-texto",
          )}
        >
          {valor === r && (
            <motion.span
              layoutId="chip-rango-finanzas"
              className="absolute inset-0 rounded-full bg-marca-suave ring-1 ring-[color-mix(in_oklab,var(--marca)_25%,transparent)]"
              transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
            />
          )}
          <span className="relative">{etiqueta}</span>
        </button>
      ))}
    </div>
  );
}

const tooltipEstilo = {
  background: "var(--superficie)",
  border: "1px solid var(--borde)",
  borderRadius: 12,
  boxShadow: "var(--sombra-md)",
  fontSize: 12,
  color: "var(--texto)",
};
const compacto = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
const variacion = (actual: number, anterior: number) => (anterior === 0 ? null : ((actual - anterior) / Math.abs(anterior)) * 100);

// Paleta para repartos (derivada de la marca y los tonos del sistema).
const PALETA = [
  "var(--marca)",
  "#2e90fa",
  "#7a5af8",
  "var(--aviso)",
  "#ee46bc",
  "var(--exito)",
  "#0ba5ec",
  "color-mix(in oklab, var(--texto-3) 70%, var(--superficie))",
];

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
interface Resumen {
  ingresos: number;
  gastos: number;
  ingresos_anterior: number;
  gastos_anterior: number;
  serie: { periodo: string; ingresos: number; gastos: number; ganancia: number }[];
  por_ingreso: { cuenta: string; nombre: string; monto: number }[];
  por_gasto: { cuenta: string; nombre: string; monto: number }[];
  por_metodo: { metodo: string; monto: number }[];
  donaciones: number;
  pacientes: number;
  cobros: number;
  saldos: Record<string, number>;
}

export function ResumenFinanciero() {
  const { sistemaId } = useSistema();
  const [r, setR] = useState<Rango>("mes");
  const [desde, hasta] = rango(r);
  const agrupar = agruparPara(desde, hasta);
  const q = useQuery({
    queryKey: ["resumen-financiero", sistemaId, desde, hasta, agrupar],
    queryFn: async () =>
      datos(await supabase.rpc("resumen_financiero", { p_sistema: sistemaId, p_desde: desde, p_hasta: hasta, p_agrupar: agrupar })) as unknown as Resumen,
    placeholderData: (prev) => prev,
    // Caja cobra mientras esta pantalla está abierta: se pone al día sola cada minuto.
    refetchInterval: 60_000,
  });
  const f = q.data;
  const ganancia = (f?.ingresos ?? 0) - (f?.gastos ?? 0);
  const gananciaAnt = (f?.ingresos_anterior ?? 0) - (f?.gastos_anterior ?? 0);
  const n = (k: string) => Number(f?.saldos?.[k] ?? 0);
  const disponible = n("caja") + n("banco");
  const porCobrar = n("cxc_pacientes") + n("cxc_aseguradoras");
  const porPagar = n("cxp") + n("sueldos_por_pagar") + n("comisiones_por_pagar") + n("retenciones_tss") + n("isr_por_pagar") + n("aportes_por_pagar");
  const serie = (f?.serie ?? []).map((p) => ({
    ...p,
    ingresos: Number(p.ingresos),
    gastos: Number(p.gastos),
    ganancia: Number(p.ganancia),
    etiqueta: etiquetaPeriodo(p.periodo, agrupar),
  }));
  const promedio = serie.length ? serie.reduce((s, p) => s + p.ganancia, 0) / serie.length : 0;
  const ticket = f?.cobros ? Number(f.ingresos) / f.cobros : 0;
  const cargando = q.isLoading;
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);
  const hoy = isoDia(new Date());
  const delPeriodo = (p: Omit<PedidoDetalle, "desde" | "hasta">) => setDetalle({ ...p, desde, hasta });
  const deSaldo = (titulo: string, cuentas: string[], descripcion?: string) =>
    setDetalle({ titulo, descripcion, vista: "saldo", hasta: hoy, cuentas, agrupar: cuentas.includes("comisiones_por_pagar") ? "medico" : "tercero" });

  return (
    <>
      <EncabezadoPagina titulo="Finanzas" descripcion="Lo que entra, lo que sale y lo que queda, sin tecnicismos." acciones={<ChipsRango valor={r} onChange={setR} />} />

      {/* Portada: la ganancia del período en una frase. */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_SALIDA }}
        className="relative mb-4 overflow-hidden rounded-3xl border border-borde p-6"
        style={{
          background: `radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, ${ganancia >= 0 ? "var(--exito)" : "var(--peligro)"} 16%, transparent) 0%, transparent 60%), var(--superficie)`,
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-texto-3 uppercase">{ganancia >= 0 ? "Ganancia del período" : "Pérdida del período"}</p>
            <p className={cn("mt-1 text-[2.5rem] leading-none font-semibold tracking-[-0.03em] tabular", ganancia >= 0 ? "text-exito" : "text-peligro")}>
              {cargando ? <Esqueleto className="h-10 w-56" /> : <NumeroAnimado valor={ganancia} formato={(v) => moneda(v)} />}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-texto-2">
              {cargando ? (
                <Esqueleto className="h-4 w-80" />
              ) : (
                <>
                  Entraron <b className="text-texto">{moneda(f?.ingresos)}</b> y salieron <b className="text-texto">{moneda(f?.gastos)}</b>.{" "}
                  <FraseCambio actual={ganancia} anterior={gananciaAnt} />
                </>
              )}
            </p>
          </div>
          <BarraProporcion ingresos={Number(f?.ingresos ?? 0)} gastos={Number(f?.gastos ?? 0)} />
        </div>
      </motion.section>

      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Lo que entró"
          valor={Number(f?.ingresos ?? 0)}
          cambio={variacion(Number(f?.ingresos ?? 0), Number(f?.ingresos_anterior ?? 0))}
          icono={TrendingUp}
          tono="exito"
          cargando={cargando}
          dinero
          onClick={() => delPeriodo({ titulo: "Lo que entró", vista: "ingresos", agrupar: "cuenta", alternar: true })}
        />
        <Kpi
          etiqueta="Lo que salió"
          valor={Number(f?.gastos ?? 0)}
          cambio={variacion(Number(f?.gastos ?? 0), Number(f?.gastos_anterior ?? 0))}
          icono={TrendingDown}
          tono="peligro"
          cargando={cargando}
          dinero
          inverso
          onClick={() => delPeriodo({ titulo: "Lo que salió", descripcion: "En qué se fue el dinero y por qué", vista: "gastos", agrupar: "cuenta", alternar: true })}
        />
        <Kpi
          etiqueta="Pacientes que pagaron"
          valor={f?.pacientes ?? 0}
          extra={ticket ? `${moneda(ticket)} por cobro en promedio` : "Sin cobros en el período"}
          icono={Users}
          tono="marca"
          cargando={cargando}
          onClick={() => delPeriodo({ titulo: "Lo que pagó cada paciente", descripcion: "Incluye lo que cubre la ARS", vista: "ingresos", agrupar: "tercero" })}
        />
        <Kpi
          etiqueta="Donaciones"
          valor={Number(f?.donaciones ?? 0)}
          extra="Incluidas en lo que entró"
          icono={HandHeart}
          tono="violeta"
          cargando={cargando}
          dinero
          onClick={() => delPeriodo({ titulo: "Donaciones", vista: "ingresos", cuentas: ["ingreso_donaciones"], agrupar: "dia" })}
        />
      </motion.div>

      {/* Entradas y salidas por período */}
      <Tarjeta className="mt-4 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[0.9375rem] font-semibold">Entradas y salidas</h2>
            <p className="text-xs text-texto-3">
              Por {agrupar === "dia" ? "día" : agrupar === "semana" ? "semana" : "mes"}. La línea es lo que quedó; la raya punteada, el promedio. Toca un{" "}
              {agrupar === "dia" ? "día" : agrupar === "semana" ? "semana" : "mes"} para ver el detalle.
            </p>
          </div>
          <Leyenda items={[["Entró", "var(--exito)"], ["Salió", "color-mix(in oklab, var(--peligro) 70%, var(--superficie))"], ["Quedó", "var(--marca)"]]} />
        </div>
        <div className="h-72">
          {cargando ? (
            <Esqueleto className="h-full rounded-xl" />
          ) : serie.every((p) => !p.ingresos && !p.gastos) ? (
            <Vacio icono={<Scale />} titulo="Sin movimientos en este período" descripcion="Cuando haya cobros o gastos, aquí verás cómo se comparan." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={serie}
                margin={{ left: -6, right: 8, top: 8 }}
                barGap={2}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  const punto = serie[Number(e?.activeTooltipIndex)];
                  if (!punto) return;
                  const [d, h] = limitesPeriodo(punto.periodo, agrupar);
                  setDetalle({ titulo: `Movimiento del ${punto.etiqueta}`, vista: punto.ingresos || !punto.gastos ? "ingresos" : "gastos", desde: d, hasta: h, agrupar: "cuenta", alternar: true });
                }}
              >
                <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--marca) 6%, transparent)" }}
                  contentStyle={tooltipEstilo}
                  formatter={(v, nombre) => [moneda(Number(v)), nombre === "ingresos" ? "Entró" : nombre === "gastos" ? "Salió" : "Quedó"]}
                />
                <ReferenceLine y={promedio} stroke="var(--texto-3)" strokeDasharray="4 4" />
                <Bar dataKey="ingresos" fill="var(--exito)" radius={[5, 5, 0, 0]} maxBarSize={22} animationDuration={700} />
                <Bar dataKey="gastos" fill="color-mix(in oklab, var(--peligro) 70%, var(--superficie))" radius={[5, 5, 0, 0]} maxBarSize={22} animationDuration={700} />
                <Line dataKey="ganancia" type="monotone" stroke="var(--marca)" strokeWidth={2.5} dot={serie.length <= 14 ? { r: 3 } : false} animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Tarjeta>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Reparto
          titulo="¿De dónde viene el dinero?"
          descripcion="Lo que entró, por tipo de servicio"
          filas={(f?.por_ingreso ?? []).map((x) => ({ nombre: limpiarNombre(x.nombre), monto: Number(x.monto), cuentas: [x.cuenta] }))}
          cargando={cargando}
          onElegir={(x) => delPeriodo({ titulo: `Ingresos · ${x.nombre}`, vista: "ingresos", cuentas: x.cuentas, agrupar: "medico" })}
        />
        <Reparto
          titulo="¿En qué se va?"
          descripcion="Lo que salió, por tipo de gasto"
          filas={(f?.por_gasto ?? []).map((x) => ({ nombre: limpiarNombre(x.nombre), monto: Number(x.monto), cuentas: [x.cuenta] }))}
          cargando={cargando}
          barras
          onElegir={(x) => delPeriodo({ titulo: `Gastos · ${x.nombre}`, descripcion: "Cada salida con su motivo", vista: "gastos", cuentas: x.cuentas, agrupar: x.cuentas.length === 1 ? "medico" : "cuenta" })}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Tarjeta className="p-5">
          <h2 className="text-[0.9375rem] font-semibold">¿Cómo pagan?</h2>
          <p className="mb-4 text-xs text-texto-3">Dinero recibido en caja por método</p>
          {cargando ? (
            <Esqueleto className="h-32" />
          ) : !(f?.por_metodo ?? []).length ? (
            <p className="py-8 text-center text-sm text-texto-3">Sin cobros en el período</p>
          ) : (
            <MetodosPago filas={(f?.por_metodo ?? []).map((m) => ({ metodo: m.metodo, monto: Number(m.monto) }))} />
          )}
        </Tarjeta>

        <div className="grid gap-4 sm:grid-cols-3">
          <Saldo
            icono={Wallet}
            titulo="Dinero disponible"
            monto={disponible}
            tono="exito"
            cargando={cargando}
            onElegir={deSaldo}
            detalle={[
              ["En caja", n("caja"), ["caja"]],
              ["En el banco", n("banco"), ["banco"]],
            ]}
          />
          <Saldo
            icono={HandCoins}
            titulo="Nos deben"
            monto={porCobrar}
            tono="aviso"
            cargando={cargando}
            onElegir={deSaldo}
            detalle={[
              ["Pacientes", n("cxc_pacientes"), ["cxc_pacientes"]],
              ["Aseguradoras (ARS)", n("cxc_aseguradoras"), ["cxc_aseguradoras"]],
            ]}
          />
          <Saldo
            icono={Landmark}
            titulo="Debemos"
            monto={porPagar}
            tono="peligro"
            cargando={cargando}
            onElegir={deSaldo}
            detalle={[
              ["Proveedores", n("cxp"), ["cxp"]],
              ["Sueldos", n("sueldos_por_pagar"), ["sueldos_por_pagar"]],
              ["Médicos", n("comisiones_por_pagar"), ["comisiones_por_pagar"]],
              ["TSS, ISR y aportes", n("retenciones_tss") + n("isr_por_pagar") + n("aportes_por_pagar"), ["retenciones_tss", "isr_por_pagar", "aportes_por_pagar"]],
            ]}
          />
        </div>
      </div>

      <DetalleFinanciero pedido={detalle} onCerrar={() => setDetalle(null)} />
    </>
  );
}

function etiquetaPeriodo(p: string, agrupar: string) {
  const d = new Date(p.slice(0, 10) + "T12:00:00");
  if (agrupar === "mes") return new Intl.DateTimeFormat("es-DO", { month: "short", year: "2-digit" }).format(d).replace(".", "");
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short" }).format(d).replace(".", "");
}
const limpiarNombre = (n: string) => n.replace(/^Ingresos por /i, "").replace(/^Ingresos · /i, "").replace(/^\w/, (c) => c.toUpperCase());

function FraseCambio({ actual, anterior }: { actual: number; anterior: number }) {
  const v = variacion(actual, anterior);
  if (v === null) return <span>No hay un período anterior para comparar.</span>;
  const sube = v >= 0;
  return (
    <span>
      Quedó{" "}
      <b className={sube ? "text-exito" : "text-peligro"}>
        {Math.abs(v).toFixed(v > -10 && v < 10 ? 1 : 0)} % {sube ? "más" : "menos"}
      </b>{" "}
      que en el período anterior ({moneda(anterior)}).
    </span>
  );
}

/** Barra horizontal: cuánto de lo que entró se fue. */
function BarraProporcion({ ingresos, gastos }: { ingresos: number; gastos: number }) {
  const total = Math.max(ingresos, gastos, 1);
  return (
    <div className="w-full max-w-xs space-y-2">
      {[
        ["Entró", ingresos, "var(--exito)"],
        ["Salió", gastos, "color-mix(in oklab, var(--peligro) 75%, var(--superficie))"],
      ].map(([t, v, c]) => (
        <div key={t as string}>
          <div className="mb-1 flex justify-between text-xs text-texto-2">
            <span>{t as string}</span>
            <span className="font-medium tabular">{moneda(v as number)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-superficie-2">
            <motion.div
              className="h-full origin-left rounded-full"
              style={{ background: c as string, width: `${((v as number) / total) * 100}%` }}
              initial={{ scaleX: 0.02 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.7, ease: EASE_SALIDA }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  cambio,
  extra,
  icono: Icono,
  tono,
  cargando,
  dinero,
  inverso,
  onClick,
}: {
  etiqueta: string;
  valor: number;
  cambio?: number | null;
  extra?: ReactNode;
  icono: LucideIcon;
  tono: "exito" | "peligro" | "marca" | "violeta";
  cargando: boolean;
  dinero?: boolean;
  /** En gastos, subir es malo. */
  inverso?: boolean;
  /** Abre el detalle del número. */
  onClick?: () => void;
}) {
  const color = tono === "violeta" ? "#7a5af8" : `var(--${tono})`;
  const bueno = cambio == null ? null : inverso ? cambio <= 0 : cambio >= 0;
  const tarjeta = (
    <Tarjeta className={cn("h-full p-5", onClick && "transition-colors group-hover:border-[color-mix(in_oklab,var(--marca)_35%,var(--borde))]")}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[0.8125rem] font-medium text-texto-2">
            {etiqueta}
            {onClick && <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
          </span>
          <span className="grid size-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 13%, var(--superficie))`, color }}>
            <Icono className="size-4" />
          </span>
        </div>
        <div className="mt-3 text-[1.625rem] font-semibold tracking-[-0.02em] tabular">
          {cargando ? <Esqueleto className="h-8 w-28" /> : <NumeroAnimado valor={valor} formato={dinero ? (v) => moneda(v) : undefined} />}
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-texto-3">
          {cambio != null ? (
            <>
              <span className={cn("inline-flex items-center gap-0.5 font-medium", bueno ? "text-exito" : "text-peligro")}>
                {cambio >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(cambio).toFixed(Math.abs(cambio) < 10 ? 1 : 0)} %
              </span>
              frente al período anterior
            </>
          ) : (
            extra
          )}
        </p>
      </Tarjeta>
  );
  return (
    <motion.div variants={itemEscalonado}>
      {onClick ? (
        <button type="button" onClick={onClick} className="group block h-full w-full rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
          {tarjeta}
        </button>
      ) : (
        tarjeta
      )}
    </motion.div>
  );
}

function Leyenda({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([t, c]) => (
        <span key={t} className="flex items-center gap-1.5 text-xs text-texto-2">
          <span className="size-2.5 rounded-[3px]" style={{ background: c }} />
          {t}
        </span>
      ))}
    </div>
  );
}

/** Reparto por categoría: dona con porcentajes o barras horizontales. */
interface FilaReparto {
  nombre: string;
  monto: number;
  cuentas: string[];
}
function Reparto({
  titulo,
  descripcion,
  filas,
  cargando,
  barras,
  onElegir,
}: {
  titulo: string;
  descripcion: string;
  filas: FilaReparto[];
  cargando: boolean;
  barras?: boolean;
  onElegir?: (f: FilaReparto) => void;
}) {
  const total = filas.reduce((s, f) => s + f.monto, 0);
  const top: FilaReparto[] =
    filas.length > 7
      ? [...filas.slice(0, 6), { nombre: "Otros", monto: filas.slice(6).reduce((s, f) => s + f.monto, 0), cuentas: filas.slice(6).flatMap((f) => f.cuentas) }]
      : filas;
  return (
    <Tarjeta className="p-5">
      <h2 className="text-[0.9375rem] font-semibold">{titulo}</h2>
      <p className="mb-4 text-xs text-texto-3">{descripcion}</p>
      {cargando ? (
        <Esqueleto className="h-48" />
      ) : !top.length ? (
        <p className="py-12 text-center text-sm text-texto-3">Nada en este período</p>
      ) : barras ? (
        <ul className="-mx-2 space-y-1">
          {top.map((f, i) => (
            <li key={f.nombre}>
              <button
                type="button"
                disabled={!onElegir}
                onClick={() => onElegir?.(f)}
                className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-superficie-2"
              >
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{f.nombre}</span>
                  <span className="shrink-0 tabular">
                    <b className="font-semibold">{moneda(f.monto)}</b> <span className="text-xs text-texto-3">{((f.monto / total) * 100).toFixed(0)} %</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-superficie-2">
                  <motion.div
                    className="h-full origin-left rounded-full"
                    style={{ width: `${(f.monto / top[0].monto) * 100}%`, background: PALETA[i % PALETA.length] }}
                    initial={{ scaleX: 0.02 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: EASE_SALIDA }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative size-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={top}
                  dataKey="monto"
                  nameKey="nombre"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={2}
                  stroke="none"
                  animationDuration={800}
                  style={onElegir ? { cursor: "pointer" } : undefined}
                  onClick={(_, i) => top[i] && onElegir?.(top[i])}
                >
                  {top.map((_, i) => (
                    <Cell key={i} fill={PALETA[i % PALETA.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipEstilo} formatter={(v, nombre) => [moneda(Number(v)), nombre]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-[0.6875rem] text-texto-3">Total</p>
                <p className="text-sm font-semibold tabular">{compacto(total)}</p>
              </div>
            </div>
          </div>
          <ul className="min-w-44 flex-1 space-y-0.5">
            {top.map((f, i) => (
              <li key={f.nombre}>
                <button
                  type="button"
                  disabled={!onElegir}
                  onClick={() => onElegir?.(f)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors enabled:hover:bg-superficie-2"
                >
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PALETA[i % PALETA.length] }} />
                  <span className="min-w-0 flex-1 truncate text-texto-2">{f.nombre}</span>
                  <span className="font-semibold tabular">{((f.monto / total) * 100).toFixed(0)} %</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  );
}

function MetodosPago({ filas }: { filas: { metodo: string; monto: number }[] }) {
  const total = filas.reduce((s, f) => s + Math.max(0, f.monto), 0) || 1;
  return (
    <>
      <div className="flex h-4 overflow-hidden rounded-full bg-superficie-2">
        {filas.map((f, i) => (
          <motion.div
            key={f.metodo}
            title={`${METODOS_PAGO[f.metodo] ?? f.metodo}: ${moneda(f.monto)}`}
            style={{ width: `${(Math.max(0, f.monto) / total) * 100}%`, background: PALETA[i % PALETA.length] }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {filas.map((f, i) => (
          <li key={f.metodo} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PALETA[i % PALETA.length] }} />
            <span className="min-w-0 flex-1 truncate text-texto-2">{METODOS_PAGO[f.metodo] ?? f.metodo}</span>
            <span className="font-semibold tabular">{((Math.max(0, f.monto) / total) * 100).toFixed(0)} %</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Saldo({
  icono: Icono,
  titulo,
  monto,
  tono,
  detalle,
  cargando,
  onElegir,
}: {
  icono: LucideIcon;
  titulo: string;
  monto: number;
  tono: string;
  /** Renglón: etiqueta, saldo y las claves de cuenta que lo forman. */
  detalle: [string, number, string[]][];
  cargando: boolean;
  onElegir?: (titulo: string, cuentas: string[], descripcion?: string) => void;
}) {
  const color = `var(--${tono})`;
  return (
    <Tarjeta className="p-5">
      <button
        type="button"
        disabled={!onElegir}
        onClick={() => onElegir?.(titulo, detalle.flatMap(([, , c]) => c))}
        className="group -m-2 block w-[calc(100%+1rem)] rounded-xl p-2 text-left transition-colors enabled:hover:bg-superficie-2"
      >
        <span className="grid size-9 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 13%, var(--superficie))`, color }}>
          <Icono className="size-[1.125rem]" />
        </span>
        <p className="mt-3 flex items-center gap-1 text-[0.8125rem] font-medium text-texto-2">
          {titulo}
          {onElegir && <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
        </p>
        <p className="text-xl font-semibold tracking-tight tabular">{cargando ? <Esqueleto className="h-6 w-24" /> : moneda(monto)}</p>
        <p className="text-[0.6875rem] text-texto-3">Hoy, con todo lo registrado</p>
      </button>
      <ul className="mt-2 space-y-0.5 border-t border-borde pt-2">
        {detalle.map(([t, v, cuentas]) => (
          <li key={t}>
            <button
              type="button"
              disabled={!onElegir}
              onClick={() => onElegir?.(`${titulo} · ${t}`, cuentas)}
              className="-mx-1.5 flex w-[calc(100%+0.75rem)] justify-between gap-2 rounded-md px-1.5 py-0.5 text-xs transition-colors enabled:hover:bg-superficie-2"
            >
              <span className="text-texto-3">{t}</span>
              <span className="tabular">{moneda(v)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Detalle de cada número (se abre al tocar una tarjeta, una barra o un renglón)
// ---------------------------------------------------------------------------
type VistaDetalle = "ingresos" | "gastos" | "saldo";
type Agrupacion = "cuenta" | "medico" | "tercero" | "dia";
export interface PedidoDetalle {
  titulo: string;
  descripcion?: string;
  vista: VistaDetalle;
  desde?: string;
  hasta: string;
  /** Códigos de cuenta o claves de cuentas_predeterminadas. */
  cuentas?: string[];
  agrupar?: Agrupacion;
  /** Permite pasar entre lo que entró y lo que salió del mismo período. */
  alternar?: boolean;
}
interface LineaDetalle {
  fecha: string;
  numero: string;
  concepto: string;
  origen: string;
  cuenta: string;
  cuenta_nombre: string;
  monto: number;
  paciente: string | null;
  medico: string | null;
  aseguradora: string | null;
  tercero: string | null;
}
const ORIGEN_DETALLE: Record<string, string> = {
  cobro: "Cobro",
  reverso: "Anulación",
  comision: "Comisión",
  movimiento: "Caja",
  compra: "Gasto",
  nomina: "Nómina",
  donacion: "Donación",
  abono: "Abono",
  anticipo: "Anticipo",
  manual: "Asiento manual",
};
const COLUMNAS_DETALLE: ColumnaDatos<LineaDetalle>[] = [
  { titulo: "Fecha", valor: (l) => l.fecha, tipo: "fecha" },
  { titulo: "Asiento", valor: (l) => l.numero },
  { titulo: "Origen", valor: (l) => ORIGEN_DETALLE[l.origen] ?? l.origen },
  { titulo: "Concepto", valor: (l) => l.concepto },
  { titulo: "Cuenta", valor: (l) => `${l.cuenta} ${l.cuenta_nombre}` },
  { titulo: "Paciente / ARS", valor: (l) => l.tercero },
  { titulo: "Médico", valor: (l) => l.medico },
  { titulo: "Monto", valor: (l) => Number(l.monto), tipo: "moneda" },
];
const etiquetaDia = (d: string) => new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00"));

/** Subtítulo de la ventana de detalle. Sin pedido (ventana cerrada) no hay fechas: formatearlas
 *  lanzaría «Invalid time value» y tumbaría Finanzas (pasó en la 1.6.0). */
export function textoPeriodo(p: Pick<PedidoDetalle, "vista" | "desde" | "hasta"> | null): string {
  if (!p) return "";
  if (p.vista === "saldo") return "Todo lo registrado hasta hoy";
  if (!p.desde || p.desde === p.hasta) return etiquetaDia(p.hasta);
  return `Del ${fecha(p.desde + "T12:00:00")} al ${fecha(p.hasta + "T12:00:00")}`;
}

function DetalleFinanciero({ pedido, onCerrar }: { pedido: PedidoDetalle | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const [vista, setVista] = useState<VistaDetalle>("ingresos");
  const [agrupar, setAgrupar] = useState<Agrupacion>("cuenta");
  const [grupo, setGrupo] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);
  const [abiertoPara, setAbiertoPara] = useState<PedidoDetalle | null>(null);
  // Cada pedido nuevo arranca con su vista y agrupación.
  if (pedido && pedido !== abiertoPara) {
    setAbiertoPara(pedido);
    setVista(pedido.vista);
    setAgrupar(pedido.agrupar ?? "cuenta");
    setGrupo(null);
    setTodas(false);
  }
  const p = pedido ?? abiertoPara;
  const q = useQuery({
    queryKey: ["detalle-financiero", sistemaId, vista, p?.desde, p?.hasta, p?.cuentas],
    enabled: !!pedido,
    queryFn: async () =>
      datos(
        await supabase.rpc("detalle_financiero", {
          p_sistema: sistemaId,
          p_vista: vista,
          p_desde: p!.desde ?? p!.hasta,
          p_hasta: p!.hasta,
          p_cuentas: vista === p!.vista ? p!.cuentas : undefined,
        }),
      ) as unknown as { total: number; lineas: LineaDetalle[] },
  });
  const lineas = useMemo(() => q.data?.lineas ?? [], [q.data]);
  const claveDe = useMemo(
    () =>
      ({
        cuenta: (l: LineaDetalle) => limpiarNombre(l.cuenta_nombre),
        medico: (l: LineaDetalle) => l.medico ?? "Sin médico",
        tercero: (l: LineaDetalle) => l.tercero ?? (l.origen === "movimiento" || l.origen === "compra" ? "Gastos de la institución" : "Sin paciente"),
        dia: (l: LineaDetalle) => l.fecha,
      })[agrupar],
    [agrupar],
  );
  const grupos = useMemo(() => {
    const m = new Map<string, { nombre: string; monto: number; n: number }>();
    for (const l of lineas) {
      const k = claveDe(l);
      const g = m.get(k) ?? { nombre: k, monto: 0, n: 0 };
      g.monto += Number(l.monto);
      g.n += 1;
      m.set(k, g);
    }
    const lista = [...m.values()];
    return agrupar === "dia" ? lista.sort((a, b) => b.nombre.localeCompare(a.nombre)) : lista.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));
  }, [lineas, claveDe, agrupar]);
  const maximo = Math.max(...grupos.map((g) => Math.abs(g.monto)), 1);
  const visibles = grupo ? lineas.filter((l) => claveDe(l) === grupo) : lineas;
  const mostradas = todas ? visibles : visibles.slice(0, 80);
  const total = Number(q.data?.total ?? 0);
  const etiquetasAgrupar: [Agrupacion, string][] = [
    ["cuenta", vista === "gastos" ? "Por motivo" : vista === "ingresos" ? "Por servicio" : "Por cuenta"],
    ["medico", "Por médico"],
    ["tercero", "Por paciente o ARS"],
    ["dia", "Por día"],
  ];
  const periodo = textoPeriodo(p);

  return (
    <Modal
      abierto={!!pedido}
      onCerrar={onCerrar}
      ancho="xl"
      titulo={vista === p?.vista ? (p?.titulo ?? "") : vista === "ingresos" ? "Lo que entró" : "Lo que salió"}
      descripcion={`${periodo}${p?.descripcion && vista === p.vista ? ` · ${p.descripcion}` : ""}`}
      pie={
        <>
          <AccionesDatos titulo={p?.titulo ?? "Detalle"} columnas={COLUMNAS_DETALLE} obtener={async () => visibles} />
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-texto-3">{grupo ? grupo : "Total"}</p>
            <p className={cn("text-2xl font-semibold tracking-tight tabular", vista === "gastos" ? "text-peligro" : vista === "ingresos" ? "text-exito" : "")}>
              {q.isLoading ? <Esqueleto className="h-7 w-32" /> : moneda(grupo ? visibles.reduce((s, l) => s + Number(l.monto), 0) : total)}
            </p>
            <p className="text-xs text-texto-3">{q.isLoading ? "" : `${visibles.length} registros`}</p>
          </div>
          {p?.alternar && (
            <div className="flex rounded-lg bg-superficie-2 p-0.5 text-xs font-medium">
              {(
                [
                  ["ingresos", "Entró"],
                  ["gastos", "Salió"],
                ] as const
              ).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setVista(v);
                    setGrupo(null);
                  }}
                  className={cn("rounded-md px-3 py-1.5 transition-colors", vista === v ? "bg-superficie text-texto shadow-sm" : "text-texto-3 hover:text-texto-2")}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {etiquetasAgrupar.map(([a, t]) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAgrupar(a);
                setGrupo(null);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
                agrupar === a ? "bg-marca-suave text-marca-texto" : "text-texto-2 hover:bg-superficie-2 hover:text-texto",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-9" />
            ))}
          </div>
        ) : !lineas.length ? (
          <p className="py-10 text-center text-sm text-texto-3">No hay registros en este período.</p>
        ) : (
          <>
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {grupos.map((g) => (
                <li key={g.nombre}>
                  <button
                    type="button"
                    onClick={() => setGrupo(grupo === g.nombre ? null : g.nombre)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left transition-colors",
                      grupo === g.nombre ? "bg-marca-suave" : "hover:bg-superficie-2",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {agrupar === "dia" ? <span className="capitalize">{etiquetaDia(g.nombre)}</span> : g.nombre}
                        <span className="ml-1.5 text-xs text-texto-3">{g.n}</span>
                      </span>
                      <b className="shrink-0 font-semibold tabular">{moneda(g.monto)}</b>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-superficie-2">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(Math.abs(g.monto) / maximo) * 100}%`,
                          background: vista === "gastos" ? "color-mix(in oklab, var(--peligro) 70%, var(--superficie))" : vista === "ingresos" ? "var(--exito)" : "var(--marca)",
                        }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="overflow-hidden rounded-xl border border-borde">
              <ul className="max-h-80 divide-y divide-borde overflow-y-auto">
                {mostradas.map((l, i) => (
                  <li key={`${l.numero}-${l.cuenta}-${i}`} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-20 shrink-0 pt-0.5 text-xs text-texto-3 capitalize">{etiquetaDia(l.fecha)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.concepto}</span>
                      <span className="block truncate text-xs text-texto-3">
                        {[ORIGEN_DETALLE[l.origen] ?? l.origen, limpiarNombre(l.cuenta_nombre), l.tercero, l.medico && l.medico !== l.tercero ? `Dr(a). ${l.medico}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular", Number(l.monto) < 0 && "text-peligro")}>{moneda(l.monto)}</span>
                  </li>
                ))}
              </ul>
              {visibles.length > mostradas.length && (
                <button type="button" onClick={() => setTodas(true)} className="w-full border-t border-borde py-2 text-xs font-medium text-marca-texto hover:bg-superficie-2">
                  Ver los {visibles.length} registros
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Desde y hasta de un punto de la gráfica (día, semana o mes). */
function limitesPeriodo(periodo: string, agrupar: string): [string, string] {
  const d = new Date(periodo.slice(0, 10) + "T12:00:00");
  if (agrupar === "dia") return [isoDia(d), isoDia(d)];
  if (agrupar === "semana") return [isoDia(d), isoDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6))];
  return [isoDia(d), isoDia(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}

// ---------------------------------------------------------------------------
// Movimientos importantes
// ---------------------------------------------------------------------------
interface Movimiento {
  cuando: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  concepto: string;
  monto: number;
  anulado: boolean;
}
const ICONO_CATEGORIA: Record<string, LucideIcon> = {
  Cobro: Receipt,
  Donación: HandHeart,
  Gasto: TrendingDown,
  Nómina: Users,
  "Pago a médicos": HandCoins,
};
const COLUMNAS_MOVIMIENTOS: ColumnaDatos<Movimiento>[] = [
  { titulo: "Fecha", valor: (m) => m.cuando, tipo: "fechaHora" },
  { titulo: "Tipo", valor: (m) => (m.tipo === "ingreso" ? "Entrada" : "Salida") },
  { titulo: "Categoría", valor: (m) => m.categoria },
  { titulo: "Concepto", valor: (m) => m.concepto },
  { titulo: "Monto", valor: (m) => (m.tipo === "ingreso" ? 1 : -1) * Number(m.monto), tipo: "moneda" },
  { titulo: "Anulado", valor: (m) => (m.anulado ? "Sí" : "") },
];

export function MovimientosImportantes() {
  const { sistemaId } = useSistema();
  const [r, setR] = useState<Rango>("mes");
  const [tipo, setTipo] = useState<"todos" | "ingreso" | "egreso">("todos");
  const [minimo, setMinimo] = useState(0);
  const [desde, hasta] = rango(r);
  const q = useQuery({
    queryKey: ["movimientos-importantes", sistemaId, desde, hasta, minimo],
    queryFn: async () => datos(await supabase.rpc("movimientos_importantes", { p_sistema: sistemaId, p_desde: desde, p_hasta: hasta, p_minimo: minimo })) as unknown as Movimiento[],
    placeholderData: (prev) => prev,
  });
  const lista = (q.data ?? []).filter((m) => tipo === "todos" || m.tipo === tipo);
  const entradas = lista.filter((m) => m.tipo === "ingreso" && !m.anulado).reduce((s, m) => s + Number(m.monto), 0);
  const salidas = lista.filter((m) => m.tipo === "egreso" && !m.anulado).reduce((s, m) => s + Number(m.monto), 0);

  return (
    <>
      <EncabezadoPagina titulo="Movimientos importantes" descripcion="Cobros, donaciones, gastos, nóminas y pagos a médicos en una sola lista." acciones={<ChipsRango valor={r} onChange={setR} />} />
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-borde p-3">
          <div className="flex rounded-lg bg-superficie-2 p-0.5 text-xs font-medium">
            {(
              [
                ["todos", "Todo"],
                ["ingreso", "Entradas"],
                ["egreso", "Salidas"],
              ] as const
            ).map(([v, t]) => (
              <button key={v} onClick={() => setTipo(v)} className={cn("rounded-md px-3 py-1.5 transition-colors", tipo === v ? "bg-superficie text-texto shadow-sm" : "text-texto-3 hover:text-texto-2")}>
                {t}
              </button>
            ))}
          </div>
          <Selector contenedor="w-44" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))}>
            <option value={0}>Cualquier monto</option>
            <option value={1000}>Desde RD$1,000</option>
            <option value={5000}>Desde RD$5,000</option>
            <option value={20000}>Desde RD$20,000</option>
          </Selector>
          <span className="ml-auto text-xs text-texto-3">
            <b className="text-exito">+{moneda(entradas)}</b> · <b className="text-peligro">−{moneda(salidas)}</b>
          </span>
          <AccionesDatos titulo="Movimientos importantes" columnas={COLUMNAS_MOVIMIENTOS} obtener={async () => lista} />
        </div>
        {q.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-11" />
            ))}
          </div>
        ) : !lista.length ? (
          <Vacio icono={<Scale />} titulo="Sin movimientos" descripcion="Prueba con otro período o quita el filtro de monto." />
        ) : (
          <motion.ul key={`${r}-${tipo}-${minimo}`} variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {lista.map((m, i) => {
              const Icono = ICONO_CATEGORIA[m.categoria] ?? (m.tipo === "ingreso" ? TrendingUp : TrendingDown);
              const color = m.tipo === "ingreso" ? "var(--exito)" : "var(--peligro)";
              return (
                <motion.li key={i} variants={itemEscalonado} className={cn("flex items-center gap-3 px-5 py-3", m.anulado && "opacity-50")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 12%, var(--superficie))`, color }}>
                    <Icono className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", m.anulado && "line-through")}>{m.concepto}</p>
                    <p className="text-xs text-texto-3">
                      {m.categoria} · {fechaHora(m.cuando)}
                      {m.anulado && " · Anulado"}
                    </p>
                  </div>
                  <span className={cn("text-sm font-semibold tabular", m.tipo === "ingreso" ? "text-exito" : "text-peligro")}>
                    {m.tipo === "ingreso" ? "+" : "−"}
                    {moneda(m.monto)}
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </Tarjeta>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cierres diarios
// ---------------------------------------------------------------------------
interface Cierre {
  fecha: string;
  citas: number;
  atendidos: number;
  pacientes_cobrados: number;
  cobros: number;
  facturado: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  otros: number;
  cobertura_ars: number;
  gastos: number;
  donaciones: number;
}
const COLUMNAS_CIERRES: ColumnaDatos<Cierre>[] = [
  { titulo: "Día", valor: (c) => c.fecha, tipo: "fecha" },
  { titulo: "Citas", valor: (c) => c.citas, tipo: "numero" },
  { titulo: "Atendidos", valor: (c) => c.atendidos, tipo: "numero" },
  { titulo: "Cobros", valor: (c) => c.cobros, tipo: "numero" },
  { titulo: "Facturado", valor: (c) => c.facturado, tipo: "moneda" },
  { titulo: "Efectivo", valor: (c) => c.efectivo, tipo: "moneda" },
  { titulo: "Tarjeta", valor: (c) => c.tarjeta, tipo: "moneda" },
  { titulo: "Transferencia", valor: (c) => c.transferencia, tipo: "moneda" },
  { titulo: "Otros", valor: (c) => c.otros, tipo: "moneda" },
  { titulo: "Cubierto por ARS", valor: (c) => c.cobertura_ars, tipo: "moneda" },
  { titulo: "Gastos", valor: (c) => c.gastos, tipo: "moneda" },
  { titulo: "Donaciones", valor: (c) => c.donaciones, tipo: "moneda" },
];

export function CierresDiarios() {
  const { sistemaId } = useSistema();
  const navegar = useNavigate();
  const q = useQuery({
    queryKey: ["cierres-diarios", sistemaId],
    queryFn: async () =>
      datos(await supabase.from("resumenes_diarios").select("*").eq("sistema_id", sistemaId).order("fecha", { ascending: false }).limit(120)) as unknown as Cierre[],
  });
  const lista = q.data ?? [];
  const ultimos = [...lista].slice(0, 30).reverse().map((c) => ({ ...c, etiqueta: fecha(c.fecha + "T12:00:00").slice(0, 5), facturado: Number(c.facturado) }));

  return (
    <>
      <EncabezadoPagina
        titulo="Cierres diarios"
        descripcion="Cada noche MEDORA guarda la foto del día: pacientes, dinero por método de pago, gastos y donaciones. No cambia aunque después se corrija algo."
        acciones={<AccionesDatos titulo="Cierres diarios" columnas={COLUMNAS_CIERRES} obtener={async () => lista} />}
      />
      <Tarjeta className="mb-4 p-5">
        <h2 className="text-[0.9375rem] font-semibold">Facturado por día</h2>
        <p className="mb-3 text-xs text-texto-3">Últimos 30 días guardados</p>
        <div className="h-44">
          {q.isLoading ? (
            <Esqueleto className="h-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ultimos} margin={{ left: -6, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 10, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip cursor={{ fill: "color-mix(in oklab, var(--marca) 6%, transparent)" }} contentStyle={tooltipEstilo} formatter={(v) => [moneda(Number(v)), "Facturado"]} />
                <Bar dataKey="facturado" fill="var(--marca)" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Tarjeta>
      <Tarjeta className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-marca-suave text-marca">
          <CalendarDays className="size-6" />
        </span>
        <div>
          <h2 className="text-[0.9375rem] font-semibold">Detalle día por día</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-texto-2">Mira cada cierre con su dinero por método de pago, gastos y donaciones.</p>
        </div>
        <Boton icono={<ArrowRight className="size-4" />} onClick={() => navegar("/finanzas/cierres")}>
          Más información
        </Boton>
      </Tarjeta>
    </>
  );
}

/** Pantalla detallada de los cierres diarios (se llega desde el botón "Más información"). */
export function CierresDetalle() {
  const { sistemaId } = useSistema();
  const [verVacios, setVerVacios] = useState(false);
  const q = useQuery({
    queryKey: ["cierres-diarios", sistemaId],
    queryFn: async () =>
      datos(await supabase.from("resumenes_diarios").select("*").eq("sistema_id", sistemaId).order("fecha", { ascending: false }).limit(180)) as unknown as Cierre[],
  });
  const todos = q.data ?? [];
  const conMovimiento = (c: Cierre) => c.atendidos > 0 || Number(c.facturado) > 0 || Number(c.gastos) > 0 || Number(c.donaciones) > 0;
  const lista = verVacios ? todos : todos.filter(conMovimiento);
  const vacios = todos.length - todos.filter(conMovimiento).length;

  return (
    <>
      <Link to="/finanzas?vista=cierres" className="mb-4 inline-flex items-center gap-1.5 text-sm text-texto-2 transition-colors hover:text-texto">
        <ArrowLeft className="size-4" /> Cierres diarios
      </Link>
      <EncabezadoPagina
        titulo="Detalle de cierres"
        descripcion="Cada día con su foto: pacientes atendidos, dinero por método de pago, gastos y donaciones."
        acciones={
          <>
            {vacios > 0 && <Interruptor activo={verVacios} onChange={setVerVacios} etiqueta={`Mostrar días sin movimiento (${vacios})`} />}
            <AccionesDatos titulo="Cierres diarios" columnas={COLUMNAS_CIERRES} obtener={async () => todos} />
          </>
        }
      />
      <Tarjeta className="overflow-x-auto">
        {q.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-10" />
            ))}
          </div>
        ) : !lista.length ? (
          <Vacio
            icono={<CalendarDays />}
            titulo={todos.length ? "Ningún día con movimiento todavía" : "Aún no hay cierres"}
            descripcion={todos.length ? "Activa «Mostrar días sin movimiento» para verlos todos." : "El primero se guarda esta noche."}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs text-texto-3">
                <th className="px-5 py-2.5 font-medium">Día</th>
                <th className="px-3 py-2.5 text-right font-medium">Atendidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Facturado</th>
                <th className="px-3 py-2.5 text-right font-medium">Efectivo</th>
                <th className="px-3 py-2.5 text-right font-medium">Tarjeta</th>
                <th className="px-3 py-2.5 text-right font-medium">Transferencia</th>
                <th className="px-3 py-2.5 text-right font-medium">Gastos</th>
                <th className="px-5 py-2.5 text-right font-medium">Donaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((c) => (
                <tr key={c.fecha} className="transition-colors hover:bg-superficie-2/60">
                  <td className="px-5 py-2.5 font-medium capitalize">
                    {new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short" }).format(new Date(c.fecha + "T12:00:00"))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{c.atendidos}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular">{Number(c.facturado) ? moneda(c.facturado) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular text-texto-2">{Number(c.efectivo) ? moneda(c.efectivo) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular text-texto-2">{Number(c.tarjeta) ? moneda(c.tarjeta) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular text-texto-2">{Number(c.transferencia) ? moneda(c.transferencia) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular text-peligro">{Number(c.gastos) ? moneda(c.gastos) : "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular">{Number(c.donaciones) ? moneda(c.donaciones) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </>
  );
}

// ---------------------------------------------------------------------------
// Donaciones
// ---------------------------------------------------------------------------
interface Donacion {
  id: string;
  numero: string;
  donante_nombre: string;
  donante_documento: string | null;
  donante_contacto: string | null;
  anonima: boolean;
  monto: number;
  metodo: string;
  referencia: string | null;
  destino: string | null;
  fecha: string;
  notas: string | null;
  creado_en: string;
  anulacion: { motivo: string }[] | { motivo: string } | null;
}
const anulada = (d: Donacion) => (Array.isArray(d.anulacion) ? d.anulacion.length > 0 : !!d.anulacion);
const COLUMNAS_DONACIONES: ColumnaDatos<Donacion>[] = [
  { titulo: "Número", valor: (d) => d.numero },
  { titulo: "Fecha", valor: (d) => d.fecha, tipo: "fecha" },
  { titulo: "Donante", valor: (d) => (d.anonima ? "Anónimo" : d.donante_nombre) },
  { titulo: "Cédula / RNC", valor: (d) => d.donante_documento },
  { titulo: "Destino", valor: (d) => d.destino },
  { titulo: "Método", valor: (d) => METODOS_PAGO[d.metodo] ?? d.metodo },
  { titulo: "Monto", valor: (d) => Number(d.monto), tipo: "moneda" },
  { titulo: "Estado", valor: (d) => (anulada(d) ? "Anulada" : "Vigente") },
];

export function Donaciones() {
  const { sistemaId, roles, permisos } = useSistema();
  const { esSuperadmin } = useSesion();
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);
  const [recibo, setRecibo] = useState<Donacion | null>(null);
  const [anular, setAnular] = useState<Donacion | null>(null);
  const puedeRegistrar = roles.some((r) => ["admin", "caja", "gerencia"].includes(r)) && puede(roles, "caja", esSuperadmin, permisos);
  const puedeAnular = roles.some((r) => ["admin", "gerencia"].includes(r));
  useAccionUrl({ nueva: () => puedeRegistrar && setNueva(true) });

  const q = useQuery({
    queryKey: ["donaciones", sistemaId],
    queryFn: async () =>
      datos(
        await supabase
          .from("donaciones")
          .select("*, anulacion:anulaciones_donacion(motivo)")
          .eq("sistema_id", sistemaId)
          .order("creado_en", { ascending: false })
          .limit(500),
      ) as unknown as Donacion[],
  });
  const lista = q.data ?? [];
  const vigentes = lista.filter((d) => !anulada(d));
  const inicioMes = isoDia(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const delMes = vigentes.filter((d) => d.fecha >= inicioMes);
  const donantes = new Set(vigentes.filter((d) => !d.anonima).map((d) => d.donante_documento || d.donante_nombre.toLowerCase())).size;

  const meses = useMemo(() => {
    const h = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(h.getFullYear(), h.getMonth() - 11 + i, 1);
      const clave = isoDia(d).slice(0, 7);
      return {
        etiqueta: new Intl.DateTimeFormat("es-DO", { month: "short" }).format(d).replace(".", ""),
        monto: vigentes.filter((x) => x.fecha.startsWith(clave)).reduce((s, x) => s + Number(x.monto), 0),
      };
    });
  }, [vigentes]);

  const anularM = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => datos(await supabase.rpc("anular_donacion", { p_donacion: id, p_motivo: motivo })),
    onSuccess: () => {
      toast.success("Donación anulada: se revirtió su asiento.");
      void qc.invalidateQueries({ queryKey: ["donaciones", sistemaId] });
      setAnular(null);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Donaciones"
        descripcion="Aportes a la institución con su recibo. Entran a caja y a la contabilidad automáticamente."
        acciones={
          <>
            <AccionesDatos titulo="Donaciones" columnas={COLUMNAS_DONACIONES} obtener={async () => lista} />
            {puedeRegistrar && (
              <Boton icono={<HandHeart className="size-4" />} onClick={() => setNueva(true)}>
                Registrar donación
              </Boton>
            )}
          </>
        }
      />
      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 md:grid-cols-3">
        <Kpi etiqueta="Este mes" valor={delMes.reduce((s, d) => s + Number(d.monto), 0)} extra={`${delMes.length} donaciones`} icono={HandHeart} tono="violeta" cargando={q.isLoading} dinero />
        <Kpi etiqueta="Últimos 12 meses" valor={meses.reduce((s, m) => s + m.monto, 0)} extra="Sin contar las anuladas" icono={TrendingUp} tono="exito" cargando={q.isLoading} dinero />
        <Kpi etiqueta="Donantes" valor={donantes} extra="Distintos, sin contar anónimos" icono={Users} tono="marca" cargando={q.isLoading} />
      </motion.div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Tarjeta className="p-5">
          <h2 className="text-[0.9375rem] font-semibold">Donaciones por mes</h2>
          <p className="mb-3 text-xs text-texto-3">Últimos 12 meses</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={meses} margin={{ left: -6, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip cursor={{ fill: "color-mix(in oklab, #7a5af8 8%, transparent)" }} contentStyle={tooltipEstilo} formatter={(v) => [moneda(Number(v)), "Donado"]} />
                <Bar dataKey="monto" fill="#7a5af8" radius={[5, 5, 0, 0]} maxBarSize={24} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>

        <Tarjeta className="overflow-hidden">
          {q.isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-11" />
              ))}
            </div>
          ) : !lista.length ? (
            <Vacio icono={<HandHeart />} titulo="Aún no hay donaciones" descripcion="Registra la primera con el botón de arriba." />
          ) : (
            <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="max-h-[26rem] divide-y divide-borde overflow-y-auto">
              {lista.map((d) => (
                <motion.li key={d.id} variants={itemEscalonado} className={cn("group flex items-center gap-3 px-5 py-3", anulada(d) && "opacity-50")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,#7a5af8_12%,var(--superficie))] text-[#7a5af8]">
                    <HandHeart className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", anulada(d) && "line-through")}>{d.anonima ? "Donante anónimo" : d.donante_nombre}</p>
                    <p className="truncate text-xs text-texto-3">
                      {d.numero} · {fecha(d.fecha + "T12:00:00")} · {METODOS_PAGO[d.metodo]}
                      {d.destino ? ` · ${d.destino}` : ""}
                    </p>
                  </div>
                  {anulada(d) && <Insignia tono="peligro">Anulada</Insignia>}
                  <span className="text-sm font-semibold tabular">{moneda(d.monto)}</span>
                  <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button onClick={() => setRecibo(d)} title="Recibo" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
                      <Printer className="size-4" />
                    </button>
                    {puedeAnular && !anulada(d) && (
                      <button onClick={() => setAnular(d)} title="Anular" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro">
                        <Ban className="size-4" />
                      </button>
                    )}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Tarjeta>
      </div>

      <NuevaDonacion abierto={nueva} onCerrar={() => setNueva(false)} onRegistrada={(d) => setRecibo(d)} />
      <ReciboDonacion donacion={recibo} onCerrar={() => setRecibo(null)} />
      <AnularDonacion donacion={anular} onCerrar={() => setAnular(null)} cargando={anularM.isPending} onConfirmar={(motivo) => anular && anularM.mutate({ id: anular.id, motivo })} />
    </>
  );
}

function NuevaDonacion({ abierto, onCerrar, onRegistrada }: { abierto: boolean; onCerrar: () => void; onRegistrada: (d: Donacion) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const vacio = { donante: "", documento: "", contacto: "", anonima: false, monto: "", metodo: "efectivo", referencia: "", destino: "", notas: "" };
  const [f, setF] = useState(vacio);
  const [intentado, setIntentado] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const r = datos(
        await supabase.rpc("registrar_donacion", {
          p_sistema: sistemaId,
          p_donante: f.anonima && !f.donante.trim() ? "Donante anónimo" : f.donante,
          p_monto: Number(f.monto),
          p_metodo: f.metodo as "efectivo",
          p_documento: f.documento || undefined,
          p_contacto: f.contacto || undefined,
          p_anonima: f.anonima,
          p_referencia: f.referencia || undefined,
          p_destino: f.destino || undefined,
          p_notas: f.notas || undefined,
        }),
      ) as { id: string };
      return datos(await supabase.from("donaciones").select("*, anulacion:anulaciones_donacion(motivo)").eq("id", r.id).single()) as unknown as Donacion;
    },
    onSuccess: (d) => {
      toast.success(`Donación ${d.numero} registrada`);
      void qc.invalidateQueries({ queryKey: ["donaciones"] });
      void qc.invalidateQueries({ queryKey: ["resumen-financiero"] });
      setF(vacio);
      setIntentado(false);
      onCerrar();
      onRegistrada(d);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const faltaNombre = !f.anonima && f.donante.trim().length < 2;
  const faltaMonto = !(Number(f.monto) > 0);
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar donación"
      descripcion="Se imprime un recibo y entra a la contabilidad como «Donaciones recibidas»."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            cargando={m.isPending}
            icono={<HandHeart className="size-4" />}
            onClick={() => {
              setIntentado(true);
              if (!faltaNombre && !faltaMonto) m.mutate();
            }}
          >
            Registrar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Entrada
          etiqueta="Donante"
          contenedor="col-span-2"
          placeholder="Nombre de la persona o empresa"
          value={f.donante}
          onChange={(e) => setF({ ...f, donante: e.target.value })}
          error={intentado && faltaNombre ? "Escribe el nombre del donante" : undefined}
        />
        <Entrada etiqueta="Cédula o RNC (opcional)" inputMode="numeric" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
        <Entrada etiqueta="Teléfono o correo (opcional)" value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
        <Entrada
          etiqueta="Monto"
          type="number"
          min={0}
          step="0.01"
          value={f.monto}
          onChange={(e) => setF({ ...f, monto: e.target.value })}
          error={intentado && faltaMonto ? "Indica el monto" : undefined}
        />
        <Selector etiqueta="Forma de pago" value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
          {["efectivo", "tarjeta", "transferencia", "cheque", "otro"].map((mt) => (
            <option key={mt} value={mt}>
              {METODOS_PAGO[mt]}
            </option>
          ))}
        </Selector>
        {f.metodo !== "efectivo" && <Entrada etiqueta="Referencia" placeholder="Número de transferencia o cheque" value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} />}
        <Entrada etiqueta="Destino (opcional)" contenedor={f.metodo === "efectivo" ? "col-span-2" : undefined} placeholder="Ej.: Jornada de cataratas" value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })} />
        <AreaTexto etiqueta="Notas" className="min-h-14" contenedor="col-span-2" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        <div className="col-span-2">
          <Interruptor activo={f.anonima} onChange={(anonima) => setF({ ...f, anonima })} etiqueta="Donación anónima (el nombre no aparece en los reportes)" />
        </div>
      </div>
    </Modal>
  );
}

function ReciboDonacion({ donacion: d, onCerrar }: { donacion: Donacion | null; onCerrar: () => void }) {
  return (
    <Documento abierto={!!d} onCerrar={onCerrar} titulo={`Recibo ${d?.numero ?? ""}`} nombreArchivo={`Recibo de donación ${d?.numero ?? ""}`}>
      {d && (
        <>
          <EncabezadoDocumento titulo="Recibo de donación" subtitulo={`${d.numero} · ${fecha(d.fecha + "T12:00:00")}`} />
          <p className="mb-4 leading-relaxed">
            Recibimos de <b>{d.anonima ? "un donante anónimo" : d.donante_nombre}</b>
            {!d.anonima && d.donante_documento ? ` (${d.donante_documento.length === 11 ? "cédula" : "RNC"} ${d.donante_documento})` : ""} la suma de{" "}
            <b>{moneda(d.monto)}</b> en {(METODOS_PAGO[d.metodo] ?? d.metodo).toLowerCase()}
            {d.referencia ? `, referencia ${d.referencia}` : ""}, en calidad de donación
            {d.destino ? ` destinada a: ${d.destino}` : ""}.
          </p>
          {d.notas && <p className="mb-4 text-[#475467]">{d.notas}</p>}
          <p className="mb-10">¡Gracias por su generosidad!</p>
          <div className="mt-12 grid grid-cols-2 gap-10 text-center text-[0.75rem]">
            <div className="border-t border-[#101828] pt-1">Recibido por</div>
            <div className="border-t border-[#101828] pt-1">Donante</div>
          </div>
          {anulada(d) && <p className="mt-6 text-center font-bold text-[#d92d20]">ANULADA</p>}
        </>
      )}
    </Documento>
  );
}

function AnularDonacion({ donacion, onCerrar, onConfirmar, cargando }: { donacion: Donacion | null; onCerrar: () => void; onConfirmar: (motivo: string) => void; cargando: boolean }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal
      abierto={!!donacion}
      onCerrar={onCerrar}
      titulo={`Anular ${donacion?.numero ?? ""}`}
      descripcion="Se revierte su asiento contable y, si fue en efectivo, sale de la caja abierta."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton variante="peligro" cargando={cargando} disabled={motivo.trim().length < 3} onClick={() => onConfirmar(motivo)}>
            Anular donación
          </Boton>
        </>
      }
    >
      <AreaTexto etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se registró dos veces" />
    </Modal>
  );
}

