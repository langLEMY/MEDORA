import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, ClipboardList, FlaskConical, MoreHorizontal, Plus, Printer, RotateCcw, Scan, Stethoscope, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SelectorCie10 } from "@/components/SelectorCie10";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado } from "@/components/ui/campos";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { Esqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, fechaHora, relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { useConsultaActiva } from "./Checkout";
import { DocumentoClinico } from "./DocumentoClinico";

export type TipoOrden = "laboratorio" | "imagen" | "procedimiento" | "otro";
export type EstadoItem = "pendiente" | "entregada" | "cancelada";

export interface ItemOrden {
  id: string;
  posicion: number;
  descripcion: string;
  estado: EstadoItem;
  actualizado_en: string | null;
}

export interface OrdenMedica {
  id: string;
  numero: string;
  tipo: TipoOrden;
  proveedor: string | null;
  diagnostico: string | null;
  indicaciones: string | null;
  cita_id: string | null;
  creado_en: string;
  medico: { nombre_completo: string } | null;
  items: ItemOrden[];
}

export const TIPO_ORDEN: Record<TipoOrden, { etiqueta: string; icono: typeof FlaskConical }> = {
  laboratorio: { etiqueta: "Laboratorio", icono: FlaskConical },
  imagen: { etiqueta: "Imágenes", icono: Scan },
  procedimiento: { etiqueta: "Procedimiento", icono: Stethoscope },
  otro: { etiqueta: "Otro", icono: ClipboardList },
};

export const ESTADO_ITEM: Record<EstadoItem, { etiqueta: string; tono: Tono }> = {
  pendiente: { etiqueta: "Pendiente de entrega", tono: "aviso" },
  entregada: { etiqueta: "Entregada", tono: "exito" },
  cancelada: { etiqueta: "Cancelada", tono: "neutro" },
};

// Sugerencias rápidas cuando el hospital no tiene catálogo propio de laboratorio.
const FRECUENTES: Record<TipoOrden, string[]> = {
  laboratorio: [
    "Hemograma", "Glicemia en ayunas", "Hemoglobina glicosilada (HbA1c)", "Urea en sangre", "Creatinina", "Perfil lipídico",
    "TGO", "TGP", "Ácido úrico", "Examen de orina", "Coprológico", "TSH", "T3", "T4 libre", "PSA", "Prueba de embarazo (β-hCG)",
    "VDRL", "HIV", "Tipificación", "Electrolitos",
  ],
  imagen: [
    "Rayos X de tórax", "Sonografía abdominal", "Sonografía pélvica", "Sonografía obstétrica", "Mamografía", "Ecocardiograma",
    "Electrocardiograma", "Tomografía", "Resonancia magnética", "Densitometría ósea",
  ],
  procedimiento: ["Curación", "Sutura", "Retiro de puntos", "Nebulización", "Inyección", "Lavado de oído", "Biopsia"],
  otro: [],
};

const SELECT_ORDEN =
  "id, numero, tipo, proveedor, diagnostico, indicaciones, cita_id, creado_en, medico:perfiles!ordenes_medicas_medico_id_fkey(nombre_completo), items:orden_items!orden_items_sistema_id_orden_id_fkey(id, posicion, descripcion, estado, actualizado_en)";

export function useOrdenesPaciente(pacienteId: string, habilitado = true) {
  const { sistemaId } = useSistema();
  return useQuery({
    queryKey: ["ordenes-medicas", sistemaId, pacienteId],
    enabled: habilitado,
    queryFn: async () => {
      const filas = datos(
        await supabase.from("ordenes_medicas").select(SELECT_ORDEN).eq("sistema_id", sistemaId).eq("paciente_id", pacienteId).order("creado_en", { ascending: false }),
      ) as unknown as OrdenMedica[];
      return filas.map((o) => ({ ...o, items: [...(o.items ?? [])].sort((a, b) => a.posicion - b.posicion) }));
    },
  });
}

/** Cambia el estado de una prueba (marcar_item_orden). */
function useMarcarItem(pacienteId: string) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoItem }) => {
      const { error } = await supabase.rpc("marcar_item_orden", { p_item: id, p_estado: estado });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      toast.success(`Marcada como ${ESTADO_ITEM[v.estado].etiqueta.toLowerCase()}`);
      void qc.invalidateQueries({ queryKey: ["ordenes-medicas", sistemaId, pacienteId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
}

/** Las pruebas de una orden con su estado (también se usa dentro de la línea de tiempo). */
export function ItemsOrden({ orden, pacienteId, compacto }: { orden: OrdenMedica; pacienteId: string; compacto?: boolean }) {
  const { roles } = useSistema();
  const marcar = useMarcarItem(pacienteId);
  const editable = puedeEscribir.estadoOrden(roles);
  return (
    <ul className={cn("divide-y divide-borde overflow-hidden rounded-xl border border-borde", compacto && "mt-3")}>
      {orden.items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold",
              it.estado === "entregada" ? "bg-[color-mix(in_oklab,var(--exito)_14%,var(--superficie))] text-exito" : it.estado === "cancelada" ? "bg-superficie-2 text-texto-3" : "bg-[color-mix(in_oklab,var(--aviso)_14%,var(--superficie))] text-aviso",
            )}
          >
            {it.estado === "entregada" ? <Check className="size-3.5" /> : it.estado === "cancelada" ? <X className="size-3.5" /> : it.posicion}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-medium", it.estado === "cancelada" && "text-texto-3 line-through")}>{it.descripcion}</p>
            <p className="text-xs text-texto-3">
              {ESTADO_ITEM[it.estado].etiqueta}
              {it.actualizado_en && it.estado !== "pendiente" ? ` · ${relativo(it.actualizado_en)}` : ""}
            </p>
          </div>
          {editable && (
            <Menu
              alinear="derecha"
              ancho={210}
              disparador={() => (
                <button type="button" aria-label={`Cambiar estado de ${it.descripcion}`} className="grid size-8 place-items-center rounded-lg text-texto-3 transition-colors hover:bg-superficie-2 hover:text-texto">
                  <MoreHorizontal className="size-4" />
                </button>
              )}
            >
              {(cerrar) => (
                <>
                  {it.estado !== "entregada" && (
                    <ItemMenu icono={<Check className="size-4" />} onClick={() => (cerrar(), marcar.mutate({ id: it.id, estado: "entregada" }))}>
                      Marcar entregada
                    </ItemMenu>
                  )}
                  {it.estado !== "pendiente" && (
                    <ItemMenu icono={<RotateCcw className="size-4" />} onClick={() => (cerrar(), marcar.mutate({ id: it.id, estado: "pendiente" }))}>
                      Volver a pendiente
                    </ItemMenu>
                  )}
                  {it.estado !== "cancelada" && (
                    <ItemMenu peligro icono={<Ban className="size-4" />} onClick={() => (cerrar(), marcar.mutate({ id: it.id, estado: "cancelada" }))}>
                      Cancelar prueba
                    </ItemMenu>
                  )}
                </>
              )}
            </Menu>
          )}
        </li>
      ))}
    </ul>
  );
}

function resumenEstado(o: OrdenMedica) {
  const activas = o.items.filter((i) => i.estado !== "cancelada");
  const entregadas = activas.filter((i) => i.estado === "entregada").length;
  if (!activas.length) return { texto: "Cancelada", tono: "neutro" as Tono };
  if (entregadas === activas.length) return { texto: "Completa", tono: "exito" as Tono };
  if (entregadas) return { texto: `${entregadas} de ${activas.length} entregadas`, tono: "info" as Tono };
  return { texto: "Pendiente", tono: "aviso" as Tono };
}

/** Pestaña "Órdenes": todas las órdenes del paciente con el estado de cada prueba. */
export function OrdenesMedicas({ pacienteId, pacienteNombre, documento }: { pacienteId: string; pacienteNombre: string; documento?: string | null }) {
  const { roles } = useSistema();
  const q = useOrdenesPaciente(pacienteId);
  const [nueva, setNueva] = useState<TipoOrden | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "pendientes">("todas");
  const [imprimir, setImprimir] = useState<OrdenMedica | null>(null);

  const ordenes = (q.data ?? []).filter((o) => filtro === "todas" || o.items.some((i) => i.estado === "pendiente"));
  const pendientes = (q.data ?? []).reduce((s, o) => s + o.items.filter((i) => i.estado === "pendiente").length, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmentado
          id="filtro-ordenes"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todas", etiqueta: "Todas" },
            { valor: "pendientes", etiqueta: pendientes ? `Pendientes (${pendientes})` : "Pendientes" },
          ]}
        />
        {puedeEscribir.ordenar(roles) && (
          <Menu
            alinear="derecha"
            className="ml-auto"
            disparador={() => <Boton icono={<Plus className="size-4" />}>Nueva orden</Boton>}
          >
            {(cerrar) =>
              (Object.keys(TIPO_ORDEN) as TipoOrden[]).map((t) => {
                const I = TIPO_ORDEN[t].icono;
                return (
                  <ItemMenu key={t} icono={<I className="size-4" />} onClick={() => (cerrar(), setNueva(t))}>
                    {TIPO_ORDEN[t].etiqueta}
                  </ItemMenu>
                );
              })
            }
          </Menu>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Esqueleto key={i} className="h-36 rounded-2xl" />)}</div>
      ) : ordenes.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={<ClipboardList />}
            titulo={filtro === "pendientes" ? "Nada pendiente de entrega" : "Sin órdenes médicas"}
            descripcion="Las indicaciones de laboratorio, imágenes y procedimientos aparecen aquí con el estado de cada prueba."
          />
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {ordenes.map((o) => {
              const I = TIPO_ORDEN[o.tipo].icono;
              const r = resumenEstado(o);
              return (
                <motion.div key={o.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
                  <Tarjeta className="p-5">
                    <div className="mb-3 flex flex-wrap items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca-texto">
                        <I className="size-[1.125rem]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {TIPO_ORDEN[o.tipo].etiqueta}
                          <span className="font-mono text-xs font-medium text-texto-3">{o.numero}</span>
                          <Insignia tono={r.tono}>{r.texto}</Insignia>
                        </p>
                        <p className="text-xs text-texto-3" title={fechaHora(o.creado_en)}>
                          {o.medico?.nombre_completo} · {fecha(o.creado_en)}
                          {o.proveedor && <> · Proveedor: {o.proveedor}</>}
                        </p>
                        {o.diagnostico && <p className="mt-1 text-xs text-texto-2">Diagnóstico: {o.diagnostico}</p>}
                      </div>
                      <Boton variante="fantasma" tamano="sm" icono={<Printer className="size-3.5" />} onClick={() => setImprimir(o)}>
                        Imprimir
                      </Boton>
                    </div>
                    <ItemsOrden orden={o} pacienteId={pacienteId} />
                    {o.indicaciones && <p className="mt-3 text-sm whitespace-pre-wrap text-texto-2">{o.indicaciones}</p>}
                  </Tarjeta>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <NuevaOrden tipo={nueva} pacienteId={pacienteId} onCerrar={() => setNueva(null)} />
      {imprimir && (
        <DocumentoClinico
          abierto
          onCerrar={() => setImprimir(null)}
          tipo="orden"
          titulo={`Orden de ${TIPO_ORDEN[imprimir.tipo].etiqueta.toLowerCase()}`}
          contenido={imprimir.indicaciones ?? ""}
          items={imprimir.items.filter((i) => i.estado !== "cancelada").map((i) => ({ nombre: i.descripcion }))}
          medico={imprimir.medico ? { nombre: imprimir.medico.nombre_completo } : null}
          paciente={pacienteNombre}
          documentoPaciente={documento}
          fechaEntrada={imprimir.creado_en}
          datos={{ numero: imprimir.numero, proveedor: imprimir.proveedor, diagnostico: imprimir.diagnostico }}
        />
      )}
    </>
  );
}

/** Formulario de una orden nueva: tipo, pruebas (con sugerencias), proveedor y diagnóstico. */
export function NuevaOrden({ tipo, pacienteId, onCerrar }: { tipo: TipoOrden | null; pacienteId: string; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const consulta = useConsultaActiva(pacienteId);
  const [tipoSel, setTipoSel] = useState<TipoOrden>("laboratorio");
  const [items, setItems] = useState<string[]>([]);
  const [escrito, setEscrito] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [abiertoCon, setAbiertoCon] = useState<TipoOrden | null>(null);

  // Al abrir con un tipo nuevo, empezar limpio.
  if (tipo && tipo !== abiertoCon) {
    setAbiertoCon(tipo);
    setTipoSel(tipo);
    setItems([]);
    setEscrito("");
    setProveedor("");
    setDiagnostico("");
    setIndicaciones("");
  }
  if (!tipo && abiertoCon) setAbiertoCon(null);

  // Catálogo del laboratorio interno (si el hospital lo tiene); si no, las frecuentes.
  const catalogo = useQuery({
    queryKey: ["laboratorio-pruebas", sistemaId],
    enabled: !!tipo && tipoSel === "laboratorio",
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("laboratorio_pruebas").select("nombre").eq("sistema_id", sistemaId).eq("activo", true).order("nombre").limit(300);
      return (data ?? []).map((p) => p.nombre as string);
    },
  });
  const sugerencias = useMemo(() => {
    const base = tipoSel === "laboratorio" && catalogo.data?.length ? catalogo.data : FRECUENTES[tipoSel];
    const f = escrito.trim().toLowerCase();
    return base.filter((s) => !items.includes(s) && (!f || s.toLowerCase().includes(f))).slice(0, 24);
  }, [tipoSel, catalogo.data, escrito, items]);

  const agregar = (s: string) => {
    const v = s.trim().slice(0, 200);
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase())) setItems((a) => [...a, v]);
    setEscrito("");
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const todos = escrito.trim() ? [...items, escrito.trim()] : items;
      const { data, error } = await supabase.rpc("crear_orden_medica", {
        p_sistema: sistemaId,
        p_paciente: pacienteId,
        p_tipo: tipoSel,
        p_items: todos,
        p_proveedor: proveedor.trim() || undefined,
        p_diagnostico: diagnostico.trim() || undefined,
        p_indicaciones: indicaciones.trim() || undefined,
        p_cita: consulta.data?.id ?? undefined,
      });
      if (error) throw error;
      return data as { numero: string };
    },
    onSuccess: (r) => {
      toast.success(`Orden ${r.numero} emitida`);
      void qc.invalidateQueries({ queryKey: ["ordenes-medicas", sistemaId, pacienteId] });
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, pacienteId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const total = items.length + (escrito.trim() ? 1 : 0);

  return (
    <Modal
      abierto={!!tipo}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Nueva orden médica"
      descripcion={consulta.data ? "Quedará ligada a la consulta en curso." : "Quedará firmada con tu nombre y en la historia clínica."}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={total === 0} onClick={() => guardar.mutate()}>
            Emitir orden{total ? ` (${total})` : ""}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          id="tipo-orden"
          valor={tipoSel}
          onChange={(t) => {
            setTipoSel(t);
            setEscrito("");
          }}
          opciones={(Object.keys(TIPO_ORDEN) as TipoOrden[]).map((t) => ({ valor: t, etiqueta: TIPO_ORDEN[t].etiqueta }))}
        />

        <div>
          <Entrada
            etiqueta={tipoSel === "laboratorio" ? "Pruebas" : tipoSel === "imagen" ? "Estudios" : "Indicaciones"}
            placeholder="Escribe y pulsa Enter, o elige abajo"
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar(escrito);
              }
            }}
          />
          {items.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {items.map((i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-marca-suave py-1 pr-1 pl-2.5 text-xs font-medium text-marca-texto">
                  {i}
                  <button type="button" aria-label={`Quitar ${i}`} onClick={() => setItems((a) => a.filter((x) => x !== i))} className="grid size-5 place-items-center rounded hover:bg-marca/15">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {sugerencias.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[0.6875rem] font-medium text-texto-3">
                {tipoSel === "laboratorio" && catalogo.data?.length ? "Del catálogo del laboratorio" : "Frecuentes"}
              </p>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => agregar(s)}
                    className="inline-flex items-center gap-1 rounded-lg border border-borde bg-superficie px-2.5 py-1 text-xs transition-colors hover:border-marca hover:text-marca-texto"
                  >
                    <Plus className="size-3" /> {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Proveedor (opcional)" placeholder="Laboratorio o centro de imágenes" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          <SelectorCie10 etiqueta="Diagnóstico CIE-10 (lo pide la ARS)" valor={diagnostico} onChange={setDiagnostico} />
        </div>
        <AreaTexto etiqueta="Indicaciones (opcional)" className="min-h-16" placeholder="Ayuno de 8 horas, traer estudios previos…" value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} />
      </div>
    </Modal>
  );
}
