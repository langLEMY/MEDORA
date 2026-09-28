import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, HandCoins, Stethoscope, UserCheck, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Selector } from "@/components/ui/campos";
import { EncabezadoPagina, Esqueleto, Tarjeta, Vacio } from "@/components/ui/superficies";
import { usePersonal, type Miembro } from "@/lib/consultas";
import { puede } from "@/lib/permisos";
import { mensajeError, supabase } from "@/lib/supabase";
import { cn, fechaHora, isoDia, moneda } from "@/lib/utils";
import { soloLoPropio, useSesion, useSistema } from "@/sesion/SesionProvider";

/**
 * Estadísticas de los profesionales. En FUNBIDE el médico cobra por paciente
 * (reglas de comisión), así que aquí se ve cuántos pacientes atendió y cuánto
 * le corresponde. Todo lo calcula Postgres (estadisticas_medico) con numeric
 * exacto; la app solo muestra.
 *
 * Se cuenta de dos formas y se comparan:
 *  - Atendidos con turno: turnos que el médico llamó y terminó en MEDORA.
 *  - Cobrados a su nombre: cobros vigentes con su comisión (de estos sale el pago).
 */

const PROFESIONALES = ["medico", "psicologia", "nutricion", "terapia"] as const;

interface Estadisticas {
  atendidos_turno: number;
  cobrados: number;
  facturado: number;
  comision: number;
  retencion: number;
  neto: number;
  atendidos_sin_cobro: number;
  cobrados_sin_turno: number;
  pagado: number;
  pendiente: number;
  meses: { mes: string; atendidos: number; cobrados: number; neto: number }[];
}

type Rango = "mes" | "anterior" | "trimestre" | "anio" | "personalizado";

function rango(r: Rango): [string, string] {
  const hoy = new Date();
  const d = (y: number, m: number, dia: number) => isoDia(new Date(y, m, dia));
  switch (r) {
    case "anterior":
      return [d(hoy.getFullYear(), hoy.getMonth() - 1, 1), d(hoy.getFullYear(), hoy.getMonth(), 0)];
    case "trimestre":
      return [d(hoy.getFullYear(), hoy.getMonth() - 2, 1), isoDia(hoy)];
    case "anio":
      return [d(hoy.getFullYear(), 0, 1), isoDia(hoy)];
    default:
      return [d(hoy.getFullYear(), hoy.getMonth(), 1), isoDia(hoy)];
  }
}

const nombreMes = (m: string, largo = false) =>
  new Intl.DateTimeFormat("es-DO", { month: largo ? "long" : "short", year: largo ? "numeric" : "2-digit" }).format(new Date(m + "-01T00:00:00"));

export default function Estadisticas() {
  const { perfil, esSuperadmin } = useSesion();
  const { sistemaId, roles, permisos } = useSistema();
  const directivo = puede(roles, "comisiones", esSuperadmin, permisos);
  const esProfesional = roles.some((r) => (PROFESIONALES as readonly string[]).includes(r));
  const personal = usePersonal(sistemaId);

  // Todos los profesionales del sistema, usen o no MEDORA (sus pacientes igual se cuentan).
  const profesionales = useMemo(
    () =>
      (personal.data ?? [])
        .filter((m) => m.roles.some((r) => (PROFESIONALES as readonly string[]).includes(r)))
        .sort((a, b) => Number(b.activo) - Number(a.activo) || (a.perfil?.nombre_completo ?? "").localeCompare(b.perfil?.nombre_completo ?? "")),
    [personal.data],
  );

  const [elegido, setElegido] = useState<string>("");
  const medicoId = directivo ? elegido || (esProfesional ? perfil?.id : profesionales[0]?.usuario_id) || "" : (perfil?.id ?? "");
  const medico: Miembro | undefined = profesionales.find((m) => m.usuario_id === medicoId);

  const [tipoRango, setTipoRango] = useState<Rango>("mes");
  const [personalizado, setPersonalizado] = useState<[string, string]>(rango("mes"));
  const [desde, hasta] = tipoRango === "personalizado" ? personalizado : rango(tipoRango);

  const q = useQuery({
    queryKey: ["estadisticas-medico", sistemaId, medicoId, desde, hasta],
    enabled: !!medicoId && !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_medico", { p_sistema: sistemaId, p_medico: medicoId, p_desde: desde, p_hasta: hasta });
      if (error) throw error;
      return data as unknown as Estadisticas;
    },
  });
  const e = q.data;
  const propio = soloLoPropio(roles) || (!directivo && esProfesional);

  return (
    <>
      <EncabezadoPagina
        titulo={propio ? "Mis estadísticas" : "Estadísticas"}
        descripcion={propio ? "Tus pacientes y lo que te corresponde según las reglas de pago." : "Pacientes atendidos y pago de cada profesional."}
        acciones={
          directivo && (
            <Selector value={medicoId} onChange={(x) => setElegido(x.target.value)} contenedor="w-72">
              {profesionales.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.perfil?.nombre_completo}
                  {m.especialidad ? ` · ${m.especialidad}` : ""}
                  {m.activo ? "" : " (inactivo)"}
                </option>
              ))}
            </Selector>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2">
        {(
          [
            ["mes", "Este mes"],
            ["anterior", "Mes pasado"],
            ["trimestre", "Últimos 3 meses"],
            ["anio", "Este año"],
            ["personalizado", "Fechas…"],
          ] as [Rango, string][]
        ).map(([k, t]) => (
          <button
            key={k}
            onClick={() => {
              if (k === "personalizado") setPersonalizado([desde, hasta]);
              setTipoRango(k);
            }}
            className={cn(
              "h-8 rounded-lg border px-3 text-[0.8125rem] font-medium transition-colors",
              tipoRango === k ? "border-marca bg-marca-suave text-marca-texto" : "border-borde bg-superficie text-texto-2 hover:bg-superficie-2",
            )}
          >
            {t}
          </button>
        ))}
        {tipoRango === "personalizado" && (
          <div className="flex items-end gap-2">
            <Entrada etiqueta="Desde" type="date" value={personalizado[0]} max={personalizado[1]} onChange={(x) => setPersonalizado([x.target.value, personalizado[1]])} />
            <Entrada etiqueta="Hasta" type="date" value={personalizado[1]} min={personalizado[0]} onChange={(x) => setPersonalizado([personalizado[0], x.target.value])} />
          </div>
        )}
      </div>

      {!medicoId ? (
        <Tarjeta>
          <Vacio icono={<Stethoscope />} titulo="No hay profesionales en este sistema" descripcion="Agrega médicos en Personal para ver sus estadísticas." />
        </Tarjeta>
      ) : q.isError ? (
        <Tarjeta>
          <Vacio icono={<AlertTriangle />} titulo="No se pudieron cargar las estadísticas" descripcion={mensajeError(q.error)} />
        </Tarjeta>
      ) : (
        <>
          {!propio && medico && (
            <p className="mb-3 text-sm text-texto-2">
              <span className="font-semibold text-texto">{medico.perfil?.nombre_completo}</span>
              {medico.especialidad ? ` · ${medico.especialidad}` : ""}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              icono={<UserCheck />}
              titulo="Pacientes atendidos"
              valor={e?.cobrados}
              detalle={e ? `${e.atendidos_turno} con turno llamado en MEDORA` : undefined}
              cargando={q.isLoading}
            />
            <Indicador icono={<CircleDollarSign />} titulo="Facturado" valor={e ? moneda(e.facturado) : undefined} detalle="Base de cálculo de su pago" cargando={q.isLoading} />
            <Indicador
              icono={<HandCoins />}
              titulo="Le corresponde"
              valor={e ? moneda(e.neto) : undefined}
              detalle={e ? `${moneda(e.comision)} − ${moneda(e.retencion)} de retención` : undefined}
              cargando={q.isLoading}
              destacado
            />
            <Indicador
              icono={<Wallet />}
              titulo="Pendiente de pago"
              valor={e ? moneda(e.pendiente) : undefined}
              detalle={e ? `Pagado a la fecha: ${moneda(e.pagado)}` : undefined}
              cargando={q.isLoading}
            />
          </div>

          {e && (e.atendidos_sin_cobro > 0 || e.cobrados_sin_turno > 0) && (
            <Tarjeta className="mt-4 flex gap-3 border-[color-mix(in_oklab,var(--aviso)_35%,var(--borde))] p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-aviso" />
              <div className="space-y-1 text-texto-2">
                <p className="font-medium text-texto">Control: los conteos no coinciden</p>
                {e.cobrados_sin_turno > 0 && (
                  <p>
                    <b>{e.cobrados_sin_turno}</b> paciente{e.cobrados_sin_turno > 1 ? "s" : ""} cobrado{e.cobrados_sin_turno > 1 ? "s" : ""} a su nombre sin turno
                    terminado en MEDORA (se atendió sin «Llamar siguiente» o la consulta quedó abierta).
                  </p>
                )}
                {e.atendidos_sin_cobro > 0 && (
                  <p>
                    <b>{e.atendidos_sin_cobro}</b> turno{e.atendidos_sin_cobro > 1 ? "s" : ""} terminado{e.atendidos_sin_cobro > 1 ? "s" : ""} sin cobro a su nombre
                    (exonerados, o cobrados a otro médico).
                  </p>
                )}
              </div>
            </Tarjeta>
          )}

          <Tarjeta className="mt-4 p-5">
            <h2 className="text-[0.9375rem] font-semibold">Comparativo de los últimos 12 meses</h2>
            <p className="mb-4 text-xs text-texto-3">Pacientes por mes y lo que le corresponde (neto).</p>
            <div className="h-72">
              {q.isLoading ? (
                <Esqueleto className="h-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={e?.meses ?? []} margin={{ left: -12, right: 8, top: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--borde)" strokeDasharray="3 4" />
                    <XAxis dataKey="mes" tickFormatter={(m: string) => nombreMes(m)} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--texto-3)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="d"
                      orientation="right"
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      tick={{ fontSize: 11, fill: "var(--texto-3)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--superficie-2)" }}
                      contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 12, boxShadow: "var(--sombra-md)", fontSize: 12 }}
                      labelFormatter={(m) => nombreMes(String(m), true)}
                      formatter={(v, n) => (n === "Le corresponde" ? [moneda(Number(v)), n] : [v, n])}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="n" dataKey="cobrados" name="Pacientes atendidos" fill="var(--marca)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar yAxisId="n" dataKey="atendidos" name="Con turno en MEDORA" fill="color-mix(in oklab, var(--marca) 35%, transparent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="d" dataKey="neto" name="Le corresponde" stroke="var(--exito)" strokeWidth={2} dot={{ r: 2.5 }} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </Tarjeta>

          {directivo && <CobrosSinMedico desde={desde} hasta={hasta} profesionales={profesionales.filter((m) => m.activo)} />}
        </>
      )}
    </>
  );
}

function Indicador({
  icono,
  titulo,
  valor,
  detalle,
  cargando,
  destacado,
}: {
  icono: ReactNode;
  titulo: string;
  valor: ReactNode;
  detalle?: string;
  cargando: boolean;
  destacado?: boolean;
}) {
  return (
    <Tarjeta className={cn("p-5", destacado && "border-[color-mix(in_oklab,var(--exito)_35%,var(--borde))]")}>
      <div className="flex items-center justify-between">
        <p className="text-[0.8125rem] font-medium text-texto-2">{titulo}</p>
        <span className={cn("grid size-8 place-items-center rounded-lg [&>svg]:size-4", destacado ? "bg-[color-mix(in_oklab,var(--exito)_14%,transparent)] text-exito" : "bg-marca-suave text-marca")}>
          {icono}
        </span>
      </div>
      {cargando ? <Esqueleto className="mt-3 h-8 w-32" /> : <p className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em] tabular">{valor ?? "—"}</p>}
      {detalle && !cargando && <p className="mt-1 text-xs text-texto-3">{detalle}</p>}
    </Tarjeta>
  );
}

interface CobroSinMedico {
  cobro_id: string;
  numero: string;
  creado_en: string;
  paciente: string;
  especialidad: string | null;
  turno: string | null;
  total: number;
}

/** Turnos cobrados que nadie llamó en MEDORA: aquí se indica quién los atendió para que su pago se calcule. */
function CobrosSinMedico({ desde, hasta, profesionales }: { desde: string; hasta: string; profesionales: Miembro[] }) {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const asigna = roles.includes("admin") || roles.includes("caja");
  const [eleccion, setEleccion] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["cobros-sin-medico", sistemaId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cobros_sin_medico", { p_sistema: sistemaId, p_desde: desde, p_hasta: hasta });
      if (error) throw error;
      return (data ?? []) as unknown as CobroSinMedico[];
    },
  });

  const asignar = useMutation({
    mutationFn: async ({ cobro, medico }: { cobro: string; medico: string }) => {
      const { error } = await supabase.rpc("asignar_medico_cobro", { p_cobro: cobro, p_medico: medico });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Médico asignado", { description: "Su pago de ese paciente ya está calculado." });
      void qc.invalidateQueries({ queryKey: ["cobros-sin-medico", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["estadisticas-medico", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const filas = q.data ?? [];
  if (!q.isLoading && !filas.length) return null;

  return (
    <Tarjeta className="mt-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-borde px-5 py-3">
        <AlertTriangle className="size-4 text-aviso" />
        <span className="text-[0.9375rem] font-semibold">Pacientes cobrados sin médico</span>
        <span className="ml-auto text-xs text-texto-3">Indica quién los atendió para que se calcule su pago</span>
      </div>
      {q.isLoading ? (
        <Esqueleto className="m-5 h-16" />
      ) : (
        <ul className="divide-y divide-borde">
          {filas.map((f) => (
            <li key={f.cobro_id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              {f.turno && <span className="rounded-lg bg-marca-suave px-2 py-1 font-mono text-xs font-bold text-marca-texto">{f.turno}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.paciente || "Paciente"}</span>
                <span className="block text-xs text-texto-3">
                  {f.numero} · {fechaHora(f.creado_en)}
                  {f.especialidad ? ` · ${f.especialidad}` : ""} · {moneda(f.total)}
                </span>
              </span>
              {asigna && (
                <>
                  <Selector value={eleccion[f.cobro_id] ?? ""} onChange={(x) => setEleccion((s) => ({ ...s, [f.cobro_id]: x.target.value }))} contenedor="w-60">
                    <option value="">¿Quién lo atendió?</option>
                    {profesionales
                      .filter((m) => !f.especialidad || !m.especialidad || m.especialidad.trim().toLowerCase() === f.especialidad.trim().toLowerCase())
                      .map((m) => (
                        <option key={m.usuario_id} value={m.usuario_id}>
                          {m.perfil?.nombre_completo}
                        </option>
                      ))}
                  </Selector>
                  <Boton
                    tamano="sm"
                    disabled={!eleccion[f.cobro_id]}
                    cargando={asignar.isPending && asignar.variables?.cobro === f.cobro_id}
                    onClick={() => asignar.mutate({ cobro: f.cobro_id, medico: eleccion[f.cobro_id] })}
                  >
                    Asignar
                  </Boton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
