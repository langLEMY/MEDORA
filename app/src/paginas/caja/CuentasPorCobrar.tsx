import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotonPagoArs, PagosArsRecibidos } from "@/components/PagosArs";
import { EstadoCuenta, type ContactoCuenta } from "@/components/EstadoCuenta";
import { Boton } from "@/components/ui/boton";
import { Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Esqueleto, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, METODOS_PAGO, useAseguradoras } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type MetodoPago } from "@/lib/supabase";
import { fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { type Comprobante } from "./Anticipos";
import { METODOS_DINERO } from "./comun";

// ---------------------------------------------------------------------------
// Cuentas por cobrar
// ---------------------------------------------------------------------------
interface Cxc {
  cobro_id: string;
  numero: string;
  ncf: string | null;
  creado_en: string;
  paciente_id: string;
  aseguradora_id: string | null;
  numero_autorizacion: string | null;
  pendiente_paciente: number;
  pendiente_aseguradora: number;
}

export function CuentasPorCobrar({ onComprobante }: { onComprobante: (c: Comprobante) => void }) {
  const { sistemaId, roles } = useSistema();
  const [deudor, setDeudor] = useState<"paciente" | "aseguradora">("paciente");
  const [abonar, setAbonar] = useState<{ cxc: Cxc; nombre: string } | null>(null);
  const [estado, setEstado] = useState<ContactoCuenta | null>(null);
  const aseguradoras = useAseguradoras(sistemaId);

  const q = useQuery({
    queryKey: [...claves.caja(sistemaId), "cxc"],
    queryFn: async () => {
      const filas = (datos(await supabase.from("cuentas_por_cobrar").select("*").eq("sistema_id", sistemaId).order("creado_en")) ?? []) as unknown as Cxc[];
      const ids = [...new Set(filas.map((f) => f.paciente_id))];
      const pacientes = ids.length
        ? (datos(await supabase.from("pacientes").select("id, nombres, apellidos, expediente").in("id", ids)) ?? [])
        : [];
      return { filas, pacientes: new Map(pacientes.map((p) => [p.id, p])) };
    },
  });

  const pendientes = (q.data?.filas ?? []).filter((f) => (deudor === "paciente" ? Number(f.pendiente_paciente) : Number(f.pendiente_aseguradora)) > 0.004);
  const grupos = new Map<string, Cxc[]>();
  pendientes.forEach((f) => {
    const k = deudor === "paciente" ? f.paciente_id : (f.aseguradora_id ?? "");
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  });
  const nombreDe = (k: string) => {
    if (deudor === "paciente") {
      const p = q.data?.pacientes.get(k);
      return p ? `${p.nombres} ${p.apellidos}` : "Paciente";
    }
    return aseguradoras.data?.find((a) => a.id === k)?.nombre ?? "Aseguradora";
  };
  const pend = (f: Cxc) => Number(deudor === "paciente" ? f.pendiente_paciente : f.pendiente_aseguradora);
  const total = pendientes.reduce((s, f) => s + pend(f), 0);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Segmentado
          id="cxc-deudor"
          valor={deudor}
          onChange={setDeudor}
          opciones={[
            { valor: "paciente", etiqueta: "Pacientes" },
            { valor: "aseguradora", etiqueta: "Aseguradoras (ARS)" },
          ]}
        />
        <div className="flex items-center gap-3">
          {deudor === "aseguradora" && puedeEscribir.abonos(roles) && <BotonPagoArs />}
          <p className="text-sm text-texto-2">
            Total por cobrar: <span className="font-semibold text-texto tabular">{moneda(total)}</span>
          </p>
        </div>
      </div>
      <Tarjeta className="overflow-hidden">
        {q.isLoading ? (
          <Esqueleto className="m-5 h-40" />
        ) : grupos.size === 0 ? (
          <Vacio icono={<FileText />} titulo="Nada pendiente" descripcion={deudor === "paciente" ? "Ningún paciente tiene saldo a crédito." : "No hay coberturas de ARS pendientes de cobro."} />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {[...grupos.entries()].map(([k, fs]) => (
              <motion.li key={k} variants={itemEscalonado} className="px-5 py-3.5">
                <div className="mb-2 flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombreDe(k)}</span>
                  <span className="text-sm font-semibold tabular">{moneda(fs.reduce((s, f) => s + pend(f), 0))}</span>
                  <Boton
                    tamano="sm"
                    variante="secundario"
                    icono={<FileText className="size-3.5" />}
                    onClick={() => setEstado({ tipo: deudor, id: k, nombre: nombreDe(k), detalle: deudor === "paciente" ? q.data?.pacientes.get(k)?.expediente : undefined })}
                  >
                    Estado de cuenta
                  </Boton>
                </div>
                <ul className="space-y-1">
                  {fs.map((f) => (
                    <li key={f.cobro_id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-superficie-2/60">
                      <span className="w-28 tabular text-texto-2">{f.ncf ?? f.numero}</span>
                      <span className="w-24 text-texto-3">{fecha(f.creado_en)}</span>
                      {deudor === "aseguradora" && (
                        <span className="min-w-0 flex-1 truncate text-texto-2">
                          {q.data?.pacientes.get(f.paciente_id)?.nombres} {q.data?.pacientes.get(f.paciente_id)?.apellidos}
                          {f.numero_autorizacion ? ` · Aut. ${f.numero_autorizacion}` : ""}
                        </span>
                      )}
                      <span className="ml-auto w-28 text-right font-medium tabular">{moneda(pend(f))}</span>
                      {puedeEscribir.abonos(roles) && (
                        <Boton tamano="sm" variante="suave" onClick={() => setAbonar({ cxc: f, nombre: nombreDe(k) })}>
                          Abonar
                        </Boton>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>
      {deudor === "aseguradora" && <PagosArsRecibidos />}
      <Abonar
        datos_={abonar}
        deudor={deudor}
        pendiente={abonar ? pend(abonar.cxc) : 0}
        onCerrar={() => setAbonar(null)}
        onListo={onComprobante}
      />
      <EstadoCuenta contacto={estado} onCerrar={() => setEstado(null)} />
    </>
  );
}

function Abonar({
  datos_: d,
  deudor,
  pendiente,
  onCerrar,
  onListo,
}: {
  datos_: { cxc: Cxc; nombre: string } | null;
  deudor: "paciente" | "aseguradora";
  pendiente: number;
  onCerrar: () => void;
  onListo: (c: Comprobante) => void;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [fechaAb, setFechaAb] = useState(isoDia());

  useEffect(() => {
    if (!d) return;
    setMonto(pendiente.toFixed(2));
    setMetodo(deudor === "aseguradora" ? "transferencia" : "efectivo");
    setReferencia("");
    setFechaAb(isoDia());
  }, [d, pendiente, deudor]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_abono", {
          p_sistema: sistemaId,
          p_cobro: d!.cxc.cobro_id,
          p_deudor: deudor,
          p_monto: Number(monto),
          p_metodo: metodo,
          p_referencia: referencia || undefined,
          p_fecha: fechaAb,
        }),
      ) as { numero: string },
    onSuccess: (r) => {
      toast.success(`Abono ${r.numero} registrado`);
      void qc.invalidateQueries({ queryKey: claves.caja(sistemaId) });
      onCerrar();
      onListo({
        titulo: "Recibo de abono",
        numero: r.numero,
        fecha: fechaAb,
        monto: Number(monto),
        lineas: [
          [deudor === "paciente" ? "Paciente" : "Aseguradora", d!.nombre],
          ["Aplicado a", d!.cxc.ncf ?? d!.cxc.numero],
          ["Método", METODOS_PAGO[metodo]],
          ["Saldo restante", moneda(pendiente - Number(monto))],
        ],
      });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!d}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={`Abonar a ${d?.cxc.ncf ?? d?.cxc.numero ?? ""}`}
      descripcion={`${d?.nombre ?? ""} · pendiente ${moneda(pendiente)}`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!(Number(monto) > 0) || Number(monto) - pendiente > 0.004} onClick={() => m.mutate()}>
            Registrar abono
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Selector etiqueta="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
          {METODOS_DINERO.map((x) => (
            <option key={x} value={x}>
              {METODOS_PAGO[x]}
            </option>
          ))}
        </Selector>
        <Entrada etiqueta="Fecha del pago" type="date" max={isoDia()} value={fechaAb} onChange={(e) => setFechaAb(e.target.value)} />
        <Entrada etiqueta="Referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} disabled={metodo === "efectivo"} />
      </div>
    </Modal>
  );
}
