import { FileDown, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { exportarPdf, imprimir } from "@/lib/escritorio";
import { fechaHora } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Boton } from "./ui/boton";
import { Modal } from "./ui/modal";

/**
 * Documento imprimible / exportable a PDF (recibos, comprobantes, estados de
 * cuenta, reportes). Mientras está abierto, su contenido se monta también en
 * .area-impresion: al imprimir o exportar solo sale el documento (ver index.css).
 */
export function Documento({
  abierto,
  onCerrar,
  titulo,
  nombreArchivo,
  formato = "carta",
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  nombreArchivo: string;
  formato?: "carta" | "ticket";
  children: ReactNode;
}) {
  const hoja = (
    <div
      className={
        formato === "ticket"
          ? "mx-auto max-w-[320px] bg-white font-mono text-[12px] leading-relaxed text-black"
          : "mx-auto max-w-[780px] bg-white text-[12.5px] leading-relaxed text-[#101828] [&_table]:w-full [&_td]:py-1.5 [&_th]:py-1.5"
      }
    >
      {children}
    </div>
  );

  return (
    <>
      <Modal
        abierto={abierto}
        onCerrar={onCerrar}
        ancho={formato === "ticket" ? "sm" : "xl"}
        titulo={titulo}
        pie={
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cerrar
            </Boton>
            <Boton variante="secundario" icono={<FileDown className="size-4" />} onClick={() => exportarPdf(nombreArchivo)}>
              Exportar PDF
            </Boton>
            <Boton icono={<Printer className="size-4" />} onClick={() => imprimir()}>
              Imprimir
            </Boton>
          </>
        }
      >
        <div className="rounded-xl bg-white p-6 shadow-inner ring-1 ring-borde">{hoja}</div>
      </Modal>
      {abierto && createPortal(<div className="area-impresion hidden">{hoja}</div>, document.body)}
    </>
  );
}

/** Encabezado estándar con los datos del sistema hospitalario. */
export function EncabezadoDocumento({ titulo, subtitulo }: { titulo: string; subtitulo?: ReactNode }) {
  const { sistema } = useSistema();
  return (
    <div className="mb-5 flex items-start justify-between gap-6 border-b-2 border-[#101828] pb-3">
      <div>
        <p className="text-[16px] font-bold">{sistema.nombre}</p>
        <p className="text-[11px] text-[#475467]">Generado el {fechaHora(new Date())}</p>
      </div>
      <div className="text-right">
        <p className="text-[15px] font-semibold uppercase tracking-wide">{titulo}</p>
        {subtitulo && <div className="text-[11px] text-[#475467]">{subtitulo}</div>}
      </div>
    </div>
  );
}

export function TablaDocumento({ encabezados, filas, pie }: { encabezados: ReactNode[]; filas: ReactNode[][]; pie?: ReactNode[] }) {
  return (
    <table className="border-collapse">
      <thead>
        <tr className="border-b border-[#98a2b3] text-left text-[11px] uppercase tracking-wide text-[#475467]">
          {encabezados.map((e, i) => (
            <th key={i} className={i > 0 && typeof e === "string" && /monto|total|debe|haber|saldo|cargo|abono|neto|bruto|afp|sfs|isr|pend|gener|liquid/i.test(e) ? "text-right" : ""}>
              {e}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-[#eaecf0] align-top">
            {f.map((c, j) => (
              <td key={j} className={typeof c === "string" && /^-?RD\$|^-?\$|^-?[\d,.]+$/.test(c) ? "text-right tabular-nums" : ""}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {pie && (
        <tfoot>
          <tr className="border-t-2 border-[#101828] font-semibold">
            {pie.map((c, j) => (
              <td key={j} className={typeof c === "string" && /^-?RD\$|^-?\$|^-?[\d,.]+$/.test(c) ? "text-right tabular-nums" : ""}>
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
