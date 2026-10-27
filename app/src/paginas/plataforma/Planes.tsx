import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Check, Pencil, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Esqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { cn, fecha, moneda } from "@/lib/utils";

type Plan = Fila<"planes">;
type Suscripcion = {
  sistema_id: string;
  sistema: string;
  es_pruebas: boolean;
  plan_id: string | null;
  plan: string | null;
  estado: string;
  precio_sede: number | null;
  sedes: number;
  monto_mensual: number;
  prueba_hasta: string | null;
  proximo_corte: string | null;
};

const ESTADOS: Record<string, { etiqueta: string; tono: Tono }> = {
  prueba: { etiqueta: "Prueba gratis", tono: "info" },
  activa: { etiqueta: "Activa", tono: "exito" },
  vencida: { etiqueta: "Vencida", tono: "aviso" },
  suspendida: { etiqueta: "Suspendida", tono: "peligro" },
  cortesia: { etiqueta: "Cortesía", tono: "violeta" },
  sin_plan: { etiqueta: "Sin elegir", tono: "neutro" },
};

// Fechas sin hora: al mediodía para que la zona horaria no las corra un día.
const dia = (d: string | null) => (d ? fecha(`${d}T12:00:00`) : "—");

/**
 * Planes de MEDORA (solo superadmin): el catálogo que ve el primer administrador de un hospital
 * en su bienvenida (precio por sede al mes, 30 días gratis) y la suscripción de cada hospital.
 */
export function Planes() {
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Plan | "nuevo" | null>(null);
  const [cambiar, setCambiar] = useState<Suscripcion | null>(null);

  const planes = useQuery({
    queryKey: ["plataforma-planes"],
    queryFn: async () => datos(await supabase.from("planes").select("*").order("orden").order("precio_sede")) ?? [],
  });
  const suscripciones = useQuery({
    queryKey: ["plataforma-suscripciones"],
    queryFn: async () => (datos(await supabase.rpc("resumen_suscripciones")) ?? []) as Suscripcion[],
  });

  const reales = (suscripciones.data ?? []).filter((s) => !s.es_pruebas);
  const mensual = reales.reduce((s, x) => s + Number(x.monto_mensual ?? 0), 0);
  const enPrueba = reales.filter((s) => s.estado === "prueba").length;
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["plataforma-planes"] });
    void qc.invalidateQueries({ queryKey: ["plataforma-suscripciones"] });
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-texto-2">
            El primer administrador de cada hospital nuevo elige uno al entrar. <span className="font-medium text-texto">30 días gratis</span> y después se
            cobra por sede.
          </p>
          <Boton icono={<Plus className="size-4" />} onClick={() => setEditar("nuevo")}>
            Nuevo plan
          </Boton>
        </div>

        {planes.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : (planes.data?.length ?? 0) === 0 ? (
          <Tarjeta>
            <Vacio
              icono={<Sparkles />}
              titulo="Sin planes todavía"
              descripcion="Mientras no haya planes activos, los hospitales nuevos no ven el paso del plan."
              accion={<Boton onClick={() => setEditar("nuevo")}>Crear el primero</Boton>}
            />
          </Tarjeta>
        ) : (
          <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {planes.data!.map((p) => (
              <motion.div key={p.id} variants={itemEscalonado}>
                <Tarjeta className={cn("relative flex h-full flex-col p-5", p.destacado && "ring-2 ring-marca", !p.activo && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{p.nombre}</p>
                        {p.destacado && <Insignia tono="marca">Recomendado</Insignia>}
                        {!p.activo && <Insignia>Oculto</Insignia>}
                      </div>
                      {p.descripcion && <p className="mt-0.5 text-[0.8125rem] text-texto-2">{p.descripcion}</p>}
                    </div>
                    <Boton variante="secundario" tamano="icono" aria-label={`Editar ${p.nombre}`} onClick={() => setEditar(p)}>
                      <Pencil className="size-4" />
                    </Boton>
                  </div>
                  <p className="mt-4">
                    <span className="text-2xl font-semibold tracking-[-0.02em] tabular">{moneda(p.precio_sede)}</span>
                    <span className="ml-1 text-xs text-texto-3">por sede / mes</span>
                  </p>
                  {p.caracteristicas.length > 0 && (
                    <ul className="mt-4 space-y-1.5 border-t border-borde pt-4">
                      {p.caracteristicas.map((c) => (
                        <li key={c} className="flex items-start gap-2 text-sm text-texto-2">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-exito" strokeWidth={3} />
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[0.9375rem] font-semibold">Suscripciones</h2>
            <p className="text-sm text-texto-2">Lo que paga cada hospital: precio pactado × sedes activas.</p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-lg font-semibold tabular">{moneda(mensual)}</p>
              <p className="text-xs text-texto-3">Ingreso mensual (activas)</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular">{enPrueba}</p>
              <p className="text-xs text-texto-3">En prueba</p>
            </div>
          </div>
        </div>
        <Tarjeta className="overflow-hidden">
          {suscripciones.isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-left text-xs text-texto-3">
                    <th className="px-4 py-2.5 font-medium">Hospital</th>
                    <th className="px-4 py-2.5 font-medium">Plan</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sedes</th>
                    <th className="px-4 py-2.5 text-right font-medium">Mensual</th>
                    <th className="px-4 py-2.5 font-medium">Prueba / corte</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {(suscripciones.data ?? []).map((s) => {
                    const e = ESTADOS[s.estado] ?? ESTADOS.sin_plan;
                    return (
                      <tr key={s.sistema_id} className={cn("border-b border-borde last:border-0", s.es_pruebas && "text-texto-3")}>
                        <td className="px-4 py-3 font-medium">
                          {s.sistema}
                          {s.es_pruebas && <span className="ml-2 text-xs font-normal">(pruebas)</span>}
                        </td>
                        <td className="px-4 py-3">
                          {s.plan ?? "—"}
                          {s.precio_sede != null && <span className="ml-1.5 text-xs text-texto-3">{moneda(s.precio_sede)}/sede</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Insignia tono={e.tono} punto>
                            {e.etiqueta}
                          </Insignia>
                        </td>
                        <td className="px-4 py-3 text-right tabular">{s.sedes}</td>
                        <td className="px-4 py-3 text-right font-medium tabular">{Number(s.monto_mensual) > 0 ? moneda(s.monto_mensual) : "—"}</td>
                        <td className="px-4 py-3 text-texto-2">
                          {s.estado === "prueba" ? `Gratis hasta ${dia(s.prueba_hasta)}` : s.proximo_corte ? `Corte ${dia(s.proximo_corte)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!s.es_pruebas && (
                            <Boton variante="fantasma" tamano="sm" onClick={() => setCambiar(s)}>
                              Cambiar
                            </Boton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </section>

      <EditarPlan plan={editar} onCerrar={() => setEditar(null)} onGuardado={refrescar} />
      <CambiarSuscripcion suscripcion={cambiar} planes={planes.data ?? []} onCerrar={() => setCambiar(null)} onGuardado={refrescar} />
    </div>
  );
}

function EditarPlan({ plan, onCerrar, onGuardado }: { plan: Plan | "nuevo" | null; onCerrar: () => void; onGuardado: () => void }) {
  const existente = plan && plan !== "nuevo" ? plan : null;
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [caracteristicas, setCaracteristicas] = useState("");
  const [destacado, setDestacado] = useState(false);
  const [activo, setActivo] = useState(true);
  const [orden, setOrden] = useState("0");

  useEffect(() => {
    if (!plan) return;
    setNombre(existente?.nombre ?? "");
    setDescripcion(existente?.descripcion ?? "");
    setPrecio(existente ? String(existente.precio_sede) : "");
    setCaracteristicas(existente?.caracteristicas.join("\n") ?? "");
    setDestacado(existente?.destacado ?? false);
    setActivo(existente?.activo ?? true);
    setOrden(String(existente?.orden ?? 0));
  }, [plan, existente]);

  const precioNum = Number(precio);
  const valido = nombre.trim().length >= 2 && precio.trim() !== "" && Number.isFinite(precioNum) && precioNum >= 0;

  const guardar = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("guardar_plan", {
          p_id: existente?.id ?? (null as unknown as string),
          p_nombre: nombre.trim(),
          p_descripcion: descripcion.trim(),
          p_precio_sede: precioNum,
          p_caracteristicas: caracteristicas.split("\n").map((c) => c.trim()).filter(Boolean),
          p_destacado: destacado,
          p_activo: activo,
          p_orden: Number(orden) || 0,
        }),
      ),
    onSuccess: () => {
      toast.success(existente ? "Plan actualizado" : "Plan creado");
      onGuardado();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!plan}
      onCerrar={onCerrar}
      titulo={existente ? `Editar ${existente.nombre}` : "Nuevo plan"}
      descripcion="El precio es por sede al mes, en pesos. Cambiarlo no afecta a los hospitales que ya lo eligieron."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Entrada etiqueta="Nombre" maxLength={40} placeholder="Ej. Profesional" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Entrada etiqueta="Precio por sede (RD$)" inputMode="decimal" placeholder="0.00" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <Entrada etiqueta="Descripción corta" maxLength={160} placeholder="Para quién es" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <AreaTexto
          etiqueta="Qué incluye (una línea por punto)"
          className="min-h-28"
          placeholder={"Caja y facturación\nAgenda y turnos\nSoporte en horario laboral"}
          value={caracteristicas}
          onChange={(e) => setCaracteristicas(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Interruptor activo={destacado} onChange={setDestacado} etiqueta="Recomendado" />
          <Interruptor activo={activo} onChange={setActivo} etiqueta="Visible para elegir" />
          <div className="ml-auto w-24">
            <Entrada etiqueta="Orden" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CambiarSuscripcion({ suscripcion, planes, onCerrar, onGuardado }: {
  suscripcion: Suscripcion | null;
  planes: Plan[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [plan, setPlan] = useState("");
  const [estado, setEstado] = useState("activa");
  const [corte, setCorte] = useState("");

  useEffect(() => {
    if (!suscripcion) return;
    setPlan(suscripcion.plan_id ?? planes[0]?.id ?? "");
    setEstado(suscripcion.estado === "sin_plan" ? "prueba" : suscripcion.estado);
    setCorte(suscripcion.estado === "prueba" ? (suscripcion.prueba_hasta ?? "") : (suscripcion.proximo_corte ?? ""));
  }, [suscripcion, planes]);

  const guardar = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("asignar_suscripcion", {
          p_sistema: suscripcion!.sistema_id,
          p_plan: estado === "cortesia" && !plan ? (null as unknown as string) : plan,
          p_estado: estado,
          p_proximo_corte: corte || undefined,
        }),
      ),
    onSuccess: () => {
      toast.success("Suscripción actualizada");
      onGuardado();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!suscripcion}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={suscripcion?.sistema ?? ""}
      descripcion="Plan, estado y fecha del próximo corte de este hospital."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={estado !== "cortesia" && !plan} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Selector etiqueta="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {estado === "cortesia" && <option value="">Sin plan</option>}
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} · {moneda(p.precio_sede)}/sede{p.activo ? "" : " (oculto)"}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          {Object.entries(ESTADOS)
            .filter(([k]) => k !== "sin_plan")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v.etiqueta}
              </option>
            ))}
        </Selector>
        <Entrada
          etiqueta={estado === "prueba" ? "Gratis hasta" : "Próximo corte"}
          type="date"
          value={corte}
          onChange={(e) => setCorte(e.target.value)}
          ayuda={suscripcion?.plan_id === plan ? "Si mantienes el plan, se conserva el precio pactado." : "Con otro plan se toma su precio actual."}
        />
      </div>
    </Modal>
  );
}
