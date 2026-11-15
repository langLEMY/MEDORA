/**
 * Naturaleza de la institución (fundaciones, ASFL Ley 122-05).
 * El TIPO DE SEDE (lib/capacidades) dice qué servicios se dan; la NATURALEZA dice
 * cómo se financia. Espejo de la migración 20261114150000_fundaciones.
 */
export type Naturaleza = "privada" | "fundacion" | "publica";

export const ETIQUETA_NATURALEZA: Record<Naturaleza, string> = {
  privada: "Privada",
  fundacion: "Fundación (sin fines de lucro)",
  publica: "Pública",
};
