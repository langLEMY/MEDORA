/**
 * CIE-10 (OPS/OMS), la clasificación que usa Salud Pública en RD. Los diagnósticos se
 * guardan como texto «CÓDIGO · Descripción» (p. ej. «I10 · Hipertensión esencial
 * (primaria)»): se lee igual en la historia, el impreso y el FHIR, y el código se
 * recupera con codigoCie10().
 */
export interface Cie10 {
  codigo: string;
  descripcion: string;
  capitulo: string | null;
}

export const SEPARADOR_CIE10 = " · ";

export const formatoCie10 = (c: Pick<Cie10, "codigo" | "descripcion">) => `${c.codigo}${SEPARADOR_CIE10}${c.descripcion}`;

/** Código CIE-10 al inicio de un diagnóstico guardado, o null si es texto libre (registros viejos). */
export function codigoCie10(texto?: string | null): string | null {
  const m = /^([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,2})?)(?:\s|$)/.exec((texto ?? "").trim());
  return m ? m[1] : null;
}
