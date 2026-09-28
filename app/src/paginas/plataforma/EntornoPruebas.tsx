import { useMutation, useQuery } from "@tanstack/react-query";
import { Eraser, FlaskConical, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { invocar, mensajeError, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Entorno de pruebas (superadmin):
 * - LimpiarOperaciones: borra cobros/turnos/citas/historial de prueba de un
 *   sistema, con vista previa de conteos y confirmación por nombre. Postgres
 *   (plataforma_limpiar_operaciones) vuelve a validar todo.
 * - CrearPruebas / ReiniciarPruebas: sistema "· Pruebas" con la configuración
 *   de un sistema real y sin datos de pacientes ni dinero.
 */

type Alcance = "caja" | "citas" | "historial";

const ALCANCES: { clave: Alcance; titulo: string; detalle: string }[] = [
  { clave: "caja", titulo: "Caja", detalle: "Cobros, pagos, anulaciones, anticipos, abonos, movimientos y turnos de caja, comisiones y sus asientos contables." },
  { clave: "citas", titulo: "Citas y turnos de pacientes", detalle: "Toda la agenda y la cola de turnos (incluye los del quiosco)." },
  { clave: "historial", titulo: "Historial clínico", detalle: "Todas las notas clínicas del sistema." },
];

const ETIQUETAS: Record<string, string> = {
  cobros: "Cobros",
  anticipos: "Anticipos",
  abonos: "Abonos",
  movimientos_caja: "Movimientos de caja",
  turnos_caja: "Turnos de caja",
  comisiones: "Comisiones",
  liquidaciones: "Liquidaciones de comisiones",
  asientos: "Asientos contables",
  citas_y_turnos: "Citas y turnos de pacientes",
  historial: "Notas de historial clínico",
};

interface ResultadoLimpieza {
  sistema: string;
  vista_previa: boolean;
  registros: Record<string, number>;
  bloqueos: string[];
}

export function LimpiarOperaciones({ sistema, onCerrar, onHecho }: { sistema: { id: string; nombre: string } | null; onCerrar: () => void; onHecho: () => void }) {
  const [alcance, setAlcance] = useState<Alcance[]>(["caja", "citas", "historial"]);
  const [confirmacion, setConfirmacion] = useState("");

  useEffect(() => {
    if (!sistema) return;
    setAlcance(["caja", "citas", "historial"]);
    setConfirmacion("");
  }, [sistema]);

  const previa = useQuery({
    queryKey: ["limpieza-previa", sistema?.id, alcance],
    enabled: !!sistema && alcance.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("plataforma_limpiar_operaciones", { p_sistema: sistema!.id, p_alcance: alcance });
      if (error) throw error;
      return data as unknown as ResultadoLimpieza;
    },
  });

  const ejecutar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("plataforma_limpiar_operaciones", {
        p_sistema: sistema!.id,
        p_alcance: alcance,
        p_confirmacion: confirmacion.trim(),
      });
      if (error) throw error;
      return data as unknown as ResultadoLimpieza;
    },
    onSuccess: (r) => {
      const total = Object.values(r.registros).reduce((a, b) => a + b, 0);
      toast.success(`Operaciones de prueba borradas en ${r.sistema}`, { description: `${total.toLocaleString("es-DO")} registros.` });
      onHecho();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const registros = previa.data?.registros ?? {};
  const total = Object.values(registros).reduce((a, b) => a + b, 0);
  const bloqueos = previa.data?.bloqueos ?? [];
  const puede = !!sistema && alcance.length > 0 && confirmacion.trim() === sistema.nombre && bloqueos.length === 0 && total > 0 && !previa.isFetching;

  return (
    <Modal
      abierto={!!sistema}
      onCerrar={onCerrar}
      titulo="Limpiar operaciones de prueba"
      descripcion="Borra movimientos, no configuración: servicios, aseguradoras, tarifas, pacientes, personal, empleados y nómina se conservan."
      ancho="lg"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" icono={<Eraser className="size-4" />} cargando={ejecutar.isPending} disabled={!puede} onClick={() => ejecutar.mutate()}>
            Borrar {total ? total.toLocaleString("es-DO") : ""} registros
          </Boton>
        </>
      }
    >
      {sistema && (
        <div className="space-y-5">
          <div className="space-y-2">
            {ALCANCES.map((a) => {
              const activo = alcance.includes(a.clave);
              return (
                <button
                  key={a.clave}
                  type="button"
                  onClick={() => setAlcance((x) => (activo ? x.filter((y) => y !== a.clave) : [...x, a.clave]))}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    activo ? "border-[color-mix(in_oklab,var(--peligro)_40%,var(--borde))] bg-[color-mix(in_oklab,var(--peligro)_6%,transparent)]" : "border-borde hover:bg-superficie-2",
                  )}
                >
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", activo ? "border-peligro bg-peligro text-white" : "border-borde-fuerte")}>
                    {activo && <span className="size-1.5 rounded-sm bg-white" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{a.titulo}</span>
                    <span className="block text-xs text-texto-3">{a.detalle}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl bg-superficie-2 p-4">
            <p className="mb-2 text-xs font-medium text-texto-2">Vista previa en {sistema.nombre}</p>
            {previa.isError ? (
              <p className="text-sm text-peligro">{mensajeError(previa.error)}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {Object.entries(registros)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-texto-2">{ETIQUETAS[k] ?? k}</dt>
                      <dd className="tabular font-medium">{n.toLocaleString("es-DO")}</dd>
                    </div>
                  ))}
                {!previa.isFetching && total === 0 && <p className="col-span-2 text-texto-3">No hay nada que borrar con este alcance.</p>}
                {previa.isFetching && <p className="col-span-2 text-texto-3">Calculando…</p>}
              </dl>
            )}
          </div>

          {bloqueos.length > 0 && (
            <div className="flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--aviso)_35%,transparent)] bg-[color-mix(in_oklab,var(--aviso)_8%,transparent)] p-3.5 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-aviso" />
              <ul className="space-y-1 text-texto-2">
                {bloqueos.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <Entrada
            etiqueta={`Escribe «${sistema.nombre}» para confirmar`}
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
    </Modal>
  );
}

interface UsuarioPlataforma {
  id: string;
  nombre_completo: string;
  email: string;
  activo: boolean;
}

/** Crea «Sistema · Pruebas» a partir de un sistema real. */
export function CrearPruebas({ origen, onCerrar, onCreado }: { origen: { id: string; nombre: string } | null; onCerrar: () => void; onCreado: (id: string) => void }) {
  const [miembros, setMiembros] = useState<string[]>([]);
  const usuarios = useQuery({
    queryKey: ["plataforma-usuarios-pruebas"],
    enabled: !!origen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("plataforma_usuarios");
      if (error) throw error;
      return (data as unknown as UsuarioPlataforma[]).filter((u) => u.activo);
    },
  });
  // Preselecciona la cuenta de pruebas (Lemy) si existe.
  useEffect(() => {
    if (!origen || !usuarios.data) return;
    setMiembros(usuarios.data.filter((u) => /lemy/i.test(`${u.nombre_completo} ${u.email}`)).map((u) => u.id));
  }, [origen, usuarios.data]);

  const crear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("plataforma_crear_sistema_pruebas", { p_origen: origen!.id, p_miembros: miembros });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (id) => {
      toast.success("Sistema de pruebas creado", { description: "Copia de servicios, aseguradoras, tarifas y configuración; sin pacientes ni dinero." });
      onCreado(id);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!origen}
      onCerrar={onCerrar}
      titulo="Crear sistema de pruebas"
      descripcion={origen ? `Copia la configuración de ${origen.nombre} en «${origen.nombre} · Pruebas». Lo que se haga ahí nunca toca los datos reales.` : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton icono={<FlaskConical className="size-4" />} cargando={crear.isPending} onClick={() => crear.mutate()}>
            Crear
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-[0.8125rem] font-medium text-texto-2">Quiénes entran (con todos los roles, para probarlo todo)</p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {(usuarios.data ?? []).map((u) => (
          <Interruptor
            key={u.id}
            activo={miembros.includes(u.id)}
            onChange={(v) => setMiembros((m) => (v ? [...m, u.id] : m.filter((x) => x !== u.id)))}
            etiqueta={
              <span>
                {u.nombre_completo} <span className="text-texto-3">· {u.email}</span>
              </span>
            }
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-texto-3">Tu cuenta se agrega siempre.</p>
    </Modal>
  );
}

/** Reinicia un sistema de pruebas: lo elimina y lo vuelve a crear desde su origen, con los mismos miembros. */
export function ReiniciarPruebas({ sistema, onCerrar, onHecho }: { sistema: { id: string; nombre: string; origen: string | null } | null; onCerrar: () => void; onHecho: (id: string) => void }) {
  const miembros = useQuery({
    queryKey: ["miembros-pruebas", sistema?.id],
    enabled: !!sistema,
    queryFn: async () => {
      const { data, error } = await supabase.from("membresias").select("usuario_id").eq("sistema_id", sistema!.id).eq("activo", true);
      if (error) throw error;
      return (data ?? []).map((m) => m.usuario_id);
    },
  });

  const reiniciar = useMutation({
    mutationFn: async () => {
      if (!sistema?.origen) throw new Error("Este sistema de pruebas perdió su origen: elimínalo y crea uno nuevo.");
      const ids = miembros.data ?? [];
      const borrar = await supabase.rpc("plataforma_eliminar_sistema", { p_sistema: sistema.id, p_confirmacion: sistema.nombre });
      if (borrar.error) throw borrar.error;
      await invocar("plataforma-usuarios", { accion: "limpiar_archivos_sistema", sistema_id: sistema.id }).catch(() => undefined);
      const { data, error } = await supabase.rpc("plataforma_crear_sistema_pruebas", { p_origen: sistema.origen, p_miembros: ids });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (id) => {
      toast.success("Sistema de pruebas reiniciado", { description: "Quedó como recién copiado, sin movimientos." });
      onHecho(id);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!sistema}
      onCerrar={onCerrar}
      titulo="Reiniciar sistema de pruebas"
      descripcion="Se borran todas las pruebas (pacientes de prueba, cobros, turnos, historial…) y se vuelve a copiar la configuración actual del sistema real. Los mismos usuarios conservan el acceso."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" icono={<RotateCcw className="size-4" />} cargando={reiniciar.isPending} disabled={miembros.isLoading} onClick={() => reiniciar.mutate()}>
            Reiniciar
          </Boton>
        </>
      }
    />
  );
}

/** Franja fija cuando el sistema activo es de pruebas: imposible confundirlo con el real. */
export function FranjaPruebas({ sistemaId }: { sistemaId?: string | null }) {
  const q = useQuery({
    queryKey: ["es-pruebas", sistemaId],
    enabled: !!sistemaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("sistemas").select("es_pruebas").eq("id", sistemaId!).maybeSingle();
      return !!data?.es_pruebas;
    },
  });
  if (!q.data) return null;
  return (
    <div className="no-imprimir flex h-7 shrink-0 items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,var(--aviso)_0_12px,color-mix(in_oklab,var(--aviso)_85%,black)_12px_24px)] text-[0.6875rem] font-bold tracking-[0.08em] text-white">
      <FlaskConical className="size-3.5" />
      PRUEBAS · nada de lo que hagas aquí afecta los datos reales
    </div>
  );
}
