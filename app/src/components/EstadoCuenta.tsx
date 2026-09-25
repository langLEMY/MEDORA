import { useQuery } from "@tanstack/react-query";
import { datos, supabase } from "@/lib/supabase";
import { fecha, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Documento, EncabezadoDocumento, TablaDocumento } from "./Documento";
import { Esqueleto } from "./ui/superficies";

interface Estado {
  movimientos: { fecha: string; tipo: "cargo" | "abono"; documento: string; descripcion: string; cargo: number; abono: number }[];
  saldo: number;
  anticipos: { fecha: string; numero: string; monto: number; metodo: string }[];
  saldo_anticipos: number;
}

export interface ContactoCuenta {
  tipo: "paciente" | "aseguradora";
  id: string;
  nombre: string;
  detalle?: string;
}

/** Estado de cuenta por contacto (paciente o ARS), exportable a PDF. */
export function EstadoCuenta({ contacto, onCerrar }: { contacto: ContactoCuenta | null; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const q = useQuery({
    queryKey: ["estado-cuenta", sistemaId, contacto?.tipo, contacto?.id],
    enabled: !!contacto,
    queryFn: async () =>
      datos(await supabase.rpc("estado_cuenta", { p_sistema: sistemaId, p_tipo: contacto!.tipo, p_contacto: contacto!.id })) as unknown as Estado,
  });

  let saldo = 0;
  const filas = (q.data?.movimientos ?? []).map((m) => {
    saldo += Number(m.cargo) - Number(m.abono);
    return [
      fecha(m.fecha + "T00:00:00"),
      m.documento,
      m.descripcion,
      Number(m.cargo) ? moneda(m.cargo, sistema.moneda) : "",
      Number(m.abono) ? moneda(m.abono, sistema.moneda) : "",
      moneda(saldo, sistema.moneda),
    ];
  });

  return (
    <Documento
      abierto={!!contacto}
      onCerrar={onCerrar}
      titulo={`Estado de cuenta · ${contacto?.nombre ?? ""}`}
      nombreArchivo={`Estado de cuenta - ${contacto?.nombre ?? ""}`}
    >
      <EncabezadoDocumento
        titulo="Estado de cuenta"
        subtitulo={
          <>
            {contacto?.tipo === "aseguradora" ? "Aseguradora" : "Paciente"}: <b>{contacto?.nombre}</b>
            {contacto?.detalle && <> · {contacto.detalle}</>}
          </>
        }
      />
      {q.isLoading ? (
        <Esqueleto className="h-40" />
      ) : (
        <>
          <TablaDocumento
            encabezados={["Fecha", "Documento", "Descripción", "Cargo", "Abono", "Saldo"]}
            filas={filas.length ? filas : [["", "", "Sin movimientos", "", "", ""]]}
            pie={["", "", "Saldo pendiente", "", "", moneda(q.data?.saldo ?? 0, sistema.moneda)]}
          />
          {contacto?.tipo === "paciente" && (q.data?.anticipos.length ?? 0) > 0 && (
            <div className="mt-6">
              <p className="mb-2 font-semibold">Anticipos recibidos</p>
              <TablaDocumento
                encabezados={["Fecha", "Número", "Método", "Monto"]}
                filas={q.data!.anticipos.map((a) => [fecha(a.fecha + "T00:00:00"), a.numero, a.metodo, moneda(a.monto, sistema.moneda)])}
                pie={["", "", "Saldo a favor disponible", moneda(q.data!.saldo_anticipos, sistema.moneda)]}
              />
            </div>
          )}
        </>
      )}
    </Documento>
  );
}
