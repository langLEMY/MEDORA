import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarPlus,
  Clock,
  DoorOpen,
  LayoutGrid,
  List,
  Search,
  ShieldCheck,
  Star,
  Stethoscope,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FormCita } from "@/components/FormCita";
import { TicketTurno } from "@/components/TicketTurno";
import { Boton } from "@/components/ui/boton";
import { Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, NumeroAnimado, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { claves, type CitaConRelaciones } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, supabase } from "@/lib/supabase";
import { useTiempoReal } from "@/lib/tiempoReal";
import { cn } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { RegistrarLlegada } from "./Recepcion";

export interface Medico {
  usuario_id: string;
  nombre: string;
  especialidad: string | null;
  exequatur: string | null;
  consultorio: string | null;
  estado: "en_consulta" | "llamando" | "disponible" | "sin_actividad";
  turno_actual: string | null;
  en_cola: number;
  cola_especialidad: number;
  atendidos_hoy: number;
  pendientes_hoy: number;
  atendidos_30d: number;
  espera_promedio: number | null;
  cierre_pct: number | null;
  puntos: number | null;
  estrellas: number | null;
}

export const ESTADO: Record<Medico["estado"], { etiqueta: string; tono: Tono; anillo: string }> = {
  en_consulta: { etiqueta: "En consulta", tono: "violeta", anillo: "ring-[#7a5af8]" },
  llamando: { etiqueta: "Llamando", tono: "info", anillo: "ring-[#2e90fa]" },
  disponible: { etiqueta: "Disponible", tono: "exito", anillo: "ring-exito" },
  sin_actividad: { etiqueta: "Sin actividad hoy", tono: "neutro", anillo: "ring-borde-fuerte" },
};

type Vista = "tarjetas" | "tabla";

/**
 * Directorio de médicos para quien agenda: quién está atendiendo, cuántos tiene
 * en cola, su calificación, y dar turno o agendar directo con él.
 */
export default function Medicos() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>(() => {
    try {
      return (localStorage.getItem("medora.medicos-vista") as Vista) || "tarjetas";
    } catch {
      return "tarjetas";
    }
  });
  const [texto, setTexto] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [estado, setEstado] = useState("");
  const [turnoPara, setTurnoPara] = useState<string | null>(null);
  const [citaPara, setCitaPara] = useState<string | null>(null);
  const [ticket, setTicket] = useState<CitaConRelaciones | null>(null);

  const q = useQuery({
    queryKey: [...claves.citas(sistemaId), "directorio"],
    refetchInterval: 60_000,
    queryFn: async () => (datos(await supabase.rpc("directorio_medicos", { p_sistema: sistemaId })) ?? []) as Medico[],
  });
  useTiempoReal("citas", sistemaId, [[...claves.citas(sistemaId)]]);

  const medicos = useMemo(() => q.data ?? [], [q.data]);
  const especialidades = [...new Set(medicos.map((m) => m.especialidad).filter((x): x is string => !!x))];
  const t = texto.trim().toLowerCase();
  const visibles = medicos.filter(
    (m) =>
      (!t || m.nombre.toLowerCase().includes(t) || m.especialidad?.toLowerCase().includes(t)) &&
      (!especialidad || m.especialidad === especialidad) &&
      (!estado || (estado === "atendiendo" ? m.estado === "en_consulta" || m.estado === "llamando" : m.estado === estado)),
  );
  const escribir = puedeEscribir.citas(roles);
  const suma = (f: (m: Medico) => number) => medicos.reduce((s, m) => s + f(m), 0);
  const cambiarVista = (v: Vista) => {
    setVista(v);
    try {
      localStorage.setItem("medora.medicos-vista", v);
    } catch {
      /* sin almacenamiento */
    }
  };

  const kpis: { titulo: string; valor: number; nota: string; icono: typeof Users; color: string }[] = [
    { titulo: "Médicos", valor: medicos.length, nota: `${especialidades.length} especialidades`, icono: Users, color: "text-marca bg-marca-suave" },
    {
      titulo: "Disponibles ahora",
      valor: medicos.filter((m) => m.estado === "disponible").length,
      nota: "con actividad hoy y sin paciente adentro",
      icono: UserCheck,
      color: "text-exito bg-[color-mix(in_oklab,var(--exito)_12%,var(--superficie))]",
    },
    {
      titulo: "En consulta ahora",
      valor: medicos.filter((m) => m.estado === "en_consulta" || m.estado === "llamando").length,
      nota: "atendiendo o llamando",
      icono: Stethoscope,
      color: "text-[#7a5af8] bg-[color-mix(in_oklab,#7a5af8_12%,var(--superficie))]",
    },
    {
      titulo: "Pacientes en espera",
      valor: suma((m) => m.en_cola) + colaSinMedico(medicos),
      nota: `${suma((m) => m.atendidos_hoy)} atendidos hoy`,
      icono: DoorOpen,
      color: "text-aviso bg-[color-mix(in_oklab,var(--aviso)_12%,var(--superficie))]",
    },
  ];

  return (
    <>
      <EncabezadoPagina
        titulo="Directorio de médicos"
        descripcion="Quién está atendiendo, cuántos pacientes tiene en cola y su calificación. Da turno o agenda directo con cada uno."
        acciones={
          <Segmentado
            id="vista-medicos"
            valor={vista}
            onChange={cambiarVista}
            opciones={[
              { valor: "tarjetas", etiqueta: <Icono icono={<LayoutGrid />} texto="Tarjetas" /> },
              { valor: "tabla", etiqueta: <Icono icono={<List />} texto="Tabla" /> },
            ]}
          />
        }
      />

      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <motion.div key={k.titulo} variants={itemEscalonado}>
            <Tarjeta className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-[0.8125rem] text-texto-2">{k.titulo}</p>
                <span className={cn("grid size-9 place-items-center rounded-xl", k.color)}>
                  <k.icono className="size-[1.125rem]" />
                </span>
              </div>
              <p className="mt-1 text-3xl font-semibold tracking-[-0.02em] tabular">
                {q.isLoading ? <Esqueleto className="h-8 w-12" /> : <NumeroAnimado valor={k.valor} />}
              </p>
              <p className="mt-1 text-xs text-texto-3">{k.nota}</p>
            </Tarjeta>
          </motion.div>
        ))}
      </motion.div>

      <Tarjeta className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <Entrada icono={<Search />} placeholder="Buscar médico o especialidad…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="w-72" />
        <Selector value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} contenedor="w-56">
          <option value="">Todas las especialidades</option>
          {especialidades.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </Selector>
        <Selector value={estado} onChange={(e) => setEstado(e.target.value)} contenedor="w-48">
          <option value="">Cualquier estado</option>
          <option value="disponible">Disponibles</option>
          <option value="atendiendo">En consulta</option>
          <option value="sin_actividad">Sin actividad hoy</option>
        </Selector>
        <p className="ml-auto text-xs text-texto-3">
          Mostrando {visibles.length} de {medicos.length} médicos
        </p>
      </Tarjeta>

      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<Stethoscope />} titulo="Ningún médico coincide" descripcion="Cambia los filtros o marca «Atiende citas» en Personal." />
        </Tarjeta>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={vista} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            {vista === "tarjetas" ? (
              <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibles.map((m) => (
                  <motion.div key={m.usuario_id} variants={itemEscalonado}>
                    <TarjetaMedico m={m} escribir={escribir} onTurno={() => setTurnoPara(m.usuario_id)} onCita={() => setCitaPara(m.usuario_id)} />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <TablaMedicos medicos={visibles} escribir={escribir} onTurno={setTurnoPara} onCita={setCitaPara} />
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <RegistrarLlegada
        cita={turnoPara ? "nueva" : null}
        medicoInicial={turnoPara ?? undefined}
        onCerrar={() => {
          setTurnoPara(null);
          void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
        }}
        onTurno={setTicket}
      />
      <FormCita abierto={!!citaPara} onCerrar={() => setCitaPara(null)} medicoInicial={citaPara ?? undefined} />
      <TicketTurno cita={ticket} onCerrar={() => setTicket(null)} />
    </>
  );
}

/** Pacientes esperando "cualquier médico" de una especialidad, contados una vez por especialidad. */
function colaSinMedico(medicos: Medico[]) {
  const porEsp = new Map<string, number>();
  medicos.forEach((m) => m.especialidad && porEsp.set(m.especialidad, Math.max(porEsp.get(m.especialidad) ?? 0, m.cola_especialidad)));
  return [...porEsp.values()].reduce((s, n) => s + n, 0);
}

function Icono({ icono, texto }: { icono: React.ReactNode; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 [&>svg]:size-3.5">
      {icono}
      {texto}
    </span>
  );
}

/** La calificación solo la ve el admin (espejo de directorio_medicos, que la devuelve null al resto). */
export const useVerCalificacion = () => useSistema().roles.includes("admin");

/** Estrellas en medias (★★★★½) con los puntos al pasar el mouse. */
export function Estrellas({ m, tamano = "sm" }: { m: Pick<Medico, "estrellas" | "puntos" | "atendidos_30d" | "espera_promedio" | "cierre_pct">; tamano?: "sm" | "md" }) {
  if (m.estrellas === null) return <span className="text-xs text-texto-3">Sin calificación todavía</span>;
  const titulo =
    `${m.puntos} de 100 puntos (últimos 30 días)\n` +
    `· ${m.atendidos_30d} pacientes atendidos\n` +
    (m.espera_promedio !== null ? `· ${m.espera_promedio} min de espera promedio\n` : "") +
    (m.cierre_pct !== null ? `· ${m.cierre_pct}% de consultas cerradas` : "");
  const tam = tamano === "md" ? "size-4" : "size-3.5";
  return (
    <span className="inline-flex items-center gap-1.5" title={titulo}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => {
          const lleno = Math.max(0, Math.min(1, Number(m.estrellas) - (i - 1)));
          return (
            <span key={i} className={cn("relative", tam)}>
              <Star className={cn("absolute inset-0 text-borde-fuerte", tam)} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${lleno * 100}%` }}>
                <Star className={cn("fill-[#f5b301] text-[#f5b301]", tam)} />
              </span>
            </span>
          );
        })}
      </span>
      <span className="text-xs font-semibold tabular">{Number(m.estrellas).toFixed(1)}</span>
    </span>
  );
}

function TarjetaMedico({ m, escribir, onTurno, onCita }: { m: Medico; escribir: boolean; onTurno: () => void; onCita: () => void }) {
  const e = ESTADO[m.estado];
  const verCalificacion = useVerCalificacion();
  const iniciales = m.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
  return (
    <Tarjeta className="flex h-full flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start gap-4 p-5">
        <span
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-2xl bg-marca-suave text-lg font-semibold text-marca-texto ring-2 ring-offset-2 ring-offset-superficie",
            e.anillo,
          )}
        >
          {iniciales}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[0.9375rem] font-semibold">{m.nombre}</p>
            <Insignia tono={e.tono} punto>
              {e.etiqueta}
            </Insignia>
          </div>
          <p className="truncate text-sm font-medium text-marca-texto">{m.especialidad ?? "Sin especialidad"}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-texto-3">
            <ShieldCheck className="size-3.5" />
            {m.exequatur ? `Exeq. ${m.exequatur}` : "Exequátur no registrado"}
            {m.consultorio ? ` · Consultorio ${m.consultorio}` : ""}
          </p>
          {verCalificacion && (
            <div className="mt-2">
              <Estrellas m={m} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 border-y border-borde bg-superficie-2/50 text-center">
        <Dato valor={m.en_cola + m.cola_especialidad} etiqueta="En cola" resaltar={m.en_cola + m.cola_especialidad > 0} />
        <Dato valor={m.atendidos_hoy} etiqueta="Atendidos hoy" />
        <Dato valor={m.pendientes_hoy} etiqueta="Por llegar" />
      </div>

      <div className="flex flex-1 items-end gap-2 p-4">
        {m.turno_actual ? (
          <p className="flex items-center gap-1.5 text-xs text-texto-2">
            <Clock className="size-3.5" /> Atendiendo el turno <span className="font-mono font-semibold">{m.turno_actual}</span>
          </p>
        ) : (
          <Link to="/agenda" className="text-xs font-medium text-marca-texto hover:underline">
            Ver agenda
          </Link>
        )}
        {escribir && (
          <div className="ml-auto flex gap-2">
            <Boton variante="secundario" tamano="sm" icono={<CalendarPlus className="size-3.5" />} onClick={onCita}>
              Agendar
            </Boton>
            <Boton tamano="sm" icono={<UserPlus className="size-3.5" />} onClick={onTurno}>
              Dar turno
            </Boton>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

function Dato({ valor, etiqueta, resaltar }: { valor: number; etiqueta: string; resaltar?: boolean }) {
  return (
    <div className="px-2 py-3 [&+&]:border-l [&+&]:border-borde">
      <p className={cn("text-xl font-semibold tabular", resaltar && "text-aviso")}>{valor}</p>
      <p className="text-[0.6875rem] text-texto-3">{etiqueta}</p>
    </div>
  );
}

function TablaMedicos({
  medicos,
  escribir,
  onTurno,
  onCita,
}: {
  medicos: Medico[];
  escribir: boolean;
  onTurno: (id: string) => void;
  onCita: (id: string) => void;
}) {
  const verCalificacion = useVerCalificacion();
  return (
    <Tarjeta className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-borde text-left text-[0.6875rem] tracking-wide text-texto-3 uppercase">
            <th className="px-5 py-2.5 font-medium">Médico</th>
            <th className="px-3 py-2.5 font-medium">Estado</th>
            <th className="px-3 py-2.5 text-right font-medium">En cola</th>
            <th className="px-3 py-2.5 text-right font-medium">Atendidos hoy</th>
            <th className="px-3 py-2.5 text-right font-medium">Por llegar</th>
            {verCalificacion && <th className="px-3 py-2.5 font-medium">Calificación</th>}
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {medicos.map((m) => {
            const cola = m.en_cola + m.cola_especialidad;
            return (
              <tr key={m.usuario_id} className="transition-colors hover:bg-superficie-2/50">
                <td className="px-5 py-3">
                  <p className="font-medium">{m.nombre}</p>
                  <p className="text-xs text-texto-3">{m.especialidad ?? "Sin especialidad"}</p>
                </td>
                <td className="px-3 py-3">
                  <Insignia tono={ESTADO[m.estado].tono} punto>
                    {ESTADO[m.estado].etiqueta}
                    {m.turno_actual ? ` · ${m.turno_actual}` : ""}
                  </Insignia>
                </td>
                <td className={cn("px-3 py-3 text-right font-semibold tabular", cola > 0 && "text-aviso")}>{cola}</td>
                <td className="px-3 py-3 text-right tabular">{m.atendidos_hoy}</td>
                <td className="px-3 py-3 text-right tabular">{m.pendientes_hoy}</td>
                {verCalificacion && (
                  <td className="px-3 py-3">
                    <Estrellas m={m} />
                  </td>
                )}
                <td className="px-5 py-3">
                  {escribir && (
                    <div className="flex justify-end gap-2">
                      <Boton variante="fantasma" tamano="sm" onClick={() => onCita(m.usuario_id)}>
                        Agendar
                      </Boton>
                      <Boton variante="suave" tamano="sm" onClick={() => onTurno(m.usuario_id)}>
                        Dar turno
                      </Boton>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Tarjeta>
  );
}
