import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Documento } from "@/components/Documento";
import { TimbreEcf } from "@/components/TimbreEcf";
import { Boton } from "@/components/ui/boton";
import { AreaTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { CATEGORIAS_SERVICIO, METODOS_PAGO, TIPOS_NCF } from "@/lib/consultas";
import { BloqueTurno, destinoTurno } from "@/components/TicketTurno";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { fechaHora, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { type CobroFila } from "./comun";

// ---------------------------------------------------------------------------
// Factura / recibo con ítems agrupados por categoría
// ---------------------------------------------------------------------------
export function Factura({ cobro, onCerrar }: { cobro: CobroFila | null; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const emisor = useQuery({
    queryKey: ["sistema", sistemaId, "membrete"],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      datos(await supabase.from("sistemas").select("razon_social, rnc, direccion, telefono").eq("id", sistemaId).single()),
  }).data;
  const [ultimo, setUltimo] = useState(cobro);
  useEffect(() => {
    if (cobro) setUltimo(cobro);
  }, [cobro]);
  const c = cobro ?? ultimo;
  if (!c) return null;

  const grupos = new Map<string, CobroFila["detalles"]>();
  (c.detalles ?? []).forEach((d) => grupos.set(d.categoria, [...(grupos.get(d.categoria) ?? []), d]));
  const linea = "my-2 border-dashed border-black/40";
  const pagado = (c.pagos ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const cobertura = Number(c.subtotal) > 0 ? Math.round((Number(c.cobertura_seguro) / Number(c.subtotal)) * 100) : 0;

  return (
    <Documento abierto={!!cobro} onCerrar={onCerrar} titulo={c.ncf ? `Factura ${c.ncf}` : `Recibo ${c.numero}`} nombreArchivo={`${c.ncf ?? c.numero} - ${c.paciente?.nombres} ${c.paciente?.apellidos}`} formato="ticket">
      {(sistema.logo_factura ?? sistema.logo_url) && <img src={(sistema.logo_factura ?? sistema.logo_url)!} alt="" className="mx-auto mb-1.5 max-h-20 w-auto" />}
      <p className="text-center text-[0.875rem] font-bold">{(emisor?.razon_social || sistema.nombre).toUpperCase()}</p>
      {emisor?.rnc && <p className="text-center">RNC {emisor.rnc}</p>}
      {emisor?.direccion && <p className="text-center">{emisor.direccion}</p>}
      {emisor?.telefono && <p className="text-center">Tel. {emisor.telefono}</p>}
      <hr className={linea} />
      {c.ncf ? (
        <>
          <p className="text-center font-bold">{TIPOS_NCF[c.tipo_ncf ?? ""]?.split(" · ")[1]?.toUpperCase() ?? "FACTURA"}</p>
          <p className="text-center">NCF: {c.ncf}</p>
        </>
      ) : (
        <p className="text-center">Recibo {c.numero}</p>
      )}
      <p className="text-center">{fechaHora(c.creado_en)}</p>
      <hr className={linea} />
      <p>
        Paciente: {c.paciente?.nombres} {c.paciente?.apellidos}
      </p>
      <p>Expediente: {c.paciente?.expediente}</p>
      {c.cliente_rnc && (
        <p>
          Cliente: {c.cliente_nombre ?? ""} · RNC {c.cliente_rnc}
        </p>
      )}
      {c.profesional && <p>Atendido por: {c.profesional.nombre_completo}</p>}
      <hr className={linea} />
      {[...grupos.entries()].map(([cat, ds]) => (
        <div key={cat} className="mb-1.5">
          <p className="font-bold">{(CATEGORIAS_SERVICIO[cat] ?? cat).toUpperCase()}</p>
          {ds.map((d, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="truncate">
                {Number(d.cantidad)} × {d.descripcion}
              </span>
              <span>{moneda(Number(d.precio_unitario) * Number(d.cantidad))}</span>
            </div>
          ))}
        </div>
      ))}
      <hr className={linea} />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{moneda(c.subtotal)}</span>
      </div>
      {c.aseguradora && (
        <>
          <div className="flex justify-between">
            <span>
              Cubre {c.aseguradora.nombre} ({cobertura}%)
            </span>
            <span>−{moneda(c.cobertura_seguro)}</span>
          </div>
          {c.numero_autorizacion && <p>Autorización: {c.numero_autorizacion}</p>}
        </>
      )}
      {Number(c.monto_fondo) > 0 && (
        <div className="flex justify-between">
          <span>Fondo interno de la fundación</span>
          <span>{moneda(c.monto_fondo)}</span>
        </div>
      )}
      {Number(c.descuento) > 0 && (
        <div className="flex justify-between">
          <span>Descuento</span>
          <span>−{moneda(c.descuento)}</span>
        </div>
      )}
      <div className="flex justify-between text-[0.875rem] font-bold">
        <span>TOTAL</span>
        <span>{moneda(c.total)}</span>
      </div>
      <hr className={linea} />
      {(c.pagos ?? []).map((p) => (
        <div key={p.metodo} className="flex justify-between">
          <span>
            {METODOS_PAGO[p.metodo]}
            {p.referencia ? ` · ${p.referencia}` : ""}
          </span>
          <span>{moneda(p.monto)}</span>
        </div>
      ))}
      <div className="flex justify-between">
        <span>Monto pagado</span>
        <span>{moneda(pagado)}</span>
      </div>
      {(c.pagos ?? [])
        .filter((p) => p.recibido && Number(p.recibido) > Number(p.monto))
        .map((p) => (
          <div key={`dev-${p.metodo}`}>
            <div className="flex justify-between">
              <span>Efectivo recibido</span>
              <span>{moneda(p.recibido)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Devuelta</span>
              <span>{moneda(Number(p.recibido) - Number(p.monto))}</span>
            </div>
          </div>
        ))}
      {Number(c.monto_credito) > 0 && (
        <div className="flex justify-between font-bold">
          <span>SALDO PENDIENTE</span>
          <span>{moneda(c.monto_credito)}</span>
        </div>
      )}
      {c.ncf?.startsWith("E") && <TimbreEcf cobroId={c.id} />}
      {c.anulacion?.length ? <p className="mt-2 text-center font-bold">*** ANULADO ***</p> : null}
      {c.cita?.turno && !c.anulacion?.length && <BloqueTurno turno={c.cita.turno} destino={destinoTurno(c.cita)} />}
      <hr className={linea} />
      <p className="text-center">Cajero: {c.cajero?.nombre_completo}</p>
      <p className="text-center">¡Gracias por confiar en nosotros!</p>
    </Documento>
  );
}

export function AnularCobro({ cobro, onCerrar, onListo }: { cobro: CobroFila | null; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const m = useMutation({
    mutationFn: async () => datos(await supabase.rpc("anular_cobro", { p_cobro: cobro!.id, p_motivo: motivo })),
    onSuccess: () => {
      toast.success("Cobro anulado");
      setMotivo("");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={!!cobro}
      onCerrar={onCerrar}
      ancho="sm"
      titulo={`Anular ${cobro?.numero ?? ""}`}
      descripcion="Se registran egresos compensatorios, se revierte el asiento y las comisiones. El cobro original se conserva."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Volver
          </Boton>
          <Boton variante="peligro" cargando={m.isPending} disabled={motivo.trim().length < 5} onClick={() => m.mutate()}>
            Anular cobro
          </Boton>
        </>
      }
    >
      <AreaTexto etiqueta="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </Modal>
  );
}
