import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Landmark, Plus, Undo2, Upload, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImportarExcel } from "@/components/ImportarExcel";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { IMPORTACIONES } from "@/lib/importaciones";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Conciliación bancaria: el estado de cuenta del banco contra lo registrado en MEDORA
 * (pagos con tarjeta/transferencia/cheque, abonos, donaciones, gastos por banco).
 * Lo automático: montos exactos y lotes de tarjeta con su comisión. Lo demás, a mano.
 */
interface Movimiento {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  monto: number;
  conciliado: number;
  vinculos: number;
  cuadrado: boolean;
  automatica: boolean;
}

interface Partida {
  tipo: string;
  origen_id: string;
  fecha: string;
  monto: number;
  metodo: string;
  descripcion: string;
}

const TIPO_PARTIDA: Record<string, string> = {
  cobro_pago: "Cobro",
  abono: "Abono",
  donacion: "Donación",
  compra: "Gasto",
  movimiento: "Egreso de caja",
};

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

export function ConciliacionBancaria() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const escribir = puedeEscribir.contabilidad(roles);
  const [cuentaId, setCuentaId] = useState<string>("");
  const [filtro, setFiltro] = useState<"pendientes" | "todos">("pendientes");
  const [importar, setImportar] = useState(false);
  const [nuevaCuenta, setNuevaCuenta] = useState(false);
  const [conciliar, setConciliar] = useState<Movimiento | null>(null);

  const cuentas = useQuery({
    queryKey: ["cuentas-bancarias", sistemaId],
    queryFn: async () => datos(await supabase.from("cuentas_bancarias").select("*").eq("sistema_id", sistemaId).eq("activo", true).order("creado_en")) ?? [],
  });
  useEffect(() => {
    if (!cuentaId && cuentas.data?.length) setCuentaId(cuentas.data[0].id);
  }, [cuentas.data, cuentaId]);

  const movs = useQuery({
    queryKey: ["movimientos-bancarios", sistemaId, cuentaId],
    enabled: !!cuentaId,
    queryFn: async () =>
      ((datos(
        await supabase
          .from("movimientos_bancarios_estado")
          .select("id, fecha, descripcion, referencia, monto, conciliado, vinculos, cuadrado, automatica")
          .eq("cuenta_id", cuentaId)
          .order("fecha", { ascending: false })
          .limit(500),
      ) ?? []) as unknown as Movimiento[]).map((m) => ({ ...m, monto: Number(m.monto), conciliado: Number(m.conciliado) })),
  });

  const refrescar = () => void qc.invalidateQueries({ queryKey: ["movimientos-bancarios", sistemaId] });

  const auto = useMutation({
    mutationFn: async () => datos(await supabase.rpc("conciliar_automatico", { p_sistema: sistemaId, p_cuenta: cuentaId })) as { exactos: number; lotes_tarjeta: number },
    onSuccess: (r) => {
      toast.success(r.exactos + r.lotes_tarjeta === 0 ? "No se encontraron coincidencias nuevas" : `Conciliados: ${r.exactos} por monto exacto y ${r.lotes_tarjeta} lotes de tarjeta`);
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const deshacer = useMutation({
    mutationFn: async (id: string) => datos(await supabase.rpc("deshacer_conciliacion", { p_sistema: sistemaId, p_movimiento: id })),
    onSuccess: () => {
      toast.success("Conciliación deshecha");
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const lista = (movs.data ?? []).filter((m) => filtro === "todos" || !m.cuadrado);
  const pendientes = (movs.data ?? []).filter((m) => !m.cuadrado);
  const cuenta = cuentas.data?.find((c) => c.id === cuentaId);

  return (
    <div className="space-y-4">
      <Tarjeta className="flex flex-wrap items-end gap-3 p-4">
        {(cuentas.data?.length ?? 0) > 0 ? (
          <Selector etiqueta="Cuenta" contenedor="min-w-64" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            {cuentas.data!.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco} · {c.nombre}
                {c.numero ? ` (${c.numero})` : ""}
              </option>
            ))}
          </Selector>
        ) : (
          <p className="text-sm text-texto-2">Registra la cuenta del banco para empezar a conciliar.</p>
        )}
        {escribir && (
          <Boton variante="fantasma" icono={<Plus className="size-4" />} onClick={() => setNuevaCuenta(true)}>
            Cuenta
          </Boton>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {escribir && cuentaId && (
            <>
              <Boton variante="secundario" icono={<Upload className="size-4" />} onClick={() => setImportar(true)}>
                Importar estado de cuenta
              </Boton>
              <Boton icono={<Wand2 className="size-4" />} cargando={auto.isPending} disabled={pendientes.length === 0} onClick={() => auto.mutate()}>
                Conciliar automáticamente
              </Boton>
            </>
          )}
        </div>
      </Tarjeta>

      {cuentaId && (
        <Tarjeta className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-borde px-5 py-3">
            <Segmentado
              id="conciliacion-filtro"
              valor={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: "pendientes", etiqueta: `Sin conciliar (${pendientes.length})` },
                { valor: "todos", etiqueta: `Todos (${movs.data?.length ?? 0})` },
              ]}
            />
            {cuenta && <span className="ml-auto text-xs text-texto-3">{cuenta.banco} · {cuenta.nombre}</span>}
          </div>
          {movs.isLoading ? (
            <FilasEsqueleto />
          ) : lista.length === 0 ? (
            <Vacio
              icono={<Landmark />}
              titulo={(movs.data?.length ?? 0) === 0 ? "Sin movimientos importados" : "Todo conciliado"}
              descripcion={(movs.data?.length ?? 0) === 0 ? "Importa el estado de cuenta del banco (Excel o CSV)." : "Cada movimiento del banco tiene su registro en MEDORA."}
            />
          ) : (
            <ul className="max-h-[36rem] divide-y divide-borde overflow-y-auto">
              {lista.map((m) => (
                <li key={m.id} className="group flex items-center gap-4 px-5 py-2.5 text-sm">
                  <span className="w-24 shrink-0 tabular text-texto-2">{fecha(m.fecha + "T12:00:00")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.descripcion || "—"}</span>
                    {m.referencia && <span className="block truncate font-mono text-xs text-texto-3">Ref. {m.referencia}</span>}
                  </span>
                  <span className={cn("w-32 shrink-0 text-right font-medium tabular", m.monto > 0 ? "text-exito" : "text-peligro")}>{moneda(m.monto)}</span>
                  <span className="w-40 shrink-0">
                    {m.cuadrado ? (
                      <Insignia tono="exito" punto>
                        {m.automatica ? "Conciliado (auto)" : "Conciliado"}
                      </Insignia>
                    ) : m.vinculos > 0 ? (
                      <Insignia tono="aviso">Diferencia {moneda(m.monto - m.conciliado)}</Insignia>
                    ) : (
                      <Insignia>Sin conciliar</Insignia>
                    )}
                  </span>
                  {escribir && (
                    <span className="w-28 shrink-0 text-right">
                      {m.vinculos > 0 ? (
                        <Boton variante="fantasma" tamano="sm" icono={<Undo2 className="size-3.5" />} onClick={() => deshacer.mutate(m.id)}>
                          Deshacer
                        </Boton>
                      ) : (
                        <Boton variante="suave" tamano="sm" onClick={() => setConciliar(m)}>
                          Conciliar
                        </Boton>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      )}

      <ImportarExcel
        definicion={IMPORTACIONES.movimientosBancarios}
        abierto={importar}
        onCerrar={() => setImportar(false)}
        onListo={refrescar}
        extra={{ p_cuenta: cuentaId }}
      />
      <NuevaCuenta abierto={nuevaCuenta} onCerrar={() => setNuevaCuenta(false)} onCreada={setCuentaId} />
      <ConciliarManual movimiento={conciliar} onCerrar={() => setConciliar(null)} onListo={refrescar} />
    </div>
  );
}

function NuevaCuenta({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: (id: string) => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [f, setF] = useState({ banco: "", nombre: "Cuenta corriente", numero: "" });
  const m = useMutation({
    mutationFn: async () =>
      datos(await supabase.rpc("guardar_cuenta_bancaria", { p_sistema: sistemaId, p_id: null as never, p_banco: f.banco, p_nombre: f.nombre, p_numero: f.numero, p_activo: true })) as string,
    onSuccess: (id) => {
      toast.success("Cuenta registrada");
      void qc.invalidateQueries({ queryKey: ["cuentas-bancarias", sistemaId] });
      onCreada(id);
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Nueva cuenta bancaria"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={f.banco.trim().length < 2 || f.nombre.trim().length < 2} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada etiqueta="Banco" placeholder="Banco Popular, BHD, Banreservas…" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} />
        <Entrada etiqueta="Nombre de la cuenta" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Entrada etiqueta="Últimos dígitos" placeholder="****1234" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
      </div>
    </Modal>
  );
}

function ConciliarManual({ movimiento: m, onCerrar, onListo }: { movimiento: Movimiento | null; onCerrar: () => void; onListo: () => void }) {
  const { sistemaId } = useSistema();
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [ajuste, setAjuste] = useState<"comision" | "otro">("comision");
  const [nota, setNota] = useState("");

  useEffect(() => {
    setElegidas(new Set());
    setNota("");
    setAjuste("comision");
  }, [m]);

  const partidas = useQuery({
    queryKey: ["partidas-sin-conciliar", sistemaId, m?.id],
    enabled: !!m,
    queryFn: async () =>
      ((datos(await supabase.rpc("partidas_sin_conciliar", { p_sistema: sistemaId, p_desde: sumarDias(m!.fecha, -20), p_hasta: sumarDias(m!.fecha, 5) })) ??
        []) as unknown as Partida[]).map((p) => ({ ...p, monto: Number(p.monto) })),
  });

  // Mismo sentido (entrada/salida) y las más parecidas en monto primero.
  const candidatas = useMemo(
    () =>
      m
        ? (partidas.data ?? []).filter((p) => Math.sign(p.monto) === Math.sign(m.monto)).sort((a, b) => Math.abs(a.monto - m.monto) - Math.abs(b.monto - m.monto))
        : [],
    [partidas.data, m],
  );
  const clave = (p: Partida) => `${p.tipo}:${p.origen_id}`;
  const suma = candidatas.filter((p) => elegidas.has(clave(p))).reduce((s, p) => s + p.monto, 0);
  const diferencia = m ? Math.round((m.monto - suma) * 100) / 100 : 0;

  const guardar = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("conciliar_manual", {
          p_sistema: sistemaId,
          p_movimiento: m!.id,
          p_partidas: candidatas.filter((p) => elegidas.has(clave(p))).map((p) => ({ tipo: p.tipo, origen_id: p.origen_id })),
          p_ajuste: diferencia !== 0 ? ajuste : (null as never),
          p_nota: nota,
        }),
      ),
    onSuccess: () => {
      toast.success("Movimiento conciliado");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      lateral
      abierto={!!m}
      onCerrar={onCerrar}
      titulo="Conciliar movimiento"
      descripcion={m ? `${fecha(m.fecha + "T12:00:00")} · ${m.descripcion || "—"} · ${moneda(m.monto)}` : ""}
      pie={
        <>
          <span className={cn("mr-auto text-sm", diferencia === 0 ? "text-exito" : "text-texto-2")}>
            {diferencia === 0 ? "Cuadra" : `Diferencia: ${moneda(diferencia)}`}
          </span>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            cargando={guardar.isPending}
            disabled={(elegidas.size === 0 && !nota.trim()) || (diferencia !== 0 && ajuste === "otro" && !nota.trim())}
            onClick={() => guardar.mutate()}
          >
            Conciliar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-texto-2">Marca los registros de MEDORA que forman este movimiento del banco.</p>
        {partidas.isLoading ? (
          <FilasEsqueleto />
        ) : candidatas.length === 0 ? (
          <p className="rounded-xl bg-superficie-2 px-3 py-2.5 text-sm text-texto-3">
            No hay registros sin conciliar en esas fechas. Si es un depósito de efectivo, una comisión u otro cargo, concílialo como ajuste con una nota.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-borde overflow-y-auto rounded-xl border border-borde">
            {candidatas.map((p) => {
              const marcada = elegidas.has(clave(p));
              return (
                <li key={clave(p)}>
                  <button
                    type="button"
                    onClick={() => {
                      const n = new Set(elegidas);
                      if (marcada) n.delete(clave(p));
                      else n.add(clave(p));
                      setElegidas(n);
                    }}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-superficie-2", marcada && "bg-marca-suave")}
                  >
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded border", marcada ? "border-marca bg-marca text-white" : "border-borde-fuerte")}>
                      {marcada && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="w-20 shrink-0 text-xs text-texto-3">{fecha(p.fecha + "T12:00:00")}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-texto-3">{TIPO_PARTIDA[p.tipo] ?? p.tipo} · </span>
                      {p.descripcion}
                    </span>
                    <span className="shrink-0 text-xs text-texto-3">{p.metodo}</span>
                    <span className="w-24 shrink-0 text-right tabular">{moneda(p.monto)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {diferencia !== 0 && (
          <div className="space-y-3 rounded-xl border border-borde p-3">
            <Selector etiqueta="La diferencia es…" value={ajuste} onChange={(e) => setAjuste(e.target.value as "comision" | "otro")}>
              <option value="comision">Comisión bancaria</option>
              <option value="otro">Otro motivo (depósito de efectivo, cargo, etc.)</option>
            </Selector>
          </div>
        )}
        <AreaTexto etiqueta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={diferencia !== 0 && ajuste === "otro" ? "Obligatoria: explica la diferencia" : "Opcional"} />
      </div>
    </Modal>
  );
}
