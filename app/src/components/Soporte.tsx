import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Archive, Construction, DatabaseBackup, Eraser, FileClock, LogOut, Power, RefreshCw, ShieldAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { obtenerTodo } from "@/components/AccionesDatos";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Interruptor } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Tarjeta } from "@/components/ui/superficies";
import { exportarExcel, type Celda } from "@/lib/excel";
import { invocar, mensajeError, supabase, SUPABASE_CLAVE, SUPABASE_URL } from "@/lib/supabase";
import { useConectados } from "@/lib/presencia";
import { borrarCacheOperativa } from "@/lib/sinConexion";
import { cn, fechaHora, isoDia, relativo } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";

/**
 * Herramientas de soporte (equivalentes a las de "Mi perfil" en FUNBIDE):
 * estado del sistema, respaldo, bitácora, limpieza de caché, cierre global de
 * sesiones y modo mantenimiento. Todo lo que afecta a la plataforma lo valida
 * Postgres (RPC security definer); aquí solo se ocultan los botones.
 */

// Límites del plan gratuito de Supabase (referencia para las barras de uso).
const LIMITE_BASE = 500 * 1024 ** 2;
const LIMITE_ARCHIVOS = 1024 ** 3;

type Resultado = { ok: boolean; detalle?: string } | null;

interface Diagnostico {
  hora_servidor: string;
  postgres: string;
  base_bytes: number;
  archivos_bytes: number;
  archivos: number;
  sistemas: number;
  sistemas_activos: number;
  usuarios: number;
  usuarios_activos: number;
  sesiones: number;
  auditoria_24h: number;
}

interface EstadoPlataforma {
  mantenimiento: boolean;
  mensaje: string | null;
  desde: string | null;
}

const mb = (b: number) => `${(b / 1024 ** 2).toLocaleString("es-DO", { maximumFractionDigits: 1 })} MB`;

async function medir<T>(f: () => PromiseLike<T>): Promise<{ valor: T; ms: number }> {
  const t = performance.now();
  const valor = await f();
  return { valor, ms: Math.round(performance.now() - t) };
}

/** Diagnóstico y herramientas de soporte: exclusivo de la superadministración. */
export function Soporte() {
  const { esSuperadmin, sistema } = useSesion();
  if (!esSuperadmin) return <ZonaRiesgo />;
  return (
    <div className="space-y-4">
      <EstadoSistema />
      <Conectados />
      <Respaldos />
      <Herramientas puedeRespaldar={!!sistema} />
      {esSuperadmin && <Avanzado />}
      <ZonaRiesgo />
    </div>
  );
}

// ---------------------------------------------------------------------------
interface FilaRespaldo {
  id: string;
  creado_en: string;
  origen: "automatico" | "manual";
  estado: "ok" | "error";
  ruta: string | null;
  bytes: number | null;
  filas: number | null;
  tablas: number | null;
  duracion_ms: number | null;
  error: string | null;
}

/** Respaldos cifrados de toda la plataforma (Edge Function "respaldo" + pg_cron cada madrugada). */
function Respaldos() {
  const qc = useQueryClient();
  const [bajando, setBajando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["respaldos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("respaldos").select("*").order("creado_en", { ascending: false }).limit(12);
      if (error) throw error;
      return data as unknown as FilaRespaldo[];
    },
  });
  const ahora = useMutation({
    mutationFn: () => invocar<{ respaldo: { filas: number } }>("respaldo", { accion: "ahora" }),
    onSuccess: (r) => {
      toast.success("Respaldo hecho", { description: `${Number(r.respaldo?.filas ?? 0).toLocaleString("es-DO")} registros cifrados y guardados.` });
      void qc.invalidateQueries({ queryKey: ["respaldos"] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const descargar = async (r: FilaRespaldo) => {
    setBajando(r.id);
    try {
      const { data } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/respaldo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_CLAVE, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ accion: "descargar", id: r.id }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error ?? "No se pudo descargar.");
      const url = URL.createObjectURL(await resp.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `medora-respaldo-${r.creado_en.slice(0, 10)}.json.gz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setBajando(null);
    }
  };
  const ultimo = q.data?.find((r) => r.estado === "ok");
  const fallo = q.data?.[0]?.estado === "error";

  return (
    <Tarjeta className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
            <DatabaseBackup className="size-4 text-marca" /> Respaldos automáticos
          </h2>
          <p className="text-xs text-texto-3">
            Toda la base, cifrada (AES-256), cada madrugada a las 3:00 a. m. Se conservan los últimos 30.{" "}
            {ultimo ? <>Último: {relativo(ultimo.creado_en)}.</> : "Aún no hay ninguno."}
          </p>
        </div>
        <Boton tamano="sm" icono={<DatabaseBackup className="size-4" />} cargando={ahora.isPending} onClick={() => ahora.mutate()}>
          Respaldar ahora
        </Boton>
      </div>
      {fallo && (
        <p className="mb-3 rounded-lg bg-[color-mix(in_oklab,var(--peligro)_10%,transparent)] px-3 py-2 text-xs text-peligro">
          El último intento falló: {q.data?.[0]?.error}
        </p>
      )}
      <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className={cn("size-2 shrink-0 rounded-full", r.estado === "ok" ? "bg-exito" : "bg-peligro")} />
            <span className="min-w-0 flex-1">
              <span className="block">{fechaHora(r.creado_en)}</span>
              <span className="block truncate text-xs text-texto-3">
                {r.origen === "manual" ? "Manual" : "Automático"}
                {r.estado === "ok" ? ` · ${Number(r.filas ?? 0).toLocaleString("es-DO")} registros · ${mb(Number(r.bytes ?? 0))}` : ` · ${r.error ?? "Error"}`}
              </span>
            </span>
            {r.ruta && r.estado === "ok" ? (
              <Boton tamano="sm" variante="fantasma" cargando={bajando === r.id} onClick={() => void descargar(r)}>
                Descargar
              </Boton>
            ) : (
              r.estado === "ok" && <span className="text-xs text-texto-3">Archivado</span>
            )}
          </li>
        ))}
        {!q.isLoading && !q.data?.length && <li className="px-3 py-6 text-center text-xs text-texto-3">El primer respaldo se hará esta madrugada.</li>}
      </ul>
    </Tarjeta>
  );
}

/** Personal con MEDORA abierto ahora mismo en este sistema. */
function Conectados() {
  const { sistema } = useSesion();
  const lista = useConectados(sistema?.id);
  return (
    <Tarjeta className="p-6">
      <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-exito opacity-60" />
          <span className="relative size-2 rounded-full bg-exito" />
        </span>
        Conectados ahora · {lista.length}
      </h2>
      <p className="mb-3 text-xs text-texto-3">Quién tiene {sistema?.nombre ?? "el sistema"} abierto y en qué pantalla está.</p>
      {!lista.length ? (
        <p className="py-4 text-center text-xs text-texto-3">Nadie más conectado en este momento.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {lista.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                className="flex items-center gap-2.5 rounded-xl border border-borde px-3 py-2"
              >
                <span className="size-2 shrink-0 rounded-full bg-exito" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.nombre || "Sin nombre"}</span>
                  <span className="block truncate text-xs text-texto-3">
                    En {c.pantalla} · desde {relativo(c.desde)}
                  </span>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
function EstadoSistema() {
  const { esSuperadmin } = useSesion();

  const q = useQuery({
    queryKey: ["soporte-estado", esSuperadmin],
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const r: Record<string, Resultado> = {};
      let diag: Diagnostico | null = null;
      let desfase: number | null = null;

      try {
        if (esSuperadmin) {
          const { valor, ms } = await medir(() => supabase.rpc("diagnostico_plataforma"));
          if (valor.error) throw valor.error;
          diag = valor.data as unknown as Diagnostico;
          desfase = Math.round((Date.now() - ms / 2 - new Date(diag.hora_servidor).getTime()) / 1000);
          r.base = { ok: true, detalle: `${ms} ms` };
        } else {
          const { valor, ms } = await medir(() => supabase.from("sistemas").select("id").limit(1));
          if (valor.error) throw valor.error;
          r.base = { ok: true, detalle: `${ms} ms` };
        }
      } catch (e) {
        r.base = { ok: false, detalle: mensajeError(e) };
      }

      try {
        const { data, error } = await supabase.auth.getUser();
        r.auth = error || !data.user ? { ok: false, detalle: error?.message } : { ok: true };
      } catch (e) {
        r.auth = { ok: false, detalle: mensajeError(e) };
      }

      try {
        const { error } = await supabase.storage.from("anexos-clinicos").list("", { limit: 1 });
        r.archivos = error ? { ok: false, detalle: error.message } : { ok: true };
      } catch (e) {
        r.archivos = { ok: false, detalle: mensajeError(e) };
      }

      if (esSuperadmin) {
        try {
          const { ms } = await medir(() => invocar("plataforma-usuarios", { accion: "ping" }));
          r.funciones = { ok: true, detalle: `${ms} ms` };
        } catch (e) {
          r.funciones = { ok: false, detalle: mensajeError(e) };
        }
      }

      const { data: estado } = await supabase.rpc("estado_plataforma");
      return { r, diag, desfase, estado: estado as unknown as EstadoPlataforma | null, en: new Date() };
    },
  });

  const d = q.data;
  const reloj: Resultado =
    d?.desfase == null ? null : Math.abs(d.desfase) <= 120 ? { ok: true, detalle: "Sincronizado" } : { ok: false, detalle: `Desfase de ${Math.round(d.desfase / 60)} min: corrige la hora de Windows` };

  return (
    <Tarjeta className="p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold">Estado del sistema</h2>
          <p className="text-xs text-texto-3">{d ? `Verificado ${relativo(d.en)}` : "Verificando…"}</p>
        </div>
        <Boton tamano="sm" variante="secundario" icono={<RefreshCw className={cn("size-3.5", q.isFetching && "animate-spin")} />} onClick={() => void q.refetch()} disabled={q.isFetching}>
          Verificar
        </Boton>
      </div>
      <dl className="divide-y divide-borde text-sm">
        <FilaEstado etiqueta="Base de datos" r={d?.r.base} cargando={q.isFetching} />
        <FilaEstado etiqueta="Inicio de sesión" r={d?.r.auth} cargando={q.isFetching} />
        <FilaEstado etiqueta="Almacenamiento de archivos" r={d?.r.archivos} cargando={q.isFetching} />
        {esSuperadmin && <FilaEstado etiqueta="Funciones del servidor" r={d?.r.funciones} cargando={q.isFetching} />}
        {esSuperadmin && <FilaEstado etiqueta="Reloj del equipo" r={reloj} cargando={q.isFetching} />}
        {d?.estado?.mantenimiento && (
          <FilaEstado etiqueta="Modo mantenimiento" r={{ ok: false, detalle: `Activo desde ${fechaHora(d.estado.desde)}` }} cargando={false} />
        )}
      </dl>

      {esSuperadmin && d?.diag && (
        <div className="mt-5 space-y-4 border-t border-borde pt-5">
          <BarraUso etiqueta="Base de datos" usado={d.diag.base_bytes} limite={LIMITE_BASE} />
          <BarraUso etiqueta={`Archivos (${d.diag.archivos.toLocaleString("es-DO")})`} usado={d.diag.archivos_bytes} limite={LIMITE_ARCHIVOS} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cifra valor={`${d.diag.sistemas_activos}/${d.diag.sistemas}`} etiqueta="Sistemas activos" />
            <Cifra valor={`${d.diag.usuarios_activos}/${d.diag.usuarios}`} etiqueta="Usuarios activos" />
            <Cifra valor={d.diag.sesiones} etiqueta="Sesiones abiertas" />
            <Cifra valor={d.diag.auditoria_24h} etiqueta="Eventos (24 h)" />
          </div>
          <p className="text-[0.6875rem] text-texto-3">
            PostgreSQL {d.diag.postgres} · App {__VERSION_APP__}
          </p>
        </div>
      )}
    </Tarjeta>
  );
}

function FilaEstado({ etiqueta, r, cargando }: { etiqueta: string; r?: Resultado; cargando: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-texto-2">{etiqueta}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={cargando || !r ? "cargando" : r.ok ? "ok" : "mal"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={cn("flex min-w-0 items-center gap-2 text-[0.8125rem]", cargando || !r ? "text-texto-3" : r.ok ? "text-exito" : "text-peligro")}
          >
            <span className={cn("size-2 shrink-0 rounded-full", cargando || !r ? "bg-texto-3/40" : r.ok ? "bg-exito" : "bg-peligro")} />
            <span className="truncate">{cargando || !r ? "Verificando…" : r.ok ? `Operativo${r.detalle ? ` · ${r.detalle}` : ""}` : (r.detalle ?? "Con problemas")}</span>
          </motion.span>
        </AnimatePresence>
      </dd>
    </div>
  );
}

function BarraUso({ etiqueta, usado, limite }: { etiqueta: string; usado: number; limite: number }) {
  const pct = Math.min(100, (usado / limite) * 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-texto-2">{etiqueta}</span>
        <span className="tabular text-texto-3">
          {mb(usado)} de {mb(limite)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
        <motion.div
          className={cn("h-full w-full origin-left rounded-full", pct > 85 ? "bg-peligro" : pct > 65 ? "bg-aviso" : "bg-marca")}
          initial={{ scaleX: 0.02 }}
          animate={{ scaleX: Math.max(pct, 1) / 100 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        />
      </div>
    </div>
  );
}

const Cifra = ({ valor, etiqueta }: { valor: ReactNode; etiqueta: string }) => (
  <div className="rounded-xl bg-superficie-2 px-3 py-2.5">
    <p className="text-base font-semibold tabular">{valor}</p>
    <p className="text-[0.6875rem] text-texto-3">{etiqueta}</p>
  </div>
);

// ---------------------------------------------------------------------------
/** Tablas con datos de un sistema, en el orden en que se exportan al respaldo. */
const TABLAS_RESPALDO = [
  "sedes", "membresias", "pacientes", "citas", "historial_clinico", "aseguradoras", "servicios", "coberturas",
  "turnos_caja", "cobros", "cobro_detalles", "cobro_pagos", "anulaciones_cobro", "anticipos", "abonos",
  "movimientos_financieros", "inventario_items", "movimientos_inventario", "proveedores", "compras", "compra_items",
  "anulaciones_compra", "reglas_comision", "comisiones", "liquidaciones_comision", "liquidacion_items", "empleados",
  "parametros_nomina", "nominas", "nomina_lineas", "cuentas_contables", "cuentas_predeterminadas", "asientos",
  "asiento_lineas", "secuencias_ncf", "contadores",
] as const;

const aCelda = (v: unknown): Celda => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 32000);
  if (typeof v === "string") return v.slice(0, 32000);
  return v as Celda;
};

function Herramientas({ puedeRespaldar }: { puedeRespaldar: boolean }) {
  const { sistema, esSuperadmin, roles } = useSesion();
  const qc = useQueryClient();
  const [progreso, setProgreso] = useState<string | null>(null);
  const puedeBitacora = esSuperadmin || roles.some((r) => ["admin", "auditor", "gerencia"].includes(r));

  const respaldo = useMutation({
    mutationFn: async () => {
      const hojas = [];
      let total = 0;
      for (const [i, tabla] of TABLAS_RESPALDO.entries()) {
        setProgreso(`${i + 1}/${TABLAS_RESPALDO.length} · ${tabla}`);
        const filas = await obtenerTodo<Record<string, unknown>>((desde, hasta) =>
          supabase.from(tabla).select("*").eq("sistema_id", sistema!.id).range(desde, hasta) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
        );
        if (!filas.length) continue;
        total += filas.length;
        hojas.push({ nombre: tabla, filas, columnas: Object.keys(filas[0]).map((k) => ({ titulo: k, valor: (f: Record<string, unknown>) => aCelda(f[k]) })) });
      }
      await exportarExcel(`Respaldo ${sistema!.nombre} ${isoDia()}`, hojas);
      void supabase.rpc("registrar_evento", { p_accion: "RESPALDO", p_sistema: sistema!.id });
      return total;
    },
    onSuccess: (n) => toast.success("Respaldo descargado", { description: `${n.toLocaleString("es-DO")} registros exportados.` }),
    onError: (e) => toast.error(mensajeError(e)),
    onSettled: () => setProgreso(null),
  });

  const bitacora = useMutation({
    mutationFn: async () => {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString();
      const filas = await obtenerTodo((a, b) => {
        let c = supabase.from("auditoria").select("creado_en, sistema_id, usuario_id, accion, tabla, registro_id").gte("creado_en", desde).order("creado_en", { ascending: false }).range(a, b);
        if (!esSuperadmin && sistema) c = c.eq("sistema_id", sistema.id);
        return c;
      });
      const [perfiles, sistemas] = await Promise.all([supabase.from("perfiles").select("id, nombre_completo, email"), supabase.from("sistemas").select("id, nombre")]);
      const persona = new Map((perfiles.data ?? []).map((p) => [p.id, p.nombre_completo || p.email]));
      const nombreSistema = new Map((sistemas.data ?? []).map((s) => [s.id, s.nombre]));
      await exportarExcel(`Actividad ${isoDia()}`, [
        {
          nombre: "Actividad (30 días)",
          filas,
          columnas: [
            { titulo: "Fecha", valor: (f) => new Date(f.creado_en) },
            { titulo: "Sistema", valor: (f) => (f.sistema_id ? (nombreSistema.get(f.sistema_id) ?? f.sistema_id) : "Plataforma") },
            { titulo: "Usuario", valor: (f) => (f.usuario_id ? (persona.get(f.usuario_id) ?? f.usuario_id) : "Sistema") },
            { titulo: "Acción", valor: (f) => f.accion },
            { titulo: "Tabla", valor: (f) => f.tabla },
            { titulo: "Registro", valor: (f) => f.registro_id },
          ],
        },
      ]);
      return filas.length;
    },
    onSuccess: (n) => toast.success("Registro de actividad descargado", { description: `${n.toLocaleString("es-DO")} eventos.` }),
    onError: (e) => toast.error(mensajeError(e)),
  });

  const limpiarCache = async () => {
    qc.clear();
    await borrarCacheOperativa();
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("medora.") && k !== "medora.tema" && k !== "medora.sistema") localStorage.removeItem(k);
      }
      sessionStorage.clear();
    } catch {
      /* almacenamiento no disponible */
    }
    location.reload();
  };

  return (
    <Tarjeta className="p-6">
      <h2 className="text-[0.9375rem] font-semibold">Herramientas de soporte</h2>
      <p className="mb-4 text-xs text-texto-3">Acciones rápidas para resolver incidencias comunes.</p>
      <div className="space-y-2">
        {puedeRespaldar && (
          <Herramienta
            icono={<Archive />}
            titulo="Exportar a Excel"
            detalle={progreso ?? `Todos los datos de ${sistema?.nombre} en un Excel (una hoja por tabla).`}
            accion="Descargar"
            cargando={respaldo.isPending}
            onClick={() => respaldo.mutate()}
          />
        )}
        {puedeBitacora && (
          <Herramienta
            icono={<FileClock />}
            titulo="Exportar registro de actividad"
            detalle={esSuperadmin ? "Últimos 30 días de bitácora de toda la plataforma, en Excel." : "Últimos 30 días de bitácora de este sistema, en Excel."}
            accion="Exportar"
            cargando={bitacora.isPending}
            onClick={() => bitacora.mutate()}
          />
        )}
        <Herramienta
          icono={<Eraser />}
          titulo="Limpiar caché local"
          detalle="Descarta los datos guardados en este equipo y recarga. Útil si algo se ve desactualizado."
          accion="Limpiar"
          onClick={() => void limpiarCache()}
        />
      </div>
    </Tarjeta>
  );
}

function Herramienta({
  icono,
  titulo,
  detalle,
  accion,
  onClick,
  cargando,
  peligro,
}: {
  icono: ReactNode;
  titulo: string;
  detalle: ReactNode;
  accion: string;
  onClick: () => void;
  cargando?: boolean;
  peligro?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-borde p-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-4", peligro ? "bg-[color-mix(in_oklab,var(--peligro)_10%,transparent)] text-peligro" : "bg-marca-suave text-marca")}>
        {icono}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="truncate text-xs text-texto-3">{detalle}</p>
      </div>
      <Boton tamano="sm" variante={peligro ? "peligro" : "secundario"} cargando={cargando} onClick={onClick}>
        {accion}
      </Boton>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Avanzado() {
  const qc = useQueryClient();
  const [cerrarTodo, setCerrarTodo] = useState(false);
  const [mantenimiento, setMantenimiento] = useState<boolean | null>(null);
  const [mensaje, setMensaje] = useState("");

  const estado = useQuery({
    queryKey: ["estado-plataforma"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estado_plataforma");
      if (error) throw error;
      return data as unknown as EstadoPlataforma;
    },
  });

  const sesiones = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("plataforma_cerrar_sesiones");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} sesión(es) cerradas`, { description: "Los accesos ya abiertos caducan en menos de una hora; para cortar al instante, activa el modo mantenimiento." });
      setCerrarTodo(false);
      void qc.invalidateQueries({ queryKey: ["soporte-estado"] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const cambiarMantenimiento = useMutation({
    mutationFn: async (activo: boolean) => {
      const { error } = await supabase.rpc("plataforma_mantenimiento", { p_activo: activo, p_mensaje: mensaje });
      if (error) throw error;
      return activo;
    },
    onSuccess: async (activo) => {
      toast.success(activo ? "Modo mantenimiento activado" : "Acceso restablecido para todo el personal");
      setMantenimiento(null);
      setMensaje("");
      await qc.invalidateQueries({ queryKey: ["estado-plataforma"] });
      await qc.invalidateQueries({ queryKey: ["soporte-estado"] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const activo = !!estado.data?.mantenimiento;

  return (
    <Tarjeta className="border-[color-mix(in_oklab,var(--peligro)_25%,var(--borde))] p-6">
      <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
        <ShieldAlert className="size-4 text-peligro" /> Avanzado
      </h2>
      <p className="mb-4 text-xs text-texto-3">Acciones de troubleshooting. Afectan a todo el personal de todos los sistemas, no solo a tu cuenta.</p>
      <div className="space-y-2">
        <Herramienta
          icono={<Power />}
          titulo="Cerrar las sesiones de todo el personal"
          detalle="Obliga a todos (menos a ti) a iniciar sesión de nuevo."
          accion="Cerrar sesiones"
          peligro
          onClick={() => setCerrarTodo(true)}
        />
        <div className="flex items-center gap-3 rounded-xl border border-borde p-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", activo ? "bg-[color-mix(in_oklab,var(--aviso)_14%,transparent)] text-aviso" : "bg-superficie-2 text-texto-3")}>
            <Construction className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Modo mantenimiento {activo ? "· activo" : ""}</p>
            <p className="truncate text-xs text-texto-3">
              {activo
                ? `Desde ${fechaHora(estado.data?.desde)}${estado.data?.mensaje ? ` · «${estado.data.mensaje}»` : ""}`
                : "Bloquea el acceso a todo el personal (menos la superadministración) mientras resuelves una incidencia."}
            </p>
          </div>
          <Interruptor activo={activo} onChange={(v) => setMantenimiento(v)} />
        </div>
      </div>

      <Modal
        abierto={cerrarTodo}
        onCerrar={() => setCerrarTodo(false)}
        titulo="¿Cerrar las sesiones de todo el personal?"
        descripcion="Todas las personas conectadas (menos tú) tendrán que volver a iniciar sesión."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setCerrarTodo(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" cargando={sesiones.isPending} onClick={() => sesiones.mutate()}>
              Cerrar sesiones
            </Boton>
          </>
        }
      />

      <Modal
        abierto={mantenimiento !== null}
        onCerrar={() => setMantenimiento(null)}
        titulo={mantenimiento ? "Activar modo mantenimiento" : "Quitar modo mantenimiento"}
        descripcion={
          mantenimiento
            ? "El personal de todos los sistemas pierde el acceso a los datos de inmediato y ve una pantalla de mantenimiento. La superadministración sigue entrando."
            : "Todo el personal recupera el acceso."
        }
        pie={
          <>
            <Boton variante="secundario" onClick={() => setMantenimiento(null)}>
              Cancelar
            </Boton>
            <Boton variante={mantenimiento ? "peligro" : "primario"} cargando={cambiarMantenimiento.isPending} onClick={() => cambiarMantenimiento.mutate(!!mantenimiento)}>
              {mantenimiento ? "Activar" : "Restablecer acceso"}
            </Boton>
          </>
        }
      >
        {mantenimiento && (
          <AreaTexto etiqueta="Mensaje para quien intente entrar (opcional)" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} placeholder="Ej.: Actualizando el sistema, volvemos a las 3:00 p. m." />
        )}
      </Modal>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
function ZonaRiesgo() {
  const [abierto, setAbierto] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Tarjeta className="p-6">
      <div className="flex items-center gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--peligro)_10%,transparent)] text-peligro">
          <LogOut className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Cerrar sesión en todos mis dispositivos</p>
          <p className="text-xs text-texto-3">Úsalo si perdiste o prestaste un equipo con tu cuenta abierta.</p>
        </div>
        <Boton variante="secundario" onClick={() => setAbierto(true)}>
          Cerrar todas
        </Boton>
      </div>
      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="¿Cerrar todas tus sesiones?"
        descripcion="Se cierra tu sesión en todos los equipos, incluido este."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" cargando={m.isPending} onClick={() => m.mutate()}>
              Cerrar todas
            </Boton>
          </>
        }
      />
    </Tarjeta>
  );
}

