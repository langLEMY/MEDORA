import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { SelectorServicio } from "@/components/SelectorServicio";
import { Boton } from "@/components/ui/boton";
import { Campo, Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Avatar, Insignia, Kbd, NumeroAnimado } from "@/components/ui/superficies";
import { CATEGORIAS_SERVICIO, claves, METODOS_PAGO, mismaEspecialidad, EQUIVALENTE_ECF, TIPOS_NCF, useAseguradoras, useMedicos, useServicios, type CitaConRelaciones } from "@/lib/consultas";
import { irA, useAtajos } from "@/lib/atajos";
import { OpcionesMedicos } from "@/components/OpcionesMedicos";
import { datos, invocar, mensajeError, supabase, type Fila, type MetodoPago } from "@/lib/supabase";
import { cn, fecha, moneda, sugerenciasEfectivo } from "@/lib/utils";
import { METODOS_DINERO } from "./comun";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

// ---------------------------------------------------------------------------
// Nuevo cobro: conceptos, pagos combinados (sin repetir método), NCF y comisiones
// ---------------------------------------------------------------------------
interface Linea {
  clave: number;
  servicio_id: string;
  descripcion: string;
  categoria: string;
  cantidad: number;
  precio: number;
  /** Entrega de farmacia que paga la ARS completa (monto libre). */
  cubreArs?: boolean;
}
export interface Pago {
  clave: number;
  metodo: MetodoPago;
  monto: string;
  referencia: string;
  /** Efectivo que entregó el paciente (para calcular la devuelta). */
  recibido?: string;
  /** Sigue el total mientras la cajera no escriba otro monto. */
  auto?: boolean;
}

/** Línea de cobro para un servicio del catálogo (o en blanco para "Otro concepto"). */
function lineaDe(s: Fila<"servicios"> | undefined, enBlanco = false): Linea[] {
  if (!s && !enBlanco) return [];
  return [{ clave: Date.now(), servicio_id: s?.id ?? "", descripcion: s?.nombre ?? "", categoria: s?.categoria ?? "otro", cantidad: 1, precio: Number(s?.precio ?? 0) }];
}

export function NuevoCobro({
  abierto,
  cita,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  /** Si viene de recepción: paciente, servicio y médico ya elegidos; al cobrar se activa el turno. */
  cita?: CitaConRelaciones | null;
  onCerrar: () => void;
  onListo: (id: string) => void;
}) {
  const { sistemaId } = useSistema();
  const servicios = useServicios(sistemaId);
  const aseguradoras = useAseguradoras(sistemaId);
  const personal = useMedicos(sistemaId);
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  // Clave única por intento de cobro: si el clic se repite o la red reintenta, no se cobra dos veces.
  const claveCobro = useRef(crypto.randomUUID());
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [aseguradora, setAseguradora] = useState("");
  const [autorizacion, setAutorizacion] = useState("");
  const [descuento, setDescuento] = useState("0");
  const [conNcf, setConNcf] = useState(false);
  const [tipoNcf, setTipoNcf] = useState("B02");
  const [clienteRnc, setClienteRnc] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [profesional, setProfesional] = useState("");
  const { perfil } = useSesion();
  const [area, setArea] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    claveCobro.current = crypto.randomUUID();
    setArea(cita?.especialidad ?? null);
    setPaciente(cita?.paciente ? { ...cita.paciente } : null);
    setLineas([]);
    // Por defecto el paciente paga todo en efectivo; para dejarlo a crédito se quita el pago.
    setPagos([{ clave: 1, metodo: "efectivo", monto: "", referencia: "", auto: true }]);
    setAseguradora("");
    setAutorizacion("");
    setDescuento("0");
    setTipoNcf("B02");
    setClienteRnc("");
    setClienteNombre("");
    setProfesional(cita?.medico_id ?? "");
    setConNcf(false);
  }, [abierto, cita]);

  // El servicio que eligió recepción entra solo (cuando el catálogo ya cargó).
  useEffect(() => {
    if (!abierto || !cita?.servicio_id || !servicios.data) return;
    setLineas((ls) => (ls.length ? ls : lineaDe(servicios.data!.find((s) => s.id === cita.servicio_id))));
  }, [abierto, cita, servicios.data]);

  useEffect(() => {
    setAseguradora(paciente?.aseguradora_id ?? "");
  }, [paciente]);

  const secuencias = useQuery({
    queryKey: ["ncf-activas", sistemaId],
    enabled: abierto,
    queryFn: async () => datos(await supabase.from("secuencias_ncf").select("tipo").eq("sistema_id", sistemaId).eq("activo", true)) ?? [],
  });

  const saldoAnticipo = useQuery({
    queryKey: ["saldo-anticipo", sistemaId, paciente?.id],
    enabled: !!paciente,
    queryFn: async () => {
      const r = datos(await supabase.from("saldos_anticipo").select("anticipado, aplicado").eq("sistema_id", sistemaId).eq("paciente_id", paciente!.id).maybeSingle());
      return r ? Number(r.anticipado) - Number(r.aplicado) : 0;
    },
  });

  const coberturas = useQuery({
    queryKey: ["coberturas", sistemaId, aseguradora],
    enabled: !!aseguradora,
    queryFn: async () => datos(await supabase.from("coberturas").select("servicio_id, monto_cubierto, precio").eq("aseguradora_id", aseguradora)),
  });

  // Tarifario de la aseguradora elegida: precio pactado y monto cubierto por servicio.
  const pactados = useMemo(
    () =>
      aseguradora && coberturas.data
        ? new Map(coberturas.data.map((c) => [c.servicio_id, { precio: c.precio === null ? null : Number(c.precio), monto_cubierto: Number(c.monto_cubierto) }]))
        : null,
    [aseguradora, coberturas.data],
  );
  // Vista previa; el servidor recalcula con las mismas reglas (registrar_cobro).
  const precioLinea = (l: Linea) => (l.servicio_id ? (pactados?.get(l.servicio_id)?.precio ?? l.precio) : l.precio);
  const esFarmaciaArs = (l: Linea) => !l.servicio_id && l.categoria === "farmacia" && !!l.cubreArs && !!aseguradora;
  const cubierto = (l: Linea) => {
    if (esFarmaciaArs(l)) return l.precio * l.cantidad;
    const c = l.servicio_id ? pactados?.get(l.servicio_id) : undefined;
    return c ? Math.min(c.monto_cubierto, precioLinea(l)) * l.cantidad : 0;
  };
  const subtotal = lineas.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);
  const cobertura = lineas.reduce((s, l) => s + cubierto(l), 0);
  const total = Math.max(subtotal - cobertura - (Number(descuento) || 0), 0);
  const pagado = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const credito = Math.max(total - pagado, 0);
  const excede = pagado - total > 0.004;
  const devuelta = pagos.reduce((s, p) => (p.metodo === "efectivo" && Number(p.recibido) > Number(p.monto) ? s + Number(p.recibido) - Number(p.monto) : s), 0);

  useEffect(() => {
    setPagos((ps) => (ps.some((p) => p.auto) ? ps.map((p) => (p.auto ? { ...p, monto: total > 0 ? total.toFixed(2) : "" } : p)) : ps));
  }, [total]);

  // Ítems agrupados por categoría (como quedarán en la factura y en el asiento).
  const grupos = useMemo(() => {
    const g = new Map<string, Linea[]>();
    lineas.forEach((l) => g.set(l.categoria, [...(g.get(l.categoria) ?? []), l]));
    return [...g.entries()];
  }, [lineas]);

  const metodosUsados = new Set(pagos.map((p) => p.metodo));
  const disponibles = [...METODOS_DINERO, ...((saldoAnticipo.data ?? 0) > 0 ? (["anticipo"] as MetodoPago[]) : [])].filter((m) => !metodosUsados.has(m));

  const agregarLinea = (servicioId: string) => {
    setLineas((ls) => [...ls, ...lineaDe(servicios.data?.find((x) => x.id === servicioId), true)]);
  };

  const agregarPago = () => {
    const metodo = disponibles[0];
    if (!metodo) return;
    const restante = Math.max(total - pagado, 0);
    const monto = metodo === "anticipo" ? Math.min(restante, saldoAnticipo.data ?? 0) : restante;
    setPagos((ps) => [...ps, { clave: Date.now(), metodo, monto: monto ? monto.toFixed(2) : "", referencia: "" }]);
  };

  // Médicos del área elegida (si hay alguno); si no, todos, agrupados por especialidad.
  const todosMedicos = personal.data ?? [];
  const delArea = area ? todosMedicos.filter((m) => mismaEspecialidad(m.especialidad, area)) : [];
  const medicos = delArea.length ? delArea : todosMedicos;
  // La cajera elige el tipo tradicional (B…); con facturación electrónica activa el servidor
  // emite su equivalente E… (B01→E31, B02→E32, B14→E44, B15→E45).
  const hayNcf = (tipo: string) => !!secuencias.data?.some((s) => s.tipo === tipo || s.tipo === EQUIVALENTE_ECF[tipo]);
  const haySecuencias = (secuencias.data?.length ?? 0) > 0;

  // Último cobro vigente del paciente: para repetir los mismos servicios con un clic.
  const ultimo = useQuery({
    queryKey: ["ultimo-cobro", sistemaId, paciente?.id],
    enabled: abierto && !!paciente,
    queryFn: async () => {
      const filas = datos(
        await supabase
          .from("cobros")
          .select("creado_en, anulacion:anulaciones_cobro(id), detalles:cobro_detalles(servicio_id, descripcion, categoria, cantidad, precio_unitario)")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", paciente!.id)
          .order("creado_en", { ascending: false })
          .limit(5),
      );
      return filas?.find((c) => !c.anulacion?.length && c.detalles?.length) ?? null;
    },
  });
  const repetirUltimo = () => {
    const u = ultimo.data;
    if (!u) return;
    setLineas(
      u.detalles.map((d, i) => {
        const s = d.servicio_id ? servicios.data?.find((x) => x.id === d.servicio_id && x.activo) : undefined;
        return s
          ? { ...lineaDe(s)[0], clave: Date.now() + i, cantidad: d.cantidad }
          : { clave: Date.now() + i, servicio_id: "", descripcion: d.descripcion, categoria: d.categoria, cantidad: d.cantidad, precio: Number(d.precio_unitario) };
      }),
    );
  };

  // Consultas, procedimientos y estudios siempre con su médico: sin él no se calcula la comisión
  // (y la nómina termina saliendo del Excel).
  const requiereMedico = lineas.some((l) => ["consulta", "procedimiento", "imagen"].includes(l.categoria));
  const faltaMedico = requiereMedico && !profesional;

  // Lo que ya se le cobró hoy al paciente: avisa si se repite el mismo servicio (cobro duplicado).
  const cobradoHoy = useQuery({
    queryKey: [...claves.caja(sistemaId), "cobrado-hoy", paciente?.id],
    enabled: abierto && !!paciente,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      return (
        datos(
          await supabase
            .from("cobros")
            .select("numero, anulacion:anulaciones_cobro(id), detalles:cobro_detalles(servicio_id, descripcion)")
            .eq("sistema_id", sistemaId)
            .eq("paciente_id", paciente!.id)
            .gte("creado_en", inicio.toISOString()),
        ) ?? []
      ).filter((c) => !c.anulacion?.length);
    },
  });
  const repetidos = lineas
    .filter((l) => l.servicio_id)
    .flatMap((l) => {
      const c = cobradoHoy.data?.find((x) => x.detalles?.some((d) => d.servicio_id === l.servicio_id));
      return c ? [`${l.descripcion} (${c.numero})`] : [];
    });

  const puedeCobrar = !!paciente && lineas.length > 0 && !excede && !faltaMedico;
  useAtajos(
    {
      F4: () => irA("cobro-paciente"),
      F6: () => irA("cobro-servicio", "pulsar"),
      F9: () => puedeCobrar && !m.isPending && m.mutate(),
      "Mod+Enter": () => puedeCobrar && !m.isPending && m.mutate(),
    },
    abierto,
  );

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_cobro", {
          p_sistema: sistemaId,
          p_paciente: paciente!.id,
          p_items: lineas.map((l) =>
            l.servicio_id
              ? { servicio_id: l.servicio_id, cantidad: l.cantidad }
              : { descripcion: l.descripcion, categoria: l.categoria, cantidad: l.cantidad, precio_unitario: l.precio, cubre_ars: esFarmaciaArs(l) },
          ),
          p_pagos: pagos
            .filter((p) => Number(p.monto) > 0)
            .map((p) => ({ metodo: p.metodo, monto: Number(p.monto), referencia: p.referencia || null, recibido: p.metodo === "efectivo" && Number(p.recibido) > 0 ? Number(p.recibido) : null })),
          p_aseguradora: aseguradora || undefined,
          p_autorizacion: autorizacion || undefined,
          p_descuento: Number(descuento) || 0,
          p_tipo_ncf: conNcf ? tipoNcf : undefined,
          p_cliente_rnc: clienteRnc || undefined,
          p_cliente_nombre: clienteNombre || undefined,
          p_profesional: profesional || undefined,
          p_cita: cita?.id,
          p_idempotencia: claveCobro.current,
        }),
      ) as { id: string; numero: string; ncf: string | null; turno: string | null },
    onSuccess: (r) => {
      claveCobro.current = crypto.randomUUID();
      toast.success(`Cobro ${r.numero}${r.ncf ? ` · NCF ${r.ncf}` : ""} registrado${r.turno ? ` · turno ${r.turno}` : ""}`);
      // e-CF: firmar y enviar a la DGII ya (si falla, pg_cron lo reintenta en minutos).
      if (r.ncf?.startsWith("E")) void invocar("ecf", { accion: "enviar", sistema_id: sistemaId }).catch(() => undefined);
      onCerrar();
      onListo(r.id);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      lateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nuevo cobro"
      pie={
        <>
          <div className="mr-auto text-sm">
            <span className="text-texto-2">Total </span>
            <span className="text-lg font-semibold tabular">
              <NumeroAnimado valor={total} formato={(n) => moneda(n)} />
            </span>
          </div>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!puedeCobrar} onClick={() => m.mutate()} title="Atajo: F9 o Ctrl+Enter">
            Registrar cobro
            <kbd className="ml-1 rounded bg-white/20 px-1 font-sans text-[0.6875rem]">F9</kbd>
          </Boton>
        </>
      }
    >
      <div className="space-y-6">
        {/* Turno del quiosco sin registrar: llega con su cédula ya buscada (o se registra aquí). */}
        <div data-atajo="cobro-paciente">
          <SelectorPaciente valor={paciente} onChange={setPaciente} textoInicial={cita && !cita.paciente ? (cita.cedula_llegada ?? undefined) : undefined} />
        </div>
        <p className="-mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-texto-3">
          <span>
            <Kbd>F4</Kbd> paciente
          </span>
          <span>
            <Kbd>F6</Kbd> agregar servicio
          </span>
          <span>
            <Kbd>F9</Kbd> registrar
          </span>
          <span>
            <Kbd>Esc</Kbd> cerrar
          </span>
        </p>

        {/* El seguro va antes que los servicios: define precios pactados y cobertura. */}
        <section className="grid grid-cols-2 gap-4">
          <Selector etiqueta="Seguro médico" value={aseguradora} onChange={(e) => setAseguradora(e.target.value)}>
            <option value="">Sin seguro (privado)</option>
            {aseguradoras.data
              ?.filter((a) => a.activo)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
          </Selector>
          <Entrada etiqueta="No. de autorización" value={autorizacion} onChange={(e) => setAutorizacion(e.target.value)} disabled={!aseguradora} />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.8125rem] font-medium text-texto-2">Servicios</span>
            <div className="flex gap-2">
              {ultimo.data && lineas.length === 0 && (
                <Boton
                  variante="fantasma"
                  icono={<RotateCcw className="size-4" />}
                  onClick={repetirUltimo}
                  title={`${fecha(ultimo.data.creado_en)}: ${ultimo.data.detalles.map((d) => d.descripcion).join(", ")}`}
                >
                  Repetir último
                </Boton>
              )}
              <div data-atajo="cobro-servicio">
                <SelectorServicio servicios={servicios.data ?? []} pactados={pactados} area={area} onArea={setArea} onElegir={(s) => agregarLinea(s.id)} />
              </div>
              <Boton
                variante="secundario"
                onClick={() =>
                  setLineas((ls) => [
                    ...ls,
                    { clave: Date.now(), servicio_id: "", descripcion: "ENTREGA DE MEDICAMENTOS", categoria: "farmacia", cantidad: 1, precio: 0, cubreArs: true },
                  ])
                }
                title="Medicamentos entregados: escribe el monto; si el paciente tiene ARS, la ARS lo cubre"
              >
                Farmacia
              </Boton>
              <Boton variante="secundario" onClick={() => agregarLinea("")} title="Cobrar algo que no está en el catálogo">
                Otro concepto
              </Boton>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-borde">
            {lineas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-texto-3">Agrega al menos un servicio o concepto.</p>
            ) : (
              grupos.map(([cat, ls]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between bg-superficie-2/70 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-wide text-texto-3 uppercase">
                    <span>{CATEGORIAS_SERVICIO[cat] ?? cat}</span>
                    <span className="tabular">{moneda(ls.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0))}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {ls.map((l) => (
                      <motion.div
                        key={l.clave}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden border-t border-borde"
                      >
                        <div className="flex items-center gap-2 px-3 py-2">
                          {l.servicio_id ? (
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.descripcion}</span>
                          ) : (
                            <>
                              <input
                                placeholder="Descripción"
                                value={l.descripcion}
                                onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, descripcion: e.target.value } : y)))}
                                className="h-8 min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-2 text-sm"
                              />
                              <select
                                value={l.categoria}
                                onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, categoria: e.target.value } : y)))}
                                className="h-8 rounded-lg border border-borde bg-superficie px-1.5 text-xs"
                              >
                                {Object.entries(CATEGORIAS_SERVICIO).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <input
                            type="number"
                            min={1}
                            value={l.cantidad}
                            onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, cantidad: Math.max(1, Number(e.target.value)) } : y)))}
                            className="h-8 w-14 rounded-lg border border-borde bg-superficie px-2 text-sm tabular"
                          />
                          {l.servicio_id ? (
                            <span className="w-24 text-right text-sm tabular">{moneda(precioLinea(l))}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.precio}
                              onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, precio: Number(e.target.value) } : y)))}
                              className="h-8 w-24 rounded-lg border border-borde bg-superficie px-2 text-right text-sm tabular"
                            />
                          )}
                          {!l.servicio_id && l.categoria === "farmacia" && aseguradora && (
                            <label className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-texto-2" title="La ARS paga la entrega completa">
                              <input
                                type="checkbox"
                                checked={!!l.cubreArs}
                                onChange={(e) => setLineas((x) => x.map((y) => (y.clave === l.clave ? { ...y, cubreArs: e.target.checked } : y)))}
                              />
                              ARS
                            </label>
                          )}
                          {cubierto(l) > 0 ? (
                            <Insignia tono="info">−{moneda(cubierto(l))}</Insignia>
                          ) : (
                            aseguradora && pactados && <Insignia tono="aviso">No lo cubre el seguro</Insignia>
                          )}
                          <button
                            onClick={() => setLineas((x) => x.filter((y) => y.clave !== l.clave))}
                            className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
          {repetidos.length > 0 && (
            <p className="mt-2 rounded-lg bg-[color-mix(in_oklab,var(--aviso)_12%,transparent)] px-3 py-2 text-xs text-texto">
              <b>¿Cobro repetido?</b> Hoy ya se le cobró: {repetidos.join(", ")}. Revisa antes de registrar.
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-4">
          <Selector
            etiqueta="Médico que atendió"
            value={profesional}
            onChange={(e) => setProfesional(e.target.value)}
            error={faltaMedico ? "Elige el médico: sin él no se calcula su comisión." : undefined}
          >
            <option value="">Seleccionar…</option>
            <OpcionesMedicos medicos={medicos} />
          </Selector>
          <Entrada etiqueta="Descuento" type="number" min={0} step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          {/* Quien cobra es el vendedor/comisionista: lo fija el servidor con la sesión. */}
          <Campo etiqueta="Procesado por" className="col-span-2">
            {() => (
              <div className="flex h-9 items-center gap-2.5 rounded-[10px] border border-borde bg-superficie-2 px-2.5 text-sm">
                <Avatar nombre={perfil?.nombre_completo} foto={perfil?.foto} tamano={22} />
                <span className="flex-1 truncate font-medium">{perfil?.nombre_completo}</span>
                <Lock className="size-3.5 text-texto-3" />
              </div>
            )}
          </Campo>
        </section>

        <section className="space-y-3 rounded-xl border border-borde p-3.5">
          <Interruptor
            activo={conNcf}
            onChange={(v) => {
              setConNcf(v);
              // Al activarlo, preselecciona un tipo con secuencia disponible (B02 si la hay).
              if (v && !hayNcf(tipoNcf)) setTipoNcf(Object.keys(EQUIVALENTE_ECF).find(hayNcf) ?? "B02");
            }}
            etiqueta="Emitir comprobante fiscal (NCF)"
            disabled={!haySecuencias}
          />
          {!haySecuencias && <p className="text-xs text-texto-3">Primero hay que cargar los comprobantes autorizados por la DGII (Contabilidad → Comprobantes fiscales).</p>}
          <AnimatePresence initial={false}>
            {conNcf && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <Selector etiqueta="Tipo de comprobante" contenedor="col-span-2" value={tipoNcf} onChange={(e) => setTipoNcf(e.target.value)}>
                    {Object.entries(TIPOS_NCF)
                      .filter(([k]) => k in EQUIVALENTE_ECF && hayNcf(k))
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </Selector>
                  {tipoNcf !== "B02" && (
                    <>
                      <Entrada etiqueta="RNC / cédula del cliente" value={clienteRnc} onChange={(e) => setClienteRnc(e.target.value)} />
                      <Entrada etiqueta="Razón social" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.8125rem] font-medium text-texto-2">Pagos</span>
            <div className="flex items-center gap-3">
              {(saldoAnticipo.data ?? 0) > 0 && (
                <span className="text-xs text-exito">Anticipo disponible: {moneda(saldoAnticipo.data)}</span>
              )}
              <Boton variante="secundario" tamano="sm" icono={<Plus className="size-3.5" />} disabled={disponibles.length === 0} onClick={agregarPago}>
                Agregar pago
              </Boton>
            </div>
          </div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {pagos.map((p) => (
                <motion.div
                  key={p.clave}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={p.metodo}
                      onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, metodo: e.target.value as MetodoPago } : y)))}
                      className="h-9 w-40 rounded-[10px] border border-borde bg-superficie px-2 text-sm"
                    >
                      {[p.metodo, ...disponibles].map((mt) => (
                        <option key={mt} value={mt}>
                          {METODOS_PAGO[mt]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Monto"
                      value={p.monto}
                      onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, monto: e.target.value, auto: false } : y)))}
                      className="h-9 w-36 rounded-[10px] border border-borde bg-superficie px-3 text-right text-sm tabular"
                    />
                    {p.metodo === "efectivo" ? (
                      // En efectivo: cuánto entregó el paciente, para la devuelta.
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Recibe RD$"
                        title="Efectivo que entrega el paciente"
                        value={p.recibido ?? ""}
                        onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, recibido: e.target.value } : y)))}
                        className="h-9 min-w-0 flex-1 rounded-[10px] border border-borde bg-superficie px-3 text-right text-sm tabular"
                      />
                    ) : (
                      <input
                        placeholder={p.metodo === "anticipo" ? "" : "Referencia / últimos 4"}
                        disabled={p.metodo === "anticipo"}
                        value={p.referencia}
                        onChange={(e) => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, referencia: e.target.value } : y)))}
                        className="h-9 min-w-0 flex-1 rounded-[10px] border border-borde bg-superficie px-3 text-sm disabled:opacity-40"
                      />
                    )}
                    <button
                      onClick={() => setPagos((x) => x.filter((y) => y.clave !== p.clave))}
                      className="grid size-9 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-peligro"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {p.metodo === "efectivo" && Number(p.monto) > 0 && (
                    // Billetes rápidos: lo que entrega el paciente, para la devuelta.
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[10.5rem]">
                      <span className="text-[0.6875rem] text-texto-3">Entrega:</span>
                      {sugerenciasEfectivo(Number(p.monto)).map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPagos((x) => x.map((y) => (y.clave === p.clave ? { ...y, recibido: v.toFixed(2) } : y)))}
                          className={cn(
                            "h-7 rounded-lg border px-2.5 text-xs font-medium tabular transition-colors",
                            Number(p.recibido) === v ? "border-marca bg-marca-suave text-marca-texto" : "border-borde bg-superficie hover:bg-superficie-2",
                          )}
                        >
                          {i === 0 ? "Exacto" : moneda(v).replace(/\.00$/, "")}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {pagos.length === 0 && (
              <p className="rounded-xl bg-[color-mix(in_oklab,var(--aviso)_10%,var(--superficie))] px-4 py-3 text-sm text-aviso">
                Sin pagos: el total quedará como deuda del paciente.
              </p>
            )}
          </div>
        </section>

        <dl className="space-y-1.5 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          {[
            ["Subtotal", subtotal],
            ["Cubre el seguro", -cobertura],
            ["Descuento", -(Number(descuento) || 0)],
            ["Paga el paciente", total],
            ["Pagado", pagado],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between">
              <dt className="text-texto-2">{k}</dt>
              <dd className="tabular">{moneda(v as number)}</dd>
            </div>
          ))}
          {devuelta > 0 && (
            <div className="flex justify-between text-base font-semibold">
              <dt>Devuelta</dt>
              <dd className="tabular">{moneda(devuelta)}</dd>
            </div>
          )}
          <div className={cn("flex justify-between border-t border-borde pt-1.5 font-semibold", excede ? "text-peligro" : credito > 0 ? "text-aviso" : "text-exito")}>
            <dt>{excede ? "Los pagos superan el total" : credito > 0 ? "Queda debiendo" : "Pagado completo"}</dt>
            <dd className="tabular">{moneda(excede ? pagado - total : credito)}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
