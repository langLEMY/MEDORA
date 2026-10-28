// Validación de lo que manda el laboratorio (aparte de index.ts para poder probarla).

export type Resultado = { prueba: string; valor?: string | number; unidad?: string; referencia?: string; bandera?: string };
const CAMPOS: Record<keyof Resultado, number> = { prueba: 150, valor: 100, unidad: 40, referencia: 150, bandera: 30 };

/** Una fila de resultado con solo los campos conocidos y recortados; null si no sirve. */
export function resultado(r: unknown): Resultado | null {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const fila: Record<string, string | number> = {};
  for (const [campo, max] of Object.entries(CAMPOS)) {
    const v = (r as Record<string, unknown>)[campo];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" && typeof v !== "number") return null;
    // Un número se guarda como número: la exportación FHIR lo da como cantidad con unidad.
    fila[campo] = typeof v === "number" && campo === "valor" && Number.isFinite(v) ? v : String(v).trim().slice(0, max);
  }
  return fila.prueba ? (fila as Resultado) : null;
}
