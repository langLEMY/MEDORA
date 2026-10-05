// Cliente mínimo de la API de Claude para las Edge Functions de MEDORA.
// La clave (ANTHROPIC_API_KEY) es un secreto de la función: nunca llega a la app.
// Las respuestas estructuradas se piden con una herramienta forzada (tool_choice),
// así la salida siempre es JSON con la forma que esperamos.

export const MODELOS = {
  /** Rápido y barato: leer encabezados, clasificar, mapear columnas. */
  rapido: "claude-haiku-4-5-20251001",
  /** Para redactar y razonar (preguntas, resúmenes). */
  completo: "claude-sonnet-5-5",
} as const;

// US$ por millón de tokens (entrada, salida). Revisar en anthropic.com/pricing si cambian.
const PRECIOS: Record<string, [number, number]> = {
  [MODELOS.rapido]: [1, 5],
  [MODELOS.completo]: [2, 10],
};

// Sonnet 5.5 rechaza tool_choice forzado ("tool"/"any"): ahí va "auto" con la
// instrucción en el sistema (y la salida se valida igual). Haiku 4.5 sí lo acepta.
const ACEPTA_FORZADO = new Set<string>([MODELOS.rapido]);

export interface Herramienta {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Uso {
  modelo: string;
  entrada: number;
  salida: number;
  costo: number;
}

export class ErrorIa extends Error {
  constructor(mensaje: string, readonly uso?: Uso) {
    super(mensaje);
  }
}

/** Costo máximo posible de una llamada (para no pasarse del tope antes de hacerla). */
export function costoMaximo(modelo: string, entradaAprox: number, maxTokens: number): number {
  const [pe, ps] = PRECIOS[modelo] ?? [3, 15];
  return (entradaAprox * pe + maxTokens * ps) / 1_000_000;
}

/**
 * Llama a Claude y devuelve el input de la herramienta `herramienta` (JSON validado
 * por el esquema) más el uso. Si no hay herramienta, devuelve el texto.
 */
export async function pedirClaude<T = unknown>(op: {
  modelo: string;
  sistema: string;
  mensaje: string;
  herramienta?: Herramienta;
  maxTokens?: number;
  esperaMs?: number;
}): Promise<{ resultado: T; uso: Uso }> {
  const clave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!clave) throw new ErrorIa("La IA no está configurada en el servidor (falta ANTHROPIC_API_KEY).");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(op.esperaMs ?? 45_000),
    headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: op.modelo,
      max_tokens: op.maxTokens ?? 2048,
      system: op.herramienta && !ACEPTA_FORZADO.has(op.modelo) ? `${op.sistema}\n\nResponde siempre llamando a la herramienta "${op.herramienta.name}".` : op.sistema,
      messages: [{ role: "user", content: op.mensaje }],
      ...(op.herramienta
        ? ACEPTA_FORZADO.has(op.modelo)
          ? { tools: [op.herramienta], tool_choice: { type: "tool", name: op.herramienta.name } }
          : { tools: [op.herramienta], tool_choice: { type: "auto" } }
        : {}),
    }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = cuerpo?.error?.message ?? `Error ${r.status}`;
    throw new ErrorIa(r.status === 429 || r.status === 529 ? "La IA está ocupada; intenta de nuevo en un momento." : `La IA no respondió bien: ${msg}`);
  }

  const [pe, ps] = PRECIOS[op.modelo] ?? [3, 15];
  const entrada = cuerpo.usage?.input_tokens ?? 0;
  const salida = cuerpo.usage?.output_tokens ?? 0;
  const uso: Uso = { modelo: op.modelo, entrada, salida, costo: (entrada * pe + salida * ps) / 1_000_000 };

  const bloques = (cuerpo.content ?? []) as { type: string; text?: string; input?: unknown }[];
  if (op.herramienta) {
    const b = bloques.find((x) => x.type === "tool_use");
    if (!b) throw new ErrorIa("La IA no devolvió una respuesta con el formato esperado.", uso);
    return { resultado: b.input as T, uso };
  }
  return { resultado: bloques.filter((x) => x.type === "text").map((x) => x.text).join("\n") as T, uso };
}
