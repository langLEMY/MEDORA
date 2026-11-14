import { Documento, EncabezadoDocumento } from "@/components/Documento";
import { fecha } from "@/lib/utils";
import { CAMPOS_TIPO, diasLicencia, FORMULARIO_POR_CLAVE, type CampoClinico } from "./catalogoClinico";

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
export const TIPOS_DOCUMENTO = ["receta", "certificado", "referimiento", "orden", "licencia", "consentimiento", "formulario"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/** ¿Se imprime? Los formularios, solo los marcados como imprimibles en el catálogo. */
export const esDocumento = (t: string, datos?: Record<string, unknown> | null): t is TipoDocumento =>
  (TIPOS_DOCUMENTO as readonly string[]).includes(t) && (t !== "formulario" || !!FORMULARIO_POR_CLAVE[String(datos?.formulario ?? "")]?.imprimible);

const TITULO: Record<TipoDocumento, string> = {
  receta: "Receta médica",
  certificado: "Certificado médico",
  referimiento: "Referimiento",
  orden: "Orden médica",
  licencia: "Licencia médica",
  consentimiento: "Consentimiento informado",
  formulario: "Formulario clínico",
};

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

/**
 * Documento clínico imprimible (media carta) con el membrete del hospital y la
 * firma del médico (nombre, especialidad y exequátur). La receta y la orden muestran
 * sus renglones; la licencia y el consentimiento se redactan con sus datos; el
 * formulario imprime sus campos.
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
  documentoPaciente,
  fechaEntrada,
  datos = {},
}: {
  abierto: boolean;
  onCerrar: () => void;
  tipo: TipoDocumento;
  titulo?: string | null;
  contenido?: string;
  items?: ItemReceta[];
  medico?: MedicoFirma | null;
  paciente: string;
  documentoPaciente?: string | null;
  fechaEntrada: string;
  datos?: Record<string, unknown>;
}) {
  const formulario = tipo === "formulario" ? FORMULARIO_POR_CLAVE[String(datos.formulario ?? "")] : undefined;
  const nombreDoc = formulario?.nombre ?? TITULO[tipo];

  return (
    <Documento abierto={abierto} onCerrar={onCerrar} titulo={nombreDoc} nombreArchivo={`${nombreDoc} ${paciente}`}>
      <EncabezadoDocumento titulo={titulo?.trim() || nombreDoc} subtitulo={fecha(fechaEntrada)} />

      <p className="mb-4">
        <span className="text-[#475467]">Paciente:</span> <b>{paciente}</b>
        {documentoPaciente && <span className="text-[#475467]"> · {documentoPaciente}</span>}
      </p>

      {tipo === "receta" || tipo === "orden" ? (
        <>
          {tipo === "orden" && (texto(datos.numero) || texto(datos.proveedor) || texto(datos.diagnostico)) && (
            <p className="mb-3 text-[#475467]">
              {texto(datos.numero) && <>No. de orden: <b className="text-[#101828]">{texto(datos.numero)}</b> </>}
              {texto(datos.proveedor) && <>· Proveedor: {texto(datos.proveedor)} </>}
              {texto(datos.diagnostico) && <>· Diagnóstico: {texto(datos.diagnostico)}</>}
            </p>
          )}
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
          </ol>
          {contenido?.trim() && tipo === "receta" && <p className="mb-6 whitespace-pre-wrap text-[#475467]">{contenido}</p>}
          {contenido?.trim() && tipo === "orden" && contenido.trim() !== (items ?? []).map((i) => i.nombre).join("\n") && (
            <p className="mb-6 whitespace-pre-wrap text-[#475467]">{contenido}</p>
          )}
        </>
      ) : tipo === "licencia" ? (
        <Licencia datos={datos} paciente={paciente} contenido={contenido} />
      ) : tipo === "consentimiento" ? (
        <Consentimiento datos={datos} paciente={paciente} contenido={contenido} />
      ) : tipo === "formulario" && formulario ? (
        <>
          <Campos campos={formulario.campos} datos={datos} />
          {contenido?.trim() && <p className="mb-6 whitespace-pre-wrap">{contenido}</p>}
        </>
      ) : (
        <p className="mb-8 leading-relaxed whitespace-pre-wrap">{contenido}</p>
      )}

      {tipo !== "consentimiento" && <Firma medico={medico} />}
    </Documento>
  );
}

function Firma({ medico, etiqueta }: { medico?: MedicoFirma | null; etiqueta?: string }) {
  return (
    <div className="mt-16 flex justify-end">
      <div className="w-64 border-t border-[#101828] pt-1 text-center text-[0.75rem]">
        <p className="font-semibold">{medico?.nombre || etiqueta || "Médico tratante"}</p>
        {medico?.especialidad && <p className="text-[#475467]">{medico.especialidad}</p>}
        {medico?.exequatur ? <p className="text-[#475467]">Exequátur {medico.exequatur}</p> : <p className="text-[#475467]">Firma y sello</p>}
      </div>
    </div>
  );
}

function Campos({ campos, datos }: { campos: CampoClinico[]; datos: Record<string, unknown> }) {
  const presentes = campos.filter((c) => texto(datos[c.clave]));
  return (
    <dl className="mb-6 space-y-2.5">
      {presentes.map((c) => (
        <div key={c.clave}>
          <dt className="text-[0.6875rem] font-semibold tracking-wide text-[#475467] uppercase">{c.etiqueta}</dt>
          <dd className="whitespace-pre-wrap">{c.tipo === "fecha" ? fecha(texto(datos[c.clave])) : texto(datos[c.clave])}</dd>
        </div>
      ))}
    </dl>
  );
}

function Licencia({ datos, paciente, contenido }: { datos: Record<string, unknown>; paciente: string; contenido?: string }) {
  const dias = diasLicencia(datos.desde, datos.hasta);
  const desde = texto(datos.desde);
  const hasta = texto(datos.hasta);
  return (
    <div className="mb-6 space-y-3 leading-relaxed">
      <p>
        Por medio de la presente se hace constar que <b>{paciente}</b> requiere licencia médica
        {dias ? (
          <>
            {" "}por <b>{dias} {dias === 1 ? "día" : "días"}</b>
          </>
        ) : null}
        {desde && <>, desde el <b>{fecha(desde)}</b></>}
        {hasta && <> hasta el <b>{fecha(hasta)}</b></>}
        {texto(datos.reposo) && <>, con reposo <b>{texto(datos.reposo).toLowerCase()}</b></>}
        {texto(datos.diagnostico) && <>, por {texto(datos.diagnostico)}</>}.
      </p>
      {texto(datos.tipo_licencia) && <p className="text-[#475467]">Tipo de licencia: {texto(datos.tipo_licencia)}</p>}
      {contenido?.trim() && <p className="whitespace-pre-wrap">{contenido}</p>}
    </div>
  );
}

function Consentimiento({ datos, paciente, contenido }: { datos: Record<string, unknown>; paciente: string; contenido?: string }) {
  const representante = texto(datos.responsable);
  const esRepresentante = representante && !/propio|mismo|paciente/i.test(representante);
  const bloques = (CAMPOS_TIPO.consentimiento ?? []).filter((c) => ["beneficios", "riesgos", "alternativas"].includes(c.clave) && texto(datos[c.clave]));
  return (
    <div className="mb-6 space-y-3 leading-relaxed">
      <p>
        Yo, <b>{esRepresentante ? representante : paciente}</b>
        {esRepresentante && (
          <>
            , en calidad de {texto(datos.parentesco) || "representante"} de <b>{paciente}</b>
          </>
        )}
        , declaro que el personal médico me explicó en lenguaje claro el procedimiento
        {texto(datos.procedimiento) && (
          <>
            {" "}<b>{texto(datos.procedimiento)}</b>
          </>
        )}
        , sus beneficios, riesgos y alternativas, que pude hacer preguntas y que me fueron respondidas. Autorizo su realización y sé que
        puedo retirar este consentimiento en cualquier momento antes del procedimiento.
      </p>
      {bloques.map((c) => (
        <div key={c.clave}>
          <p className="text-[0.6875rem] font-semibold tracking-wide text-[#475467] uppercase">{c.etiqueta}</p>
          <p className="whitespace-pre-wrap">{texto(datos[c.clave])}</p>
        </div>
      ))}
      {contenido?.trim() && <p className="whitespace-pre-wrap">{contenido}</p>}
      <div className="grid grid-cols-3 gap-6 pt-16 text-center text-[0.75rem]">
        {[esRepresentante ? `${representante} (representante)` : paciente, "Médico tratante", texto(datos.testigo) || "Testigo"].map((n) => (
          <div key={n} className="border-t border-[#101828] pt-1">
            <p className="font-semibold">{n}</p>
            <p className="text-[#475467]">Firma y cédula</p>
          </div>
        ))}
      </div>
    </div>
  );
}
