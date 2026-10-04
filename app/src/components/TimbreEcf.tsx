import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { datos, supabase } from "@/lib/supabase";
import { fechaHora } from "@/lib/utils";

/**
 * Timbre del comprobante electrónico en el recibo impreso: código QR de consulta en
 * la DGII, código de seguridad y fecha de firma. La firma la hace el servidor al
 * cobrar (o en el siguiente reintento): mientras tanto se consulta cada pocos segundos.
 */
export function TimbreEcf({ cobroId }: { cobroId: string }) {
  const doc = useQuery({
    queryKey: ["ecf-timbre", cobroId],
    queryFn: async () =>
      datos(await supabase.from("ecf_documentos").select("estado, codigo_seguridad, fecha_firma, qr_url").eq("cobro_id", cobroId).maybeSingle()),
    refetchInterval: (q) => (q.state.data?.qr_url || q.state.dataUpdateCount > 12 ? false : 3000),
  });
  const qr = useQuery({
    queryKey: ["ecf-qr", doc.data?.qr_url],
    enabled: !!doc.data?.qr_url,
    queryFn: async () => QRCode.toDataURL(doc.data!.qr_url!, { margin: 0, width: 220, errorCorrectionLevel: "M" }),
    staleTime: Infinity,
  });

  if (!doc.data) return null;
  if (!doc.data.qr_url) {
    return <p className="mt-2 text-center text-[0.6875rem]">Comprobante electrónico en proceso de firma…</p>;
  }
  return (
    <div className="mt-2 flex flex-col items-center gap-1 text-center">
      {qr.data && <img src={qr.data} alt="Código QR de consulta en la DGII" className="size-28" />}
      <p>Código de seguridad: {doc.data.codigo_seguridad}</p>
      {doc.data.fecha_firma && <p>Fecha de firma: {fechaHora(doc.data.fecha_firma)}</p>}
      {doc.data.estado === "rechazado" && <p className="font-bold">*** RECHAZADO POR LA DGII ***</p>}
    </div>
  );
}
