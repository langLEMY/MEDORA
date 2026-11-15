import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { CalendarHeart, HandCoins, HandHeart, Lock, Plus, Printer, RotateCcw, Stethoscope, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { SelectorCie10 } from "@/components/SelectorCie10";
import { TONO_CATEGORIA } from "@/components/TarifaSocial";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { DESCRIPCION_CATEGORIA, TARIFA_SOCIAL_DEFECTO, type Categoria, type TarifaSocial } from "@/lib/fundacion";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, fechaHora, isoDia, moneda, relativo } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

type Vista = "resumen" | "fondos" | "tarifa" | "jornadas";

/**
 * Fundación (sistemas de naturaleza "fundacion", ASFL Ley 122-05): lo que se rinde a los
 * donantes, los fondos de cada donante, la tarifa social y las jornadas médicas.
 */
export default function Fundacion() {
  const { roles } = useSistema();
  const { naturaleza } = useSesion();
  const opciones = [
    puedeEscribir.reporteFundacion(roles) && { valor: "resumen" as const, etiqueta: "Resumen" },
    puedeEscribir.verFondos(roles) && { valor: "fondos" as const, etiqueta: "Fondos" },
    puedeEscribir.verEstudios(roles) && { valor: "tarifa" as const, etiqueta: "Tarifa social" },
    { valor: "jornadas" as const, etiqueta: "Jornadas" },
  ].filter(Boolean) as { valor: Vista; etiqueta: string }[];
  const [vista, setVista] = useState<Vista>(opciones[0].valor);
  const activa = opciones.some((o) => o.valor === vista) ? vista : opciones[0].valor;

  if (naturaleza !== "fundacion") {
    return (
      <>
        <EncabezadoPagina titulo="Fundación" />
        <Tarjeta>
          <Vacio icono={<HandHeart />} titulo="Esta institución no está registrada como fundación" descripcion="El soporte de MEDORA lo cambia en Sistema y sedes → Naturaleza." />
        </Tarjeta>
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Fundación"
        descripcion="Donaciones, fondos, tarifa social y jornadas médicas"
        acciones={opciones.length > 1 && <Segmentado id="fund-vista" valor={activa} onChange={setVista} opciones={opciones} />}
      />
      <AnimatePresence mode="wait">
        <motion.div key={activa} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
          {activa === "resumen" && <Resumen />}
          {activa === "fondos" && <Fondos />}
          {activa === "tarifa" && <TarifaSocialVista />}
          {activa === "jornadas" && <Jornadas />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Cifra({ titulo, valor, detalle, icono }: { titulo: string; valor: ReactNode; detalle?: ReactNode; icono: ReactNode }) {
  return (
    <Tarjeta className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[0.8125rem] font-medium text-texto-2">{titulo}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-marca-suave text-marca [&>svg]:size-4">{icono}</span>
      </div>
      <div className="mt-3 text-[1.5rem] font-semibold tracking-[-0.02em] tabular">{valor}</div>
      {detalle && <p className="mt-1 text-xs text-texto-3">{detalle}</p>}
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------------ */
/* Resumen para donantes / CASFL                                             */
/* ------------------------------------------------------------------------ */

interface Reporte {
  donaciones: { total: number; cantidad: number; donantes: number };
  por_donante: { donante: string; total: number; n: number }[];
  fondos: { nombre: string; restringido: boolean; recibido: number; usado: number; saldo: number }[];
  beneficiarios: { pacientes: number; consultas: number; jornadas: number; atenciones_jornadas: number };
  valor_social: { tarifa_social: number; otros_descuentos: number; exonerados: number; estudios: Partial<Record<Categoria, number>> };
  voluntarios: { personas: number; consultas: number };
}

type Periodo = "mes" | "anio" | "anio_pasado";

function rango(p: Periodo) {
  const hoy = new Date();
  if (p === "mes") return { desde: isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: isoDia(hoy), texto: new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric" }).format(hoy) };
  if (p === "anio") return { desde: `${hoy.getFullYear()}-01-01`, hasta: isoDia(hoy), texto: `Año ${hoy.getFullYear()}` };
  return { desde: `${hoy.getFullYear() - 1}-01-01`, hasta: `${hoy.getFullYear() - 1}-12-31`, texto: `Año ${hoy.getFullYear() - 1}` };
}

function Resumen() {
  const { sistemaId, sistema } = useSistema();
  const [periodo, setPeriodo] = useState<Periodo>("anio");
  const r = useMemo(() => rango(periodo), [periodo]);
  const [imprimir, setImprimir] = useState(false);
  const q = useQuery({
    queryKey: ["reporte-fundacion", sistemaId, r.desde, r.hasta],
    queryFn: async () => datos(await supabase.rpc("reporte_fundacion", { p_sistema: sistemaId, p_desde: r.desde, p_hasta: r.hasta })) as unknown as Reporte,
  });
  const d = q.data;
  const valorSocial = d ? Number(d.valor_social.tarifa_social) : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmentado
          id="fund-periodo"
          valor={periodo}
          onChange={setPeriodo}
          opciones={[
            { valor: "mes", etiqueta: "Este mes" },
            { valor: "anio", etiqueta: "Este año" },
            { valor: "anio_pasado", etiqueta: "Año pasado" },
          ]}
        />
        <Boton className="ml-auto" variante="secundario" icono={<Printer className="size-4" />} disabled={!d} onClick={() => setImprimir(true)}>
          Informe para donantes
        </Boton>
      </div>

      {q.isLoading || !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-28 rounded-2xl" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cifra titulo="Donaciones recibidas" icono={<HandCoins />} valor={moneda(d.donaciones.total)} detalle={`${d.donaciones.cantidad} donaciones · ${d.donaciones.donantes} donantes identificados`} />
            <Cifra titulo="Personas atendidas" icono={<Users />} valor={d.beneficiarios.pacientes + d.beneficiarios.atenciones_jornadas} detalle={`${d.beneficiarios.consultas} consultas · ${d.beneficiarios.atenciones_jornadas} en ${d.beneficiarios.jornadas} jornadas`} />
            <Cifra titulo="Tarifa social otorgada" icono={<HandHeart />} valor={moneda(valorSocial)} detalle={`${d.valor_social.exonerados} turnos exonerados · ${moneda(d.valor_social.otros_descuentos)} en otros descuentos`} />
            <Cifra titulo="Voluntariado" icono={<Stethoscope />} valor={d.voluntarios.personas} detalle={`${d.voluntarios.consultas} consultas de profesionales voluntarios`} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Tarjeta className="overflow-hidden">
              <p className="border-b border-borde px-5 py-3 text-[0.9375rem] font-semibold">Principales donantes</p>
              {!d.por_donante.length ? (
                <Vacio icono={<HandCoins />} titulo="Sin donaciones en el período" />
              ) : (
                <ul className="divide-y divide-borde">
                  {d.por_donante.map((x) => (
                    <li key={x.donante} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{x.donante}</span>
                      <span className="text-xs text-texto-3">{x.n}</span>
                      <span className="w-32 text-right font-medium tabular">{moneda(x.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
            <Tarjeta className="overflow-hidden">
              <p className="border-b border-borde px-5 py-3 text-[0.9375rem] font-semibold">Fondos</p>
              {!d.fondos.length ? (
                <Vacio icono={<HandHeart />} titulo="Sin fondos" descripcion="Crea un fondo por donante o proyecto en la pestaña Fondos." />
              ) : (
                <ul className="divide-y divide-borde">
                  {d.fondos.map((f) => (
                    <li key={f.nombre} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 text-sm">
                      <span className="truncate">
                        {f.nombre} {f.restringido && <Lock className="inline size-3 text-texto-3" />}
                      </span>
                      <span className="text-right text-xs text-texto-3 tabular">+{moneda(f.recibido)}</span>
                      <span className="text-right text-xs text-texto-3 tabular">−{moneda(f.usado)}</span>
                      <span className="w-28 text-right font-medium tabular">{moneda(f.saldo)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>
          {Object.keys(d.valor_social.estudios).length > 0 && (
            <Tarjeta className="mt-4 p-5">
              <p className="mb-3 text-sm font-semibold">Estudios socioeconómicos del período</p>
              <div className="flex flex-wrap gap-2">
                {(["D", "C", "B", "A"] as Categoria[]).map((c) =>
                  d.valor_social.estudios[c] ? (
                    <Insignia key={c} tono={TONO_CATEGORIA[c]}>
                      {c} · {DESCRIPCION_CATEGORIA[c]}: {d.valor_social.estudios[c]}
                    </Insignia>
                  ) : null,
                )}
              </div>
            </Tarjeta>
          )}
        </>
      )}

      {imprimir && d && (
        <Documento abierto onCerrar={() => setImprimir(false)} titulo="Informe para donantes" nombreArchivo={`Informe ${sistema.nombre} ${r.texto}`}>
          <EncabezadoDocumento titulo="Informe de gestión para donantes" subtitulo={r.texto} />
          <p className="mb-3">
            En el período, {sistema.nombre} recibió <b>{moneda(d.donaciones.total)}</b> en {d.donaciones.cantidad} donaciones y atendió a{" "}
            <b>{d.beneficiarios.pacientes + d.beneficiarios.atenciones_jornadas} personas</b> ({d.beneficiarios.consultas} consultas en la sede y{" "}
            {d.beneficiarios.atenciones_jornadas} en {d.beneficiarios.jornadas} jornadas médicas). Otorgó <b>{moneda(valorSocial)}</b> en tarifa social y exoneró{" "}
            {d.valor_social.exonerados} turnos. {d.voluntarios.personas} profesionales voluntarios realizaron {d.voluntarios.consultas} consultas.
          </p>
          <p className="mt-4 mb-1 font-semibold">Uso de los fondos</p>
          <TablaDocumento
            encabezados={["Fondo", "Recibido", "Usado", "Saldo"]}
            filas={d.fondos.map((f) => [f.nombre + (f.restringido ? " (restringido)" : ""), moneda(f.recibido), moneda(f.usado), moneda(f.saldo)])}
          />
          <p className="mt-4 mb-1 font-semibold">Donantes</p>
          <TablaDocumento encabezados={["Donante", "Donaciones", "Monto"]} filas={d.por_donante.map((x) => [x.donante, String(x.n), moneda(x.total)])} />
        </Documento>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Fondos de donantes                                                        */
/* ------------------------------------------------------------------------ */

interface Fondo {
  id: string;
  nombre: string;
  donante: string | null;
  descripcion: string | null;
  restringido: boolean;
  meta: number | null;
  activo: boolean;
  recibido: number;
  usado: number;
  saldo: number;
  donaciones: number;
}

export function useFondos() {
  const { sistemaId } = useSistema();
  return useQuery({
    queryKey: ["fondos", sistemaId],
    queryFn: async () => ((datos(await supabase.rpc("fondos_resumen", { p_sistema: sistemaId })) ?? []) as unknown as Fondo[]).map((f) => ({ ...f, recibido: Number(f.recibido), usado: Number(f.usado), saldo: Number(f.saldo), meta: f.meta === null ? null : Number(f.meta) })),
  });
}

function Fondos() {
  const { roles } = useSistema();
  const q = useFondos();
  const [nuevo, setNuevo] = useState(false);
  const [usar, setUsar] = useState<Fondo | null>(null);
  const [ver, setVer] = useState<Fondo | null>(null);
  const edita = puedeEscribir.fondos(roles);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-xs text-texto-3">
          Cada fondo agrupa las donaciones de un donante o proyecto (se eligen al registrar la donación en Finanzas → Donaciones) y lo que se gastó de ellas. Un fondo
          restringido no deja usar más de su saldo. Las donaciones y los gastos ya tienen su asiento contable: aquí solo se controla el destino.
        </p>
        {edita && (
          <Boton className="ml-auto" icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>
            Nuevo fondo
          </Boton>
        )}
      </div>
      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Esqueleto key={i} className="h-36 rounded-2xl" />)}</div>
      ) : !q.data?.length ? (
        <Tarjeta>
          <Vacio icono={<HandCoins />} titulo="Sin fondos todavía" descripcion="Crea uno por donante o proyecto: «Medicamentos 2026 – Banco X», «Jornadas de verano»…" />
        </Tarjeta>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((f) => {
            const avance = f.meta ? Math.min(100, (f.recibido / f.meta) * 100) : null;
            return (
              <Tarjeta key={f.id} className={cn("p-5", !f.activo && "opacity-60")}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {f.nombre}
                      {f.restringido && (
                        <Insignia tono="aviso">
                          <Lock className="size-3" /> Restringido
                        </Insignia>
                      )}
                      {!f.activo && <Insignia tono="neutro">Cerrado</Insignia>}
                    </p>
                    <p className="truncate text-xs text-texto-3">{[f.donante, f.descripcion].filter(Boolean).join(" · ") || "Sin descripción"}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Recibido", f.recibido],
                    ["Usado", f.usado],
                    ["Disponible", f.saldo],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-superficie-2 px-2 py-2">
                      <p className="text-[0.6875rem] text-texto-3">{k}</p>
                      <p className={cn("text-sm font-semibold tabular", k === "Disponible" && "text-marca-texto")}>{moneda(v as number)}</p>
                    </div>
                  ))}
                </div>
                {avance !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[0.6875rem] text-texto-3">
                      <span>Meta {moneda(f.meta)}</span>
                      <span className="tabular">{Math.round(avance)} %</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie-2">
                      <motion.div className="h-full origin-left rounded-full bg-marca" initial={{ scaleX: 0 }} animate={{ scaleX: avance / 100 }} transition={{ type: "spring", duration: 0.6, bounce: 0 }} />
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {edita && f.activo && (
                    <Boton tamano="sm" icono={<HandCoins className="size-3.5" />} onClick={() => setUsar(f)}>
                      Registrar uso
                    </Boton>
                  )}
                  <Boton tamano="sm" variante="secundario" onClick={() => setVer(f)}>
                    Movimientos
                  </Boton>
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
      <NuevoFondo abierto={nuevo} onCerrar={() => setNuevo(false)} />
      <UsarFondo fondo={usar} onCerrar={() => setUsar(null)} />
      <MovimientosFondo fondo={ver} onCerrar={() => setVer(null)} editable={edita} />
    </>
  );
}

function NuevoFondo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const vacio = { nombre: "", donante: "", descripcion: "", meta: "", restringido: true };
  const [f, setF] = useState(vacio);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fondos").insert({
        sistema_id: sistemaId,
        nombre: f.nombre.trim(),
        donante: f.donante.trim() || null,
        descripcion: f.descripcion.trim() || null,
        meta: f.meta ? Number(f.meta) : null,
        restringido: f.restringido,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fondo creado");
      void qc.invalidateQueries({ queryKey: ["fondos", sistemaId] });
      setF(vacio);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nuevo fondo"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={f.nombre.trim().length < 2} onClick={() => m.mutate()}>
            Crear
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada etiqueta="Nombre" placeholder="Medicamentos 2026" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Entrada etiqueta="Donante o financiador (opcional)" value={f.donante} onChange={(e) => setF({ ...f, donante: e.target.value })} />
        <Entrada etiqueta="Meta (opcional, RD$)" type="number" min={0} value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} />
        <AreaTexto etiqueta="Para qué es (opcional)" className="min-h-14" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Restringido</p>
            <p className="text-xs text-texto-3">El donante fijó el uso: no se puede gastar más de lo recibido.</p>
          </div>
          <Interruptor activo={f.restringido} onChange={(v) => setF({ ...f, restringido: v })} />
        </div>
      </div>
    </Modal>
  );
}

function UsarFondo({ fondo, onCerrar }: { fondo: Fondo | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const vacio = { monto: "", concepto: "", fecha: isoDia(new Date()), comprobante: "" };
  const [f, setF] = useState(vacio);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("aplicar_fondo", {
        p_sistema: sistemaId,
        p_fondo: fondo!.id,
        p_monto: Number(f.monto),
        p_concepto: f.concepto.trim(),
        p_fecha: f.fecha,
        p_comprobante: f.comprobante.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Uso registrado");
      void qc.invalidateQueries({ queryKey: ["fondos", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["fondo-usos", sistemaId] });
      setF(vacio);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const excede = !!fondo?.restringido && Number(f.monto) > (fondo?.saldo ?? 0);
  return (
    <Modal
      abierto={!!fondo}
      onCerrar={onCerrar}
      titulo="Registrar uso del fondo"
      descripcion={fondo ? `${fondo.nombre} · disponible ${moneda(fondo.saldo)}` : ""}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!(Number(f.monto) > 0) || f.concepto.trim().length < 3 || excede} onClick={() => m.mutate()}>
            Registrar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Monto (RD$)" type="number" min={0} step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} error={excede ? "Pasa del saldo del fondo" : undefined} />
          <Entrada etiqueta="Fecha" type="date" max={isoDia(new Date())} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </div>
        <Entrada etiqueta="En qué se usó" placeholder="Compra de antibióticos para la farmacia" value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} />
        <Entrada etiqueta="Comprobante (opcional)" placeholder="Número del gasto o factura" value={f.comprobante} onChange={(e) => setF({ ...f, comprobante: e.target.value })} />
      </div>
    </Modal>
  );
}

interface Uso {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
  comprobante: string | null;
  revierte_a: string | null;
  creado_en: string;
}

function MovimientosFondo({ fondo, onCerrar, editable }: { fondo: Fondo | null; onCerrar: () => void; editable: boolean }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const usos = useQuery({
    queryKey: ["fondo-usos", sistemaId, fondo?.id],
    enabled: !!fondo,
    queryFn: async () => datos(await supabase.from("fondo_usos").select("id, fecha, concepto, monto, comprobante, revierte_a, creado_en").eq("sistema_id", sistemaId).eq("fondo_id", fondo!.id).order("creado_en", { ascending: false })) as unknown as Uso[],
  });
  const donaciones = useQuery({
    queryKey: ["fondo-donaciones", sistemaId, fondo?.id],
    enabled: !!fondo,
    queryFn: async () => datos(await supabase.from("donaciones").select("id, numero, donante_nombre, anonima, monto, fecha").eq("sistema_id", sistemaId).eq("fondo_id", fondo!.id).order("fecha", { ascending: false })) as unknown as { id: string; numero: string; donante_nombre: string; anonima: boolean; monto: number; fecha: string }[],
  });
  const revertidos = new Set((usos.data ?? []).map((u) => u.revierte_a).filter(Boolean));
  const revertir = useMutation({
    mutationFn: async (id: string) => {
      const motivo = window.prompt("¿Por qué se revierte este uso?");
      if (!motivo) throw new Error("cancelado");
      const { error } = await supabase.rpc("revertir_uso_fondo", { p_uso: id, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Uso revertido");
      void qc.invalidateQueries({ queryKey: ["fondo-usos", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["fondos", sistemaId] });
    },
    onError: (e) => (e as Error).message !== "cancelado" && toast.error(mensajeError(e)),
  });
  return (
    <Modal abierto={!!fondo} onCerrar={onCerrar} ancho="lg" titulo={fondo?.nombre ?? ""} descripcion={fondo ? `Disponible ${moneda(fondo.saldo)}` : ""}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold">Donaciones</p>
          {!donaciones.data?.length ? (
            <p className="text-xs text-texto-3">Ninguna todavía.</p>
          ) : (
            <ul className="divide-y divide-borde rounded-xl border border-borde">
              {donaciones.data.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-24 text-xs text-texto-3 tabular">{fecha(d.fecha)}</span>
                  <span className="min-w-0 flex-1 truncate">{d.anonima ? "Anónimo" : d.donante_nombre}</span>
                  <span className="font-mono text-xs text-texto-3">{d.numero}</span>
                  <span className="w-28 text-right font-medium text-exito tabular">+{moneda(d.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Usos</p>
          {!usos.data?.length ? (
            <p className="text-xs text-texto-3">Ninguno todavía.</p>
          ) : (
            <ul className="divide-y divide-borde rounded-xl border border-borde">
              {usos.data.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-24 text-xs text-texto-3 tabular">{fecha(u.fecha)}</span>
                  <span className={cn("min-w-0 flex-1 truncate", revertidos.has(u.id) && "text-texto-3 line-through")}>
                    {u.concepto}
                    {u.comprobante && <span className="text-texto-3"> · {u.comprobante}</span>}
                  </span>
                  <span className={cn("w-28 text-right font-medium tabular", Number(u.monto) < 0 ? "text-exito" : "text-texto")}>{moneda(-Number(u.monto))}</span>
                  {editable && Number(u.monto) > 0 && !revertidos.has(u.id) && (
                    <button type="button" title="Revertir" aria-label={`Revertir ${u.concepto}`} onClick={() => revertir.mutate(u.id)} className="text-texto-3 hover:text-peligro">
                      <RotateCcw className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Tarifa social                                                             */
/* ------------------------------------------------------------------------ */

interface Estudio {
  id: string;
  numero: string;
  categoria: Categoria;
  categoria_sugerida: Categoria;
  descuento_pct: number;
  ingreso_per_capita: number;
  vigente_hasta: string;
  creado_en: string;
  paciente_id: string;
  paciente: { nombres: string; apellidos: string; expediente: string } | null;
}

function TarifaSocialVista() {
  const { sistemaId, roles } = useSistema();
  const { tarifaSocial } = useSesion();
  const t = tarifaSocial ?? TARIFA_SOCIAL_DEFECTO;
  const [editar, setEditar] = useState(false);
  const q = useQuery({
    queryKey: ["estudios", sistemaId],
    queryFn: async () =>
      datos(
        await supabase
          .from("estudios_socioeconomicos")
          .select("id, numero, categoria, categoria_sugerida, descuento_pct, ingreso_per_capita, vigente_hasta, creado_en, paciente_id, paciente:pacientes!estudios_socioeconomicos_sistema_id_paciente_id_fkey(nombres, apellidos, expediente)")
          .eq("sistema_id", sistemaId)
          .order("creado_en", { ascending: false })
          .limit(100),
      ) as unknown as Estudio[],
  });
  const hoy = isoDia(new Date());
  const tramos: { c: Categoria; texto: string }[] = [
    { c: "D", texto: `menos de ${moneda(t.umbrales[0])}` },
    { c: "C", texto: `${moneda(t.umbrales[0])} a ${moneda(t.umbrales[1])}` },
    { c: "B", texto: `${moneda(t.umbrales[1])} a ${moneda(t.umbrales[2])}` },
    { c: "A", texto: `${moneda(t.umbrales[2])} o más` },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Tarjeta className="h-fit p-5">
        <div className="mb-3 flex items-center gap-2">
          <p className="flex-1 text-sm font-semibold">Tabla de la tarifa social</p>
          {roles.includes("admin") && (
            <Boton tamano="sm" variante="secundario" onClick={() => setEditar(true)}>
              Ajustar
            </Boton>
          )}
        </div>
        <p className="mb-3 text-xs text-texto-3">Ingreso del hogar ÷ personas que viven de él. Vigencia: {t.vigencia_meses} meses.</p>
        <ul className="space-y-2">
          {tramos.map(({ c, texto }) => (
            <li key={c} className="flex items-center gap-3 rounded-xl bg-superficie-2/60 px-3 py-2 text-sm">
              <Insignia tono={TONO_CATEGORIA[c]}>{c}</Insignia>
              <span className="min-w-0 flex-1 text-xs text-texto-2">{texto} por persona</span>
              <b className="tabular">{t.descuentos[c]} %</b>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-texto-3">El estudio se hace desde el expediente del paciente; en Caja aparece el botón para aplicar el descuento.</p>
      </Tarjeta>
      <Tarjeta className="overflow-hidden">
        <p className="border-b border-borde px-5 py-3 text-[0.9375rem] font-semibold">Estudios recientes</p>
        {q.isLoading ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10" />)}</div>
        ) : !q.data?.length ? (
          <Vacio icono={<HandHeart />} titulo="Sin estudios todavía" descripcion="Abre el expediente de un paciente y pulsa «Estudio socioeconómico»." />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <Insignia tono={TONO_CATEGORIA[e.categoria]}>
                  {e.categoria} · {Number(e.descuento_pct)} %
                </Insignia>
                <Link to={`/pacientes/${e.paciente_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {e.paciente ? `${e.paciente.nombres} ${e.paciente.apellidos}` : "Paciente"}
                </Link>
                {e.categoria !== e.categoria_sugerida && <Insignia tono="violeta">Ajustada (era {e.categoria_sugerida})</Insignia>}
                <span className="text-xs text-texto-3 tabular">{moneda(e.ingreso_per_capita)}/persona</span>
                <span className={cn("text-xs tabular", e.vigente_hasta < hoy ? "text-peligro" : "text-texto-3")}>
                  {e.vigente_hasta < hoy ? "Vencido" : `Hasta ${fecha(e.vigente_hasta)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <AjustarTarifa abierto={editar} onCerrar={() => setEditar(false)} actual={t} />
    </div>
  );
}

function AjustarTarifa({ abierto, onCerrar, actual }: { abierto: boolean; onCerrar: () => void; actual: TarifaSocial }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [u, setU] = useState(actual.umbrales.map(String));
  const [d, setD] = useState<Record<Categoria, string>>({ A: String(actual.descuentos.A), B: String(actual.descuentos.B), C: String(actual.descuentos.C), D: String(actual.descuentos.D) });
  const [vig, setVig] = useState(String(actual.vigencia_meses));
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("guardar_tarifa_social", {
        p_sistema: sistemaId,
        p_config: { umbrales: u.map(Number), descuentos: { A: Number(d.A), B: Number(d.B), C: Number(d.C), D: Number(d.D) }, vigencia_meses: Number(vig) },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarifa social actualizada (aplica a los estudios nuevos)");
      void qc.invalidateQueries({ queryKey: ["naturaleza", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Ajustar la tarifa social"
      descripcion="Los estudios ya hechos conservan su categoría hasta vencer."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[0.8125rem] font-medium text-texto-2">Ingreso por persona (RD$/mes) que separa las categorías</p>
        <div className="grid grid-cols-3 gap-3">
          {["D | C", "C | B", "B | A"].map((etq, i) => (
            <Entrada key={etq} etiqueta={etq} type="number" min={1} value={u[i]} onChange={(e) => setU((x) => x.map((v, j) => (j === i ? e.target.value : v)))} />
          ))}
        </div>
        <p className="text-[0.8125rem] font-medium text-texto-2">Descuento por categoría (%)</p>
        <div className="grid grid-cols-4 gap-3">
          {(["A", "B", "C", "D"] as Categoria[]).map((c) => (
            <Entrada key={c} etiqueta={c} type="number" min={0} max={100} value={d[c]} onChange={(e) => setD((x) => ({ ...x, [c]: e.target.value }))} />
          ))}
        </div>
        <Selector etiqueta="Vigencia del estudio" value={vig} onChange={(e) => setVig(e.target.value)}>
          {[3, 6, 12, 18, 24].map((m) => (
            <option key={m} value={m}>
              {m} meses
            </option>
          ))}
        </Selector>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Jornadas médicas                                                          */
/* ------------------------------------------------------------------------ */

interface Jornada {
  id: string;
  nombre: string;
  fecha: string;
  lugar: string | null;
  descripcion: string | null;
  estado: "abierta" | "cerrada";
  fondo_id: string | null;
}

interface ResumenJornada {
  atenciones: number;
  mujeres: number;
  hombres: number;
  menores: number;
  mayores: number;
  con_ficha: number;
  profesionales: number;
  diagnosticos: { diagnostico: string; n: number }[];
  servicios: { servicio: string; n: number }[];
}

function Jornadas() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [atender, setAtender] = useState(false);
  const q = useQuery({
    queryKey: ["jornadas", sistemaId],
    queryFn: async () => datos(await supabase.from("jornadas").select("id, nombre, fecha, lugar, descripcion, estado, fondo_id").eq("sistema_id", sistemaId).order("fecha", { ascending: false })) as unknown as Jornada[],
  });
  const actual = q.data?.find((j) => j.id === sel) ?? q.data?.[0] ?? null;
  const resumen = useQuery({
    queryKey: ["jornada-resumen", sistemaId, actual?.id],
    enabled: !!actual,
    queryFn: async () => datos(await supabase.rpc("resumen_jornada", { p_jornada: actual!.id })) as unknown as ResumenJornada,
  });
  const atenciones = useQuery({
    queryKey: ["jornada-atenciones", sistemaId, actual?.id],
    enabled: !!actual && puedeEscribir.verHistorial(roles),
    queryFn: async () =>
      datos(await supabase.from("jornada_atenciones").select("id, nombre, documento, sexo, edad, diagnostico, servicio, paciente_id, creado_en").eq("jornada_id", actual!.id).order("creado_en", { ascending: false })) as unknown as {
        id: string;
        nombre: string;
        documento: string | null;
        sexo: string | null;
        edad: number | null;
        diagnostico: string | null;
        servicio: string | null;
        paciente_id: string | null;
        creado_en: string;
      }[],
  });
  const cerrar = useMutation({
    mutationFn: async (j: Jornada) => {
      const { error } = await supabase.from("jornadas").update({ estado: j.estado === "abierta" ? "cerrada" : "abierta" }).eq("id", j.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["jornadas", sistemaId] }),
    onError: (e) => toast.error(mensajeError(e)),
  });
  const r = resumen.data;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-2">
          {puedeEscribir.jornadas(roles) && (
            <Boton className="w-full" icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>
              Nueva jornada
            </Boton>
          )}
          {q.isLoading ? (
            <Esqueleto className="h-24 rounded-2xl" />
          ) : !q.data?.length ? (
            <Tarjeta>
              <Vacio icono={<CalendarHeart />} titulo="Sin jornadas" descripcion="Operativos médicos fuera de la sede: se registra a cada persona atendida, sin cobro." />
            </Tarjeta>
          ) : (
            q.data.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => setSel(j.id)}
                className={cn("w-full rounded-2xl border px-4 py-3 text-left transition-colors", actual?.id === j.id ? "border-marca bg-marca-suave" : "border-borde bg-superficie hover:border-borde-fuerte")}
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="min-w-0 flex-1 truncate">{j.nombre}</span>
                  <Insignia tono={j.estado === "abierta" ? "exito" : "neutro"}>{j.estado === "abierta" ? "Abierta" : "Cerrada"}</Insignia>
                </p>
                <p className="truncate text-xs text-texto-3">
                  {fecha(j.fecha)}
                  {j.lugar ? ` · ${j.lugar}` : ""}
                </p>
              </button>
            ))
          )}
        </div>

        {actual && (
          <div className="space-y-4">
            <Tarjeta className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-semibold">{actual.nombre}</p>
                  <p className="text-xs text-texto-3">
                    {fecha(actual.fecha)}
                    {actual.lugar ? ` · ${actual.lugar}` : ""}
                    {actual.descripcion ? ` · ${actual.descripcion}` : ""}
                  </p>
                </div>
                {puedeEscribir.atenderJornada(roles) && actual.estado === "abierta" && (
                  <Boton icono={<Plus className="size-4" />} onClick={() => setAtender(true)}>
                    Registrar atención
                  </Boton>
                )}
                {puedeEscribir.jornadas(roles) && (
                  <Boton variante="secundario" cargando={cerrar.isPending} onClick={() => cerrar.mutate(actual)}>
                    {actual.estado === "abierta" ? "Cerrar jornada" : "Reabrir"}
                  </Boton>
                )}
              </div>
              {r && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Atenciones", r.atenciones],
                    ["Mujeres / hombres", `${r.mujeres} / ${r.hombres}`],
                    ["Menores · mayores de 65", `${r.menores} · ${r.mayores}`],
                    ["Profesionales", r.profesionales],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-superficie-2 px-3 py-2">
                      <p className="text-[0.6875rem] text-texto-3">{k}</p>
                      <p className="text-sm font-semibold tabular">{v}</p>
                    </div>
                  ))}
                </div>
              )}
              {r && r.diagnosticos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {r.diagnosticos.map((x) => (
                    <Insignia key={x.diagnostico} tono="info">
                      {x.diagnostico} · {x.n}
                    </Insignia>
                  ))}
                </div>
              )}
            </Tarjeta>
            {puedeEscribir.verHistorial(roles) && (
              <Tarjeta className="overflow-hidden">
                <p className="border-b border-borde px-5 py-3 text-sm font-semibold">Personas atendidas</p>
                {!atenciones.data?.length ? (
                  <Vacio icono={<Users />} titulo="Nadie registrado todavía" />
                ) : (
                  <ul className="divide-y divide-borde">
                    {atenciones.data.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {a.paciente_id ? (
                            <Link to={`/pacientes/${a.paciente_id}`} className="hover:underline">
                              {a.nombre}
                            </Link>
                          ) : (
                            a.nombre
                          )}
                          <span className="font-normal text-texto-3">
                            {" "}
                            · {[a.sexo, a.edad !== null ? `${a.edad} años` : null, a.documento].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {a.diagnostico && <span className="max-w-60 truncate text-xs text-texto-2">{a.diagnostico}</span>}
                        <span className="text-xs text-texto-3" title={fechaHora(a.creado_en)}>
                          {relativo(a.creado_en)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            )}
          </div>
        )}
      </div>
      <NuevaJornada abierto={nueva} onCerrar={() => setNueva(false)} onCreada={setSel} />
      {actual && <RegistrarAtencion abierto={atender} onCerrar={() => setAtender(false)} jornada={actual} />}
    </>
  );
}

function NuevaJornada({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: (id: string) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const fondos = useFondos();
  const vacio = { nombre: "", fecha: isoDia(new Date()), lugar: "", descripcion: "", fondo: "" };
  const [f, setF] = useState(vacio);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("jornadas")
        .insert({ sistema_id: sistemaId, nombre: f.nombre.trim(), fecha: f.fecha, lugar: f.lugar.trim() || null, descripcion: f.descripcion.trim() || null, fondo_id: f.fondo || null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Jornada creada");
      void qc.invalidateQueries({ queryKey: ["jornadas", sistemaId] });
      onCreada(id);
      setF(vacio);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva jornada médica"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={f.nombre.trim().length < 3 || !f.fecha} onClick={() => m.mutate()}>
            Crear
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada etiqueta="Nombre" placeholder="Jornada de salud Villa Mella" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Fecha" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          <Entrada etiqueta="Lugar" placeholder="Escuela, iglesia, club…" value={f.lugar} onChange={(e) => setF({ ...f, lugar: e.target.value })} />
        </div>
        <Selector etiqueta="Fondo que la financia (opcional)" value={f.fondo} onChange={(e) => setF({ ...f, fondo: e.target.value })}>
          <option value="">—</option>
          {fondos.data?.filter((x) => x.activo).map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </Selector>
        <AreaTexto etiqueta="Descripción (opcional)" className="min-h-14" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
      </div>
    </Modal>
  );
}

function RegistrarAtencion({ abierto, onCerrar, jornada }: { abierto: boolean; onCerrar: () => void; jornada: Jornada }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const vacio = { nombre: "", documento: "", sexo: "", edad: "", motivo: "", diagnostico: "", servicio: "", medicamentos: "" };
  const [f, setF] = useState(vacio);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("registrar_atencion_jornada", {
        p_jornada: jornada.id,
        p_nombre: f.nombre.trim(),
        p_documento: f.documento.trim() || undefined,
        p_sexo: f.sexo || undefined,
        p_edad: f.edad ? Number(f.edad) : undefined,
        p_motivo: f.motivo.trim() || undefined,
        p_diagnostico: f.diagnostico.trim() || undefined,
        p_servicio: f.servicio.trim() || undefined,
        p_medicamentos: f.medicamentos.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atención registrada");
      void qc.invalidateQueries({ queryKey: ["jornada-resumen", sistemaId, jornada.id] });
      void qc.invalidateQueries({ queryKey: ["jornada-atenciones", sistemaId, jornada.id] });
      // Mantiene servicio para la siguiente persona (en una jornada suele repetirse).
      setF({ ...vacio, servicio: f.servicio });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Registrar atención"
      descripcion={`${jornada.nombre}. Si la cédula ya tiene ficha, se enlaza; no se crean pacientes nuevos.`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Terminar
          </Boton>
          <Boton cargando={m.isPending} disabled={f.nombre.trim().length < 2} onClick={() => m.mutate()}>
            Guardar y seguir
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Entrada etiqueta="Nombre" contenedor="sm:col-span-2" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <Entrada etiqueta="Cédula (opcional)" contenedor="sm:col-span-2" placeholder="000-0000000-0" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
          <Selector etiqueta="Sexo" value={f.sexo} onChange={(e) => setF({ ...f, sexo: e.target.value })}>
            <option value="">—</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="X">Otro</option>
          </Selector>
          <Entrada etiqueta="Edad" type="number" min={0} max={120} value={f.edad} onChange={(e) => setF({ ...f, edad: e.target.value })} />
          <Entrada etiqueta="Servicio" contenedor="sm:col-span-2" placeholder="Medicina general, odontología…" value={f.servicio} onChange={(e) => setF({ ...f, servicio: e.target.value })} />
        </div>
        <Entrada etiqueta="Motivo" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        <SelectorCie10 valor={f.diagnostico} onChange={(v) => setF({ ...f, diagnostico: v })} />
        <AreaTexto etiqueta="Medicamentos entregados" className="min-h-14" value={f.medicamentos} onChange={(e) => setF({ ...f, medicamentos: e.target.value })} />
      </div>
    </Modal>
  );
}
