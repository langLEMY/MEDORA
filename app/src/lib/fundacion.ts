/**
 * Naturaleza de la institución y tarifa social (fundaciones, ASFL Ley 122-05).
 * El TIPO DE SEDE (lib/capacidades) dice qué servicios se dan; la NATURALEZA dice
 * cómo se financia. Espejo de la migración 20261114150000_fundaciones.
 */
export type Naturaleza = "privada" | "fundacion" | "publica";

export const ETIQUETA_NATURALEZA: Record<Naturaleza, string> = {
  privada: "Privada",
  fundacion: "Fundación (sin fines de lucro)",
  publica: "Pública",
};

export type Categoria = "A" | "B" | "C" | "D";

export interface TarifaSocial {
  /** Ingreso por persona del hogar (RD$/mes): por debajo del 1.º → D, del 2.º → C, del 3.º → B; si no, A. */
  umbrales: [number, number, number];
  descuentos: Record<Categoria, number>;
  vigencia_meses: number;
}

export const TARIFA_SOCIAL_DEFECTO: TarifaSocial = {
  umbrales: [3000, 6000, 12000],
  descuentos: { A: 0, B: 25, C: 50, D: 100 },
  vigencia_meses: 12,
};

export const DESCRIPCION_CATEGORIA: Record<Categoria, string> = {
  A: "Paga tarifa completa",
  B: "Vulnerabilidad baja",
  C: "Vulnerabilidad media",
  D: "Vulnerabilidad alta",
};

/** Vista previa de la categoría (la definitiva la calcula registrar_estudio_socioeconomico). */
export function categoriaPorIngreso(ingreso: number, miembros: number, t: TarifaSocial = TARIFA_SOCIAL_DEFECTO): { perCapita: number; categoria: Categoria } | null {
  if (!(ingreso >= 0) || !(miembros >= 1)) return null;
  const perCapita = Math.round((ingreso / miembros) * 100) / 100;
  const [u1, u2, u3] = t.umbrales;
  const categoria: Categoria = perCapita < u1 ? "D" : perCapita < u2 ? "C" : perCapita < u3 ? "B" : "A";
  return { perCapita, categoria };
}

/** Descuento de la tarifa social sobre lo que paga el paciente (redondeado a centavos). */
export const descuentoTarifa = (aPagar: number, pct: number) => Math.round(Math.max(aPagar, 0) * Math.min(Math.max(pct, 0), 100)) / 100;
