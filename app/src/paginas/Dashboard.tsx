import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  ChartColumn,
  Clock,
  Hourglass,
  PackageMinus,
  Stethoscope,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { MedicosAhora, TurnosEnVivo } from "@/components/WidgetsInicio";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { ESTADO_CITA, nombrePaciente, useCitas, type CitaConRelaciones } from "@/lib/consultas";
import { puede, puedeEscribir } from "@/lib/permisos";
import { datos, supabase, type EstadoCita } from "@/lib/supabase";
import { cn, hora, isoDia, moneda } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

interface Resumen {
  hoy: string;
  pacientes_total: number;
  pacientes_mes: number;
  citas_hoy: number;
  citas_por_estado: Partial<Record<EstadoCita, number>>;
  ingresos_hoy: number;
  ingresos_mes: number;
  stock_bajo: number;
  serie: { fecha: string; citas: number; ingresos: number }[];
}

interface EstadisticasMes {
  atendidos_turno: number;
  cobrados: number;
  neto: number;
  pendiente: number;
  meses: { mes: string; atendidos: number; cobrados: number; neto: number }[];
}

function saludo(h: number) {
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function useReloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

/** Prioridad legal primero, luego orden de llegada. */
const ordenCola = (a: CitaConRelaciones, b: CitaConRelaciones) =>
  Number(b.prioridad) - Number(a.prioridad) || (a.turno_en ?? a.llegada_en ?? a.inicio).localeCompare(b.turno_en ?? b.llegada_en ?? b.inicio);

// Colores del reparto de citas del día (mismos tonos que las insignias de estado).
const COLOR_ESTADO: Record<EstadoCita, string> = {
  programada: "var(--texto-3)",
  confirmada: "#2e90fa",
  por_cobrar: "color-mix(in oklab, var(--aviso) 60%, var(--superficie))",
  en_espera: "var(--aviso)",
  llamado: "#53b1fd",
  en_consulta: "#7a5af8",
  completada: "var(--exito)",
  cancelada: "var(--peligro)",
  no_asistio: "color-mix(in oklab, var(--peligro) 55%, var(--superficie))",
};

const tooltipEstilo = {
  background: "var(--superficie)",
  border: "1px solid var(--borde)",
  borderRadius: 12,
  boxShadow: "var(--sombra-md)",
  fontSize: 12,
  color: "var(--texto)",
};

export default function Dashboard() {
  const { perfil, sesion } = useSesion();
  const { sistema, roles, esSuperadmin, soloPropio } = useSistema();
  const yo = sesion?.user.id;
  const ahora = useReloj();
  const nombre = perfil?.nombre_completo?.split(" ")[0] ?? "";
  const fecha = new Intl.DateTimeFormat("es-DO", { weekday: "long", day: "numeric", month: "long" }).format(ahora);

  if (roles.length === 0 && esSuperadmin) {
    return (
      <>
        <EncabezadoPagina titulo={`${saludo(ahora.getHours())}, ${nombre}`} descripcion={sistema.nombre} />
        <Tarjeta>
          <Vacio
            icono={<Users />}
            titulo="Vista de superadministración"
            descripcion="No tienes membresía clínica en este sistema, así que no ves pacientes ni finanzas. Desde aquí puedes gestionar su personal, sedes y configuración."
          />
        </Tarjeta>
      </>
    );
  }

  return soloPropio && yo ? (
    <InicioMedico yo={yo} nombre={nombre} fecha={fecha} ahora={ahora} />
  ) : (
    <InicioOperacion nombre={nombre} fecha={fecha} ahora={ahora} />
  );
}

/* ------------------------------------------------------------------------ */
/* Piezas comunes                                                           */
/* ------------------------------------------------------------------------ */

interface Accion {
  etiqueta: string;
  ruta: string;
  icono: LucideIcon;
  principal?: boolean;
}

/** Portada: saludo, fecha, hora y los atajos del rol. Es lo primero que se ve. */
function Portada({ nombre, fecha, ahora, resumen, acciones }: { nombre: string; fecha: string; ahora: Date; resumen: ReactNode; acciones: Accion[] }) {
  const { sistema } = useSistema();
  const logo = sistema.logo_url;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="relative mb-4 overflow-hidden rounded-3xl border border-borde p-6 sm:p-7"
      style={{
        background:
          "radial-gradient(120% 140% at 100% 0%, color-mix(in oklab, var(--marca) 22%, transparent) 0%, transparent 55%), linear-gradient(135deg, color-mix(in oklab, var(--marca) 9%, var(--superficie)) 0%, var(--superficie) 70%)",
      }}
    >
      {/* Anillos decorativos con el color del hospital */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border-[28px] border-[color-mix(in_oklab,var(--marca)_8%,transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -right-4 -bottom-28 size-56 rounded-full border-[18px] border-[color-mix(in_oklab,var(--marca)_6%,transparent)]" />

      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-marca-texto uppercase first-letter:uppercase">{fecha}</p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2rem]">
            {saludo(ahora.getHours())}, {nombre}
          </h1>
          <div className="mt-2 max-w-xl text-sm text-texto-2">{resumen}</div>
          {acciones.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {acciones.map((a) => (
                <Link
                  key={a.ruta}
                  to={a.ruta}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-[0.8125rem] font-medium transition-[transform,background-color] duration-150 active:scale-[0.97]",
                    a.principal
                      ? "bg-marca text-white shadow-sm hover:bg-[color-mix(in_oklab,var(--marca)_88%,black)]"
                      : "border border-borde bg-[color-mix(in_oklab,var(--superficie)_70%,transparent)] text-texto hover:bg-superficie-2",
                  )}
                >
                  <a.icono className="size-4" />
                  {a.etiqueta}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-3 sm:flex">
          <div className="text-right">
            <p className="text-[2.25rem] leading-none font-semibold tracking-[-0.03em] tabular">
              {new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(ahora).replace(/\s?[ap]\.\s?m\./i, "")}
              <span className="ml-1.5 text-sm font-medium text-texto-3">{ahora.getHours() < 12 ? "a. m." : "p. m."}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-borde bg-[color-mix(in_oklab,var(--superficie)_75%,transparent)] px-3 py-1.5">
            {logo ? <img src={logo} alt="" className="size-5 rounded object-contain" /> : <span className="size-2 rounded-full bg-marca" />}
            <span className="max-w-48 truncate text-xs font-medium text-texto-2">{sistema.nombre}</span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/** Indicador con minigráfico opcional; toda la tarjeta lleva a su pantalla. */
function Indicador({
  etiqueta,
  valor,
  formato,
  extra,
  icono: Icono,
  ruta,
  serie,
  cargando,
  tono = "marca",
}: {
  etiqueta: string;
  valor: number;
  formato?: (n: number) => string;
  extra?: ReactNode;
  icono: LucideIcon;
  ruta?: string;
  serie?: number[];
  cargando?: boolean;
  tono?: "marca" | "aviso" | "exito" | "peligro";
}) {
  const color = tono === "marca" ? "var(--marca)" : `var(--${tono})`;
  const idGradiente = `mini${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const contenido = (
    <Tarjeta interactiva={!!ruta} className="group relative h-full overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <span className="text-[0.8125rem] font-medium text-texto-2">{etiqueta}</span>
        <span
          className="grid size-8 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105"
          style={{ background: `color-mix(in oklab, ${color} 13%, var(--superficie))`, color }}
        >
          <Icono className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-[1.75rem] font-semibold tracking-[-0.02em]">
        {cargando ? <Esqueleto className="h-8 w-24" /> : <NumeroAnimado valor={valor} formato={formato} />}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-texto-3">{extra}</p>
        {serie && serie.some((n) => n > 0) && (
          <div className="h-8 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#${idGradiente})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Tarjeta>
  );
  return (
    <motion.div variants={itemEscalonado} className="h-full">
      {ruta ? (
        <Link to={ruta} className="block h-full rounded-2xl">
          {contenido}
        </Link>
      ) : (
        contenido
      )}
    </motion.div>
  );
}

function EncabezadoTarjeta({ titulo, descripcion, ruta, enlace, extra }: { titulo: string; descripcion?: string; ruta?: string; enlace?: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold">{titulo}</h2>
        {descripcion && <p className="text-xs text-texto-3">{descripcion}</p>}
      </div>
      {extra}
      {ruta && enlace && (
        <Link to={ruta} className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium text-marca-texto hover:underline">
          {enlace} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

/** Lista de citas de hoy (por hora). */
function ListaCitas({ citas, cargando, vacio }: { citas: CitaConRelaciones[]; cargando: boolean; vacio: string }) {
  if (cargando)
    return (
      <div className="space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-10" />
        ))}
      </div>
    );
  if (!citas.length) return <Vacio icono={<Clock />} titulo={vacio} />;
  return (
    <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
      {citas.map((c) => (
        <motion.li key={c.id} variants={itemEscalonado} className="flex items-center gap-3 px-5 py-3">
          <span className="w-16 shrink-0 text-[0.8125rem] font-medium text-texto-2 tabular">{hora(c.inicio)}</span>
          <Avatar nombre={nombrePaciente(c)} tamano={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{nombrePaciente(c)}</p>
            <p className="truncate text-xs text-texto-3">{[c.turno, c.servicio?.nombre ?? c.medico?.nombre_completo].filter(Boolean).join(" · ")}</p>
          </div>
          <Insignia tono={ESTADO_CITA[c.estado].tono}>{ESTADO_CITA[c.estado].etiqueta}</Insignia>
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** Reparto de las citas de hoy por estado: barra apilada + leyenda con cantidades. */
function RepartoDia({ porEstado, cargando }: { porEstado: Partial<Record<EstadoCita, number>>; cargando: boolean }) {
  const orden: EstadoCita[] = ["completada", "en_consulta", "llamado", "en_espera", "por_cobrar", "confirmada", "programada", "no_asistio", "cancelada"];
  const items = orden.map((e) => ({ e, n: porEstado[e] ?? 0 })).filter((x) => x.n > 0);
  const total = items.reduce((s, x) => s + x.n, 0);
  const atendidas = (porEstado.completada ?? 0) + (porEstado.en_consulta ?? 0);
  const validas = total - (porEstado.cancelada ?? 0);
  const avance = validas ? Math.round((atendidas / validas) * 100) : 0;

  return (
    <Tarjeta className="flex flex-col">
      <EncabezadoTarjeta titulo="Así va el día" descripcion="Citas y turnos de hoy por estado" />
      <div className="flex flex-1 flex-col gap-5 p-5">
        {cargando ? (
          <Esqueleto className="h-24" />
        ) : !total ? (
          <Vacio icono={<CalendarCheck />} titulo="Todavía no hay citas hoy" />
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[2rem] leading-none font-semibold tracking-tight tabular">{avance}%</span>
                <span className="text-xs text-texto-3">
                  {atendidas} de {validas} atendidas
                </span>
              </div>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-superficie-2">
                {items.map((x) => (
                  <div key={x.e} title={`${ESTADO_CITA[x.e].etiqueta}: ${x.n}`} style={{ width: `${(x.n / total) * 100}%`, background: COLOR_ESTADO[x.e] }} />
                ))}
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {items.map((x) => (
                <li key={x.e} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: COLOR_ESTADO[x.e] }} />
                  <span className="min-w-0 flex-1 truncate text-texto-2">{ESTADO_CITA[x.e].etiqueta}</span>
                  <span className="font-semibold tabular">{x.n}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------------ */
/* Inicio de quien opera la clínica (admin, recepción, caja, gerencia…)     */
/* ------------------------------------------------------------------------ */

function InicioOperacion({ nombre, fecha, ahora }: { nombre: string; fecha: string; ahora: Date }) {
  const { sistemaId, roles, permisos } = useSistema();
  const verFinanzas = puede(roles, "caja", false, permisos);
  const verInventario = puede(roles, "inventario", false, permisos);
  const verRecepcion = puede(roles, "recepcion", false, permisos);
  const [serieVista, setSerieVista] = useState<"citas" | "ingresos">("citas");

  const resumen = useQuery({
    queryKey: ["dashboard", sistemaId],
    refetchInterval: 60_000,
    queryFn: async () => datos(await supabase.rpc("resumen_dashboard", { p_sistema: sistemaId })) as unknown as Resumen,
  });
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(inicioHoy);
  finHoy.setDate(finHoy.getDate() + 1);
  const citas = useCitas(sistemaId, inicioHoy.toISOString(), finHoy.toISOString());

  const r = resumen.data;
  const pe = r?.citas_por_estado ?? {};
  const enEspera = (pe.en_espera ?? 0) + (pe.llamado ?? 0);
  const serie = r?.serie ?? [];

  const acciones: Accion[] = [
    verRecepcion && { etiqueta: "Registrar llegada", ruta: "/recepcion?accion=llegada", icono: UserCheck, principal: true },
    verFinanzas && { etiqueta: "Cobrar", ruta: "/caja?accion=cobro", icono: Wallet, principal: !verRecepcion },
    puedeEscribir.citas(roles) && { etiqueta: "Programar cita", ruta: "/agenda?accion=nueva", icono: CalendarPlus },
    puedeEscribir.pacientes(roles) && { etiqueta: "Nuevo paciente", ruta: "/pacientes?accion=nuevo", icono: UserPlus },
  ].filter(Boolean) as Accion[];

  const frase = resumen.isLoading ? (
    <Esqueleto className="h-4 w-72" />
  ) : (r?.citas_hoy ?? 0) === 0 ? (
    "Hoy no hay citas todavía. Cuando lleguen pacientes los verás aquí en vivo."
  ) : (
    <>
      Hoy hay <strong className="font-semibold text-texto">{r!.citas_hoy} citas</strong>
      {enEspera > 0 && (
        <>
          , <strong className="font-semibold text-aviso">{enEspera} esperando</strong>
        </>
      )}{" "}
      y {pe.completada ?? 0} ya atendidas.
    </>
  );

  return (
    <>
      <Portada nombre={nombre} fecha={fecha} ahora={ahora} resumen={frase} acciones={acciones} />

      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          etiqueta="Citas de hoy"
          valor={r?.citas_hoy ?? 0}
          extra={`${pe.completada ?? 0} atendidas`}
          icono={CalendarCheck}
          ruta="/agenda"
          serie={serie.map((s) => s.citas)}
          cargando={resumen.isLoading}
        />
        <Indicador
          etiqueta="En sala de espera"
          valor={enEspera}
          extra={enEspera ? "Esperando a su médico" : "Nadie esperando"}
          icono={Hourglass}
          ruta={verRecepcion ? "/recepcion" : undefined}
          cargando={resumen.isLoading}
          tono="aviso"
        />
        {verFinanzas ? (
          <Indicador
            etiqueta="Ingresos de hoy"
            valor={Number(r?.ingresos_hoy ?? 0)}
            formato={(n) => moneda(n)}
            extra={`${moneda(r?.ingresos_mes)} este mes`}
            icono={TrendingUp}
            ruta="/caja"
            serie={serie.map((s) => Number(s.ingresos))}
            cargando={resumen.isLoading}
            tono="exito"
          />
        ) : (
          <Indicador etiqueta="Pacientes registrados" valor={r?.pacientes_total ?? 0} extra={`+${r?.pacientes_mes ?? 0} este mes`} icono={Users} ruta="/pacientes" cargando={resumen.isLoading} />
        )}
        {verInventario && (r?.stock_bajo ?? 0) > 0 ? (
          <Indicador etiqueta="Insumos bajo mínimo" valor={r?.stock_bajo ?? 0} extra="Revisar inventario" icono={PackageMinus} ruta="/inventario" cargando={resumen.isLoading} tono="peligro" />
        ) : verFinanzas ? (
          <Indicador etiqueta="Pacientes registrados" valor={r?.pacientes_total ?? 0} extra={`+${r?.pacientes_mes ?? 0} este mes`} icono={Users} ruta="/pacientes" cargando={resumen.isLoading} />
        ) : (
          <Indicador etiqueta="Pacientes nuevos" valor={r?.pacientes_mes ?? 0} extra="Registrados este mes" icono={UserPlus} ruta="/pacientes" cargando={resumen.isLoading} />
        )}
      </motion.div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Tarjeta className="flex flex-col">
          <EncabezadoTarjeta
            titulo="Últimos 14 días"
            descripcion={serieVista === "citas" ? "Citas por día" : "Ingresos netos por día"}
            extra={
              verFinanzas && (
                <div className="flex rounded-lg bg-superficie-2 p-0.5 text-xs font-medium">
                  {(["citas", "ingresos"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSerieVista(v)}
                      className={cn("rounded-md px-2.5 py-1 capitalize transition-colors", serieVista === v ? "bg-superficie text-texto shadow-sm" : "text-texto-3 hover:text-texto-2")}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )
            }
          />
          <div className="h-64 p-5 pt-4">
            {resumen.isLoading ? (
              <Esqueleto className="h-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie} margin={{ left: -12, right: 4, top: 4 }}>
                  <defs>
                    <linearGradient id="g-serie" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={serieVista === "citas" ? "var(--marca)" : "var(--exito)"} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={serieVista === "citas" ? "var(--marca)" : "var(--exito)"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={(f: string) => new Date(f + "T00:00:00").getDate().toString()}
                    tick={{ fontSize: 11, fill: "var(--texto-3)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickFormatter={(v: number) => (serieVista === "ingresos" ? (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)) : String(v))}
                    tick={{ fontSize: 11, fill: "var(--texto-3)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--borde-fuerte)" }}
                    contentStyle={tooltipEstilo}
                    labelFormatter={(f) => new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short" }).format(new Date(String(f) + "T00:00:00"))}
                    formatter={(v) => (serieVista === "ingresos" ? [moneda(Number(v)), "Ingresos"] : [v, "Citas"])}
                  />
                  <Area
                    key={serieVista}
                    type="monotone"
                    dataKey={serieVista}
                    stroke={serieVista === "citas" ? "var(--marca)" : "var(--exito)"}
                    strokeWidth={2}
                    fill="url(#g-serie)"
                    animationDuration={600}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Tarjeta>

        <RepartoDia porEstado={pe} cargando={resumen.isLoading} />
      </div>

      {verRecepcion ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <TurnosEnVivo />
          <MedicosAhora />
        </div>
      ) : (
        <Tarjeta className="mt-4 flex flex-col">
          <EncabezadoTarjeta titulo="Agenda de hoy" ruta="/agenda" enlace="Ver agenda" />
          <div className="max-h-[320px] overflow-y-auto">
            <ListaCitas citas={citas.data ?? []} cargando={citas.isLoading} vacio="Sin citas para hoy" />
          </div>
        </Tarjeta>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Inicio del médico: su cola, su día y su mes                               */
/* ------------------------------------------------------------------------ */

function InicioMedico({ yo, nombre, fecha, ahora }: { yo: string; nombre: string; fecha: string; ahora: Date }) {
  const { sistemaId, roles, permisos } = useSistema();
  const verEstadisticas = puede(roles, "estadisticas", false, permisos);

  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(inicioHoy);
  finHoy.setDate(finHoy.getDate() + 1);
  const citasQ = useCitas(sistemaId, inicioHoy.toISOString(), finHoy.toISOString());
  const citas = (citasQ.data ?? []).filter((c) => c.medico_id === yo || c.medico_id === null);
  const mias = citas.filter((c) => c.medico_id === yo);

  const desde = isoDia(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
  const hasta = isoDia(ahora);
  const est = useQuery({
    queryKey: ["estadisticas-medico", sistemaId, yo, desde, hasta],
    enabled: verEstadisticas,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_medico", { p_sistema: sistemaId, p_medico: yo, p_desde: desde, p_hasta: hasta });
      if (error) throw error;
      return data as unknown as EstadisticasMes;
    },
  });
  const e = est.data;

  const cola = citas.filter((c) => c.estado === "en_espera").sort(ordenCola);
  const actual = mias.find((c) => c.estado === "en_consulta" || c.estado === "llamado");
  const atendidosHoy = mias.filter((c) => c.estado === "completada").length;
  const pendientesHoy = mias.filter((c) => ["programada", "confirmada", "por_cobrar"].includes(c.estado)).length;
  const siguiente = cola[0];

  const acciones: Accion[] = [
    { etiqueta: "Ir a mi consulta", ruta: "/recepcion", icono: Stethoscope, principal: true },
    { etiqueta: "Mi agenda", ruta: "/agenda", icono: CalendarCheck },
    verEstadisticas && { etiqueta: "Mis estadísticas", ruta: "/estadisticas", icono: ChartColumn },
  ].filter(Boolean) as Accion[];

  const frase = citasQ.isLoading ? (
    <Esqueleto className="h-4 w-72" />
  ) : cola.length ? (
    <>
      Tienes <strong className="font-semibold text-aviso">{cola.length} {cola.length === 1 ? "paciente esperando" : "pacientes esperando"}</strong>
      {atendidosHoy > 0 && <> y ya atendiste {atendidosHoy} hoy</>}.
    </>
  ) : atendidosHoy ? (
    <>
      Nadie esperando ahora. Ya atendiste <strong className="font-semibold text-texto">{atendidosHoy}</strong> {atendidosHoy === 1 ? "paciente" : "pacientes"} hoy.
    </>
  ) : (
    "Nadie esperando por ahora. Cuando un paciente llegue y pague, aparecerá aquí."
  );

  const meses = (e?.meses ?? []).map((m) => ({ ...m, etiqueta: new Intl.DateTimeFormat("es-DO", { month: "short" }).format(new Date(m.mes.slice(0, 7) + "-15T12:00:00")).replace(".", "") }));

  return (
    <>
      <Portada nombre={nombre} fecha={fecha} ahora={ahora} resumen={frase} acciones={acciones} />

      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador etiqueta="Esperándote" valor={cola.length} extra={siguiente ? `Sigue ${siguiente.turno ?? nombrePaciente(siguiente)}` : "Sala vacía"} icono={Hourglass} ruta="/recepcion" cargando={citasQ.isLoading} tono="aviso" />
        <Indicador etiqueta="Atendidos hoy" valor={atendidosHoy} extra={pendientesHoy ? `${pendientesHoy} citas por llegar` : "Sin citas pendientes"} icono={UserCheck} ruta="/agenda" cargando={citasQ.isLoading} tono="exito" />
        {verEstadisticas && (
          <>
            <Indicador
              etiqueta="Pacientes este mes"
              valor={Number(e?.cobrados ?? 0)}
              extra={`${e?.atendidos_turno ?? 0} con turno en MEDORA`}
              icono={Users}
              ruta="/estadisticas"
              serie={(e?.meses ?? []).map((m) => Number(m.cobrados))}
              cargando={est.isLoading}
            />
            <Indicador
              etiqueta="Te corresponde este mes"
              valor={Number(e?.neto ?? 0)}
              formato={(n) => moneda(n)}
              extra={Number(e?.pendiente ?? 0) > 0 ? `${moneda(e?.pendiente)} por pagar` : "Según las reglas de pago"}
              icono={Wallet}
              ruta="/estadisticas"
              cargando={est.isLoading}
              tono="exito"
            />
          </>
        )}
      </motion.div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        {/* Quién está ahora y quién sigue */}
        <Tarjeta className="flex flex-col">
          <EncabezadoTarjeta titulo="Tu sala de espera" descripcion="Prioridad legal primero, luego por llegada" ruta="/recepcion" enlace="Mi consulta" />
          <div className="flex flex-1 flex-col gap-3 p-5">
            {actual && (
              <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_oklab,#7a5af8_30%,var(--borde))] bg-[color-mix(in_oklab,#7a5af8_7%,var(--superficie))] px-4 py-3">
                <span className="font-mono text-lg font-black text-[#7a5af8]">{actual.turno ?? "—"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nombrePaciente(actual)}</p>
                  <p className="text-xs text-texto-3">{actual.estado === "llamado" ? "Llamado, esperando que entre" : "En consulta contigo"}</p>
                </div>
              </div>
            )}
            {citasQ.isLoading ? (
              <Esqueleto className="h-24" />
            ) : !cola.length ? (
              <Vacio icono={<Hourglass />} titulo="Nadie esperando" descripcion="Los pacientes aparecen aquí al llegar y pagar." />
            ) : (
              <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
                {cola.slice(0, 6).map((c, i) => {
                  const min = Math.max(0, Math.floor((ahora.getTime() - new Date(c.turno_en ?? c.llegada_en ?? c.inicio).getTime()) / 60000));
                  return (
                    <li key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5", i === 0 && "bg-marca-suave")}>
                      <span className={cn("w-14 font-mono text-sm font-bold", i === 0 ? "text-marca-texto" : "text-texto-2")}>{c.turno ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{nombrePaciente(c)}</span>
                      {c.prioridad && <Insignia tono="aviso">Prioridad</Insignia>}
                      <span className={cn("text-xs tabular", min >= 30 ? "font-medium text-peligro" : "text-texto-3")}>{min} min</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Tarjeta>

        {verEstadisticas ? (
          <Tarjeta className="flex flex-col">
            <EncabezadoTarjeta titulo="Tus últimos 12 meses" descripcion="Pacientes atendidos por mes" ruta="/estadisticas" enlace="Ver detalle" />
            <div className="h-64 p-5 pt-4">
              {est.isLoading ? (
                <Esqueleto className="h-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={meses} margin={{ left: -18, right: 4, top: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "color-mix(in oklab, var(--marca) 8%, transparent)" }}
                      contentStyle={tooltipEstilo}
                      formatter={(v, n) => (n === "neto" ? [moneda(Number(v)), "Te correspondió"] : [v, "Pacientes"])}
                    />
                    <Bar dataKey="cobrados" fill="var(--marca)" radius={[5, 5, 0, 0]} maxBarSize={26} animationDuration={600} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Tarjeta>
        ) : (
          <Tarjeta className="flex flex-col">
            <EncabezadoTarjeta titulo="Tu agenda de hoy" ruta="/agenda" enlace="Mi agenda" />
            <div className="max-h-[320px] overflow-y-auto">
              <ListaCitas citas={mias} cargando={citasQ.isLoading} vacio="Sin citas para hoy" />
            </div>
          </Tarjeta>
        )}
      </div>

      {verEstadisticas && (
        <Tarjeta className="mt-4 flex flex-col">
          <EncabezadoTarjeta titulo="Tu agenda de hoy" ruta="/agenda" enlace="Mi agenda" />
          <div className="max-h-[320px] overflow-y-auto">
            <ListaCitas citas={mias} cargando={citasQ.isLoading} vacio="Sin citas para hoy" />
          </div>
        </Tarjeta>
      )}
    </>
  );
}
