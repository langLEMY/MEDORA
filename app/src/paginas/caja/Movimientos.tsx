import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { METODOS_PAGO } from "@/lib/consultas";
import { datos, mensajeError, supabase, type MetodoPago } from "@/lib/supabase";
import { useSistema } from "@/sesion/SesionProvider";
import { METODOS_DINERO } from "./comun";

// Cada categoría va a su cuenta contable (privado.asentar_movimiento); el depósito pasa la caja al banco.
export const CATEGORIAS_MOVIMIENTO: Record<string, string> = {
  general: "General",
  suministros: "Suministros",
  servicios: "Servicios",
  mantenimiento: "Mantenimiento",
  deposito: "Depósito al banco",
  // Solo la crea pagar_liquidacion (Comisiones → Liquidaciones y pagos); no se elige aquí.
  pago_comision: "Pago de comisiones",
  reembolso: "Reembolso",
  otro: "Otro",
};
const CATEGORIAS_POR_TIPO = {
  egreso: ["general", "suministros", "servicios", "mantenimiento", "deposito", "otro"],
  ingreso: ["general", "reembolso", "otro"],
};

export function NuevoMovimiento({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const { sistemaId } = useSistema();
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState("general");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const deposito = categoria === "deposito";

  useEffect(() => {
    if (abierto) {
      setConcepto("");
      setMonto("");
    }
  }, [abierto]);

  useEffect(() => {
    if (!CATEGORIAS_POR_TIPO[tipo].includes(categoria)) setCategoria("general");
  }, [tipo, categoria]);

  useEffect(() => {
    if (deposito) setMetodo("efectivo");
  }, [deposito]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_movimiento", {
          p_sistema: sistemaId,
          p_tipo: tipo,
          p_concepto: concepto,
          p_monto: Number(monto),
          p_metodo: metodo,
          p_categoria: categoria,
        }),
      ),
    onSuccess: () => {
      toast.success("Movimiento registrado");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Registrar movimiento de caja"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!concepto.trim() || !(Number(monto) > 0)} onClick={() => m.mutate()}>
            Registrar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Segmentado
          id="tipo-mov"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: "egreso", etiqueta: "Egreso" },
            { valor: "ingreso", etiqueta: "Ingreso" },
          ]}
        />
        <Entrada
          etiqueta="Concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={deposito ? "Ej. Depósito en Banreservas" : "Ej. Pago de mensajería"}
        />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Selector etiqueta="Método" value={metodo} disabled={deposito} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_DINERO.map((x) => (
              <option key={x} value={x}>
                {METODOS_PAGO[x]}
              </option>
            ))}
          </Selector>
        </div>
        <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS_POR_TIPO[tipo].map((c) => (
            <option key={c} value={c}>
              {CATEGORIAS_MOVIMIENTO[c]}
            </option>
          ))}
        </Selector>
        {deposito && (
          <p className="text-xs text-texto-3">Sale el efectivo de la caja y entra al banco. No cuenta como gasto.</p>
        )}
      </div>
    </Modal>
  );
}
