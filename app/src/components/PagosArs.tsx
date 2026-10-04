import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Upload } from "lucide-react";
import { useState } from "react";
import { ImportarExcel } from "@/components/ImportarExcel";
import { Boton } from "@/components/ui/boton";
import { Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Insignia, Tarjeta } from "@/components/ui/superficies";
import { claves, useAseguradoras } from "@/lib/consultas";
import { IMPORTACIONES } from "@/lib/importaciones";
import { datos, supabase } from "@/lib/supabase";
import { fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Pagos de ARS: la ARS (SENASA primero) paga por lote y envía la relación de
 * autorizaciones pagadas. Se importa en Excel y cada pago se abona solo a la
 * cuenta por cobrar de su autorización; lo no pagado queda como glosa.
 */
export function BotonPagoArs() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const aseguradoras = useAseguradoras(sistemaId);
  const [paso, setPaso] = useState<"cerrado" | "datos" | "archivo">("cerrado");
  const [f, setF] = useState({ aseguradora: "", referencia: "", fecha: isoDia() });

  const abrir = () => {
    const senasa = aseguradoras.data?.find((a) => a.nombre.toLowerCase().startsWith("senasa"));
    setF({ aseguradora: senasa?.id ?? aseguradoras.data?.[0]?.id ?? "", referencia: "", fecha: isoDia() });
    setPaso("datos");
  };

  return (
    <>
      <Boton tamano="sm" variante="secundario" icono={<Upload className="size-3.5" />} onClick={abrir}>
        Importar pago de ARS
      </Boton>
      <Modal
        abierto={paso === "datos"}
        onCerrar={() => setPaso("cerrado")}
        ancho="sm"
        titulo="Importar pago de ARS"
        descripcion="Datos del pago recibido; después eliges el Excel con la relación de autorizaciones pagadas."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setPaso("cerrado")}>
              Cancelar
            </Boton>
            <Boton disabled={!f.aseguradora || !f.referencia.trim()} onClick={() => setPaso("archivo")}>
              Continuar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <Selector etiqueta="Aseguradora" value={f.aseguradora} onChange={(e) => setF({ ...f, aseguradora: e.target.value })}>
            {(aseguradoras.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
          <p className="-mt-2 text-xs text-texto-3">Los planes de una misma ARS (SENASA Contributivo, Subsidiado, Pensionado…) se concilian juntos.</p>
          <Entrada etiqueta="Referencia del pago" placeholder="Número de transferencia o de la relación" value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} />
          <Entrada etiqueta="Fecha del pago" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </div>
      </Modal>
      <ImportarExcel
        definicion={IMPORTACIONES.pagosArs}
        abierto={paso === "archivo"}
        onCerrar={() => setPaso("cerrado")}
        onListo={() => {
          void qc.invalidateQueries({ queryKey: claves.caja(sistemaId) });
          void qc.invalidateQueries({ queryKey: ["pagos-ars", sistemaId] });
        }}
        extra={{ p_aseguradora: f.aseguradora, p_referencia: f.referencia.trim(), p_fecha: f.fecha }}
      />
    </>
  );
}

/** Últimos pagos de ARS importados, con lo aplicado y lo glosado. */
export function PagosArsRecibidos() {
  const { sistemaId } = useSistema();
  const q = useQuery({
    queryKey: ["pagos-ars", sistemaId],
    queryFn: async () =>
      datos(await supabase.from("ars_pagos_resumen").select("*").eq("sistema_id", sistemaId).order("fecha", { ascending: false }).limit(10)) ?? [],
  });
  if (!q.data?.length) return null;
  return (
    <Tarjeta className="mt-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-borde px-5 py-3">
        <HandCoins className="size-4 text-texto-3" />
        <h3 className="text-sm font-semibold">Pagos de ARS recibidos</h3>
      </div>
      <ul className="divide-y divide-borde">
        {q.data.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
            <span className="w-24 text-texto-3">{fecha((l.fecha ?? "") + "T12:00:00")}</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{l.aseguradora}</span> · <span className="font-mono text-xs">{l.referencia}</span>
            </span>
            <span className="tabular">Pagado {moneda(l.pagado)}</span>
            <span className="tabular text-exito">Aplicado {moneda(l.aplicado)}</span>
            {Number(l.glosado) > 0 && <span className="tabular text-aviso">Glosa {moneda(l.glosado)}</span>}
            {Number(l.sin_cobro) > 0 && <Insignia tono="peligro">{l.sin_cobro} sin cobro</Insignia>}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
