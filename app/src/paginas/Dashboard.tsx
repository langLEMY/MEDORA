import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, CalendarCheck, Clock, PackageMinus, TrendingUp, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio } from "@/components/ui/superficies";
import { ESTADO_CITA, useCitas } from "@/lib/consultas";
import { puede } from "@/lib/permisos";
import { datos, supabase, type EstadoCita } from "@/lib/supabase";
import { hora, moneda } from "@/lib/utils";
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

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function Dashboard() {
  const { perfil } = useSesion();
  const { sistema, sistemaId, roles, esSuperadmin } = useSistema();
  const verFinanzas = puede(roles, "caja");
  const verInventario = puede(roles, "inventario");

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
  const nombre = perfil?.nombre_completo?.split(" ")[0] ?? "";

  const kpis = [
    { etiqueta: "Pacientes registrados", valor: r?.pacientes_total ?? 0, extra: `+${r?.pacientes_mes ?? 0} este mes`, icono: Users, ver: true },
    { etiqueta: "Citas de hoy", valor: r?.citas_hoy ?? 0, extra: `${r?.citas_por_estado?.en_espera ?? 0} en espera`, icono: CalendarCheck, ver: true },
    {
      etiqueta: "Ingresos de hoy",
      valor: Number(r?.ingresos_hoy ?? 0),
      extra: `${moneda(r?.ingresos_mes, sistema.moneda)} este mes`,
      icono: TrendingUp,
      ver: verFinanzas,
      formato: (n: number) => moneda(n, sistema.moneda),
    },
    { etiqueta: "Insumos bajo mínimo", valor: r?.stock_bajo ?? 0, extra: "Revisar inventario", icono: PackageMinus, ver: verInventario },
  ].filter((k) => k.ver);

  if (roles.length === 0 && esSuperadmin) {
    return (
      <>
        <EncabezadoPagina titulo={`${saludo()}, ${nombre}`} descripcion={sistema.nombre} />
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

  return (
    <>
      <EncabezadoPagina
        titulo={`${saludo()}, ${nombre}`}
        descripcion={new Intl.DateTimeFormat("es-DO", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
      />

      <motion.div
        variants={contenedorEscalonado}
        initial="inicial"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {kpis.map((k) => (
          <motion.div key={k.etiqueta} variants={itemEscalonado}>
            <Tarjeta className="group relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-texto-2">{k.etiqueta}</span>
                <span className="grid size-8 place-items-center rounded-lg bg-marca-suave text-marca transition-transform duration-300 group-hover:scale-105">
                  <k.icono className="size-4" />
                </span>
              </div>
              <div className="mt-3 text-[28px] font-semibold tracking-[-0.02em]">
                {resumen.isLoading ? <Esqueleto className="h-8 w-24" /> : <NumeroAnimado valor={k.valor} formato={k.formato} />}
              </div>
              <p className="mt-1 text-xs text-texto-3">{k.extra}</p>
            </Tarjeta>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Tarjeta className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold">Actividad de los últimos 14 días</h2>
              <p className="text-xs text-texto-3">Citas atendidas{verFinanzas ? " e ingresos netos" : ""}</p>
            </div>
          </div>
          <div className="h-64">
            {resumen.isLoading ? (
              <Esqueleto className="h-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={r?.serie ?? []} margin={{ left: -18, right: 4, top: 4 }}>
                  <defs>
                    <linearGradient id="g-citas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--marca)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--marca)" stopOpacity={0} />
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
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: "var(--borde-fuerte)" }}
                    contentStyle={{
                      background: "var(--superficie)",
                      border: "1px solid var(--borde)",
                      borderRadius: 12,
                      boxShadow: "var(--sombra-md)",
                      fontSize: 12,
                    }}
                    labelFormatter={(f) =>
                      new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short" }).format(
                        new Date(String(f) + "T00:00:00"),
                      )
                    }
                    formatter={(v, n) => (n === "ingresos" ? [moneda(Number(v), sistema.moneda), "Ingresos"] : [v, "Citas"])}
                  />
                  <Area
                    type="monotone"
                    dataKey="citas"
                    stroke="var(--marca)"
                    strokeWidth={2}
                    fill="url(#g-citas)"
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Tarjeta>

        <Tarjeta className="flex flex-col">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <h2 className="text-[15px] font-semibold">Agenda de hoy</h2>
            <Link to="/recepcion" className="flex items-center gap-1 text-[13px] font-medium text-marca-texto hover:underline">
              Recepción <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="max-h-[272px] flex-1 overflow-y-auto">
            {citas.isLoading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Esqueleto key={i} className="h-10" />
                ))}
              </div>
            ) : (citas.data?.length ?? 0) === 0 ? (
              <Vacio icono={<Clock />} titulo="Sin citas para hoy" />
            ) : (
              <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
                {citas.data!.map((c) => (
                  <motion.li key={c.id} variants={itemEscalonado} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-11 text-[13px] font-medium text-texto-2 tabular">{hora(c.inicio)}</span>
                    <Avatar nombre={`${c.paciente?.nombres} ${c.paciente?.apellidos}`} tamano={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {c.paciente?.nombres} {c.paciente?.apellidos}
                      </p>
                      <p className="truncate text-xs text-texto-3">{c.medico?.nombre_completo}</p>
                    </div>
                    <Insignia tono={ESTADO_CITA[c.estado].tono}>{ESTADO_CITA[c.estado].etiqueta}</Insignia>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
