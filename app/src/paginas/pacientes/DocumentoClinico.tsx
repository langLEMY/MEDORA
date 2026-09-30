import { Documento, EncabezadoDocumento } from "@/components/Documento";
import { fecha } from "@/lib/utils";

/** Un renglón de receta (medicamento, estudio, vacuna…). */
export interface ItemReceta {
  nombre: string;
  detalle?: string; // dosis / presentación / cantidad
  indicaciones?: string;
}

export interface MedicoFirma {
  nombre?: string;
  especialidad?: string;
  exequatur?: string;
}

/** Tipos de la historia que se imprimen como documento formal para el paciente. */
export const TIPOS_DOCUMENTO = ["receta", "certificado", "referimiento", "orden"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const esDocumento = (t: string): t is TipoDocumento => (TIPOS_DOCUMENTO as readonly string[]).includes(t);

const TITULO: Record<TipoDocumento, string> = {
  receta: "Receta médica",
  certificado: "Certificado médico",
  referimiento: "Referimiento",
  orden: "Orden médica",
};

/**
 * Documento clínico imprimible (media carta) con el membrete del hospital y la
 * firma del médico (nombre, especialidad y exequátur). La receta muestra sus
 * renglones; los demás, el texto redactado.
 */
export function DocumentoClinico({
  abierto,
  onCerrar,
  tipo,
  titulo,
  contenido,
  items,
  medico,
  paciente,
  fechaEntrada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  tipo: TipoDocumento;
  titulo?: string | null;
  contenido?: string;
  items?: ItemReceta[];
  medico?: MedicoFirma | null;
  paciente: string;
  fechaEntrada: string;
}) {
  return (
    <Documento abierto={abierto} onCerrar={onCerrar} titulo={TITULO[tipo]} nombreArchivo={`${TITULO[tipo]} ${paciente}`}>
      <EncabezadoDocumento titulo={titulo?.trim() || TITULO[tipo]} subtitulo={fecha(fechaEntrada)} />

      <p className="mb-4">
        <span className="text-[#475467]">Paciente:</span> <b>{paciente}</b>
      </p>

      {tipo === "receta" ? (
        <ol className="mb-6 space-y-3">
          {(items ?? []).map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-bold">{i + 1}.</span>
              <div>
                <p className="font-semibold">
                  {it.nombre}
                  {it.detalle ? <span className="font-normal"> — {it.detalle}</span> : null}
                </p>
                {it.indicaciones && <p className="text-[#475467]">{it.indicaciones}</p>}
              </div>
            </li>
          ))}
          {contenido?.trim() && <li className="whitespace-pre-wrap text-[#475467]">{contenido}</li>}
        </ol>
      ) : (
        <p className="mb-8 leading-relaxed whitespace-pre-wrap">{contenido}</p>
      )}

      <div className="mt-16 flex justify-end">
        <div className="w-64 border-t border-[#101828] pt-1 text-center text-[0.75rem]">
          <p className="font-semibold">{medico?.nombre || "Médico tratante"}</p>
          {medico?.especialidad && <p className="text-[#475467]">{medico.especialidad}</p>}
          {medico?.exequatur ? <p className="text-[#475467]">Exequátur {medico.exequatur}</p> : <p className="text-[#475467]">Firma y sello</p>}
        </div>
      </div>
    </Documento>
  );
}
