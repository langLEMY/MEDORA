// Edge Function: ia (inteligencia artificial de MEDORA, con la API de Claude).
//
//   { accion: "estado", sistema_id }   → si está disponible (y el gasto del mes para admin/superadmin)
//   { accion: "probar", sistema_id }   → llamada mínima para comprobar la conexión (superadmin)
//
// Reglas:
//   · Solo para hospitales con sistemas.ia_activa, y sin pasar del tope mensual.
//   · La IA propone; nunca escribe datos. Lo que devuelve se muestra para confirmar.
//   · Cada uso queda en ia_eventos (tokens y costo; nunca el contenido).
//   · Nada de pacientes ni datos clínicos va a la IA en estas funciones.
import { cumpleMfa, clienteServicio, cors, error, json, MFA_REQUERIDO } from "../_shared/comun.ts";
import { costoMaximo, ErrorIa, MODELOS, pedirClaude, type Herramienta, type Uso } from "../_shared/claude.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  const admin = clienteServicio();
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: sesion } = await admin.auth.getUser(token);
  if (!sesion?.user) return error("Sesión inválida.", 401);
  const usuarioId = sesion.user.id;

  let c: Record<string, unknown>;
  try {
    c = await req.json();
  } catch {
    return error("Cuerpo inválido.");
  }
  const sistemaId = String(c.sistema_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sistemaId)) return error("Falta el sistema.");

  const [{ data: perfil }, { data: membresia }, { data: sistema }] = await Promise.all([
    admin.from("perfiles").select("es_superadmin, activo").eq("id", usuarioId).single(),
    admin.from("membresias").select("roles, activo, eliminado_en").eq("sistema_id", sistemaId).eq("usuario_id", usuarioId).maybeSingle(),
    admin.from("sistemas").select("activo, ia_activa, ia_tope_mensual_usd").eq("id", sistemaId).maybeSingle(),
  ]);
  if (!perfil?.activo || !sistema?.activo) return error("Sin acceso.", 403);
  const esSuperadmin = perfil.es_superadmin === true && (await cumpleMfa(admin, token, usuarioId));
  const roles = membresia?.activo && !membresia.eliminado_en ? ((membresia.roles as string[]) ?? []) : [];
  if (perfil.es_superadmin && !esSuperadmin && !roles.length) return error(MFA_REQUERIDO, 403);
  if (!roles.length && !esSuperadmin) return error("Sin acceso a este hospital.", 403);
  const veGasto = esSuperadmin || roles.includes("admin");

  const tope = Number(sistema.ia_tope_mensual_usd ?? 0);
  const consumo = async () => Number((await admin.rpc("ia_consumo_mes", { p_sistema: sistemaId })).data ?? 0);

  /** Llama a la IA si el hospital la tiene activa y hay saldo del tope; registra el uso. */
  async function usar<T>(funcion: string, op: Parameters<typeof pedirClaude>[0]): Promise<T> {
    if (!sistema!.ia_activa) throw new ErrorIa("La IA no está activada para este hospital.");
    const maximo = costoMaximo(op.modelo, Math.ceil((op.sistema.length + op.mensaje.length) / 3), op.maxTokens ?? 2048);
    if ((await consumo()) + maximo > tope) throw new ErrorIa("Se alcanzó el tope mensual de IA de este hospital.");
    let uso: Uso | undefined;
    try {
      const r = await pedirClaude<T>(op);
      uso = r.uso;
      await registrar(funcion, uso, true);
      return r.resultado;
    } catch (e) {
      const msg = e instanceof DOMException && e.name === "TimeoutError" ? "La IA no respondió a tiempo." : (e as Error).message;
      await registrar(funcion, (e as ErrorIa).uso ?? uso ?? { modelo: op.modelo, entrada: 0, salida: 0, costo: 0 }, false, msg);
      throw new ErrorIa(msg);
    }
  }
  const registrar = (funcion: string, u: Uso, ok: boolean, err?: string) =>
    admin.rpc("registrar_uso_ia", {
      p_sistema: sistemaId,
      p_usuario: usuarioId,
      p_funcion: funcion,
      p_modelo: u.modelo,
      p_entrada: u.entrada,
      p_salida: u.salida,
      p_costo: u.costo,
      p_ok: ok,
      p_error: err ?? null,
    });

  try {
    switch (c.accion) {
      case "estado": {
        const usado = veGasto ? await consumo() : null;
        return json({
          activa: sistema.ia_activa === true,
          configurada: !!Deno.env.get("ANTHROPIC_API_KEY"),
          ...(veGasto ? { usado_usd: usado, tope_usd: tope } : {}),
        });
      }

      case "probar": {
        if (!esSuperadmin) return error("Solo la superadministración.", 403);
        const herramienta: Herramienta = {
          name: "responder",
          description: "Confirma que la conexión funciona.",
          input_schema: { type: "object", properties: { saludo: { type: "string" } }, required: ["saludo"] },
        };
        const r = await usar<{ saludo: string }>("prueba", {
          modelo: MODELOS.rapido,
          sistema: "Eres el asistente de MEDORA, un sistema hospitalario dominicano. Responde en español.",
          mensaje: "Saluda en una frase corta para confirmar que la conexión funciona.",
          herramienta,
          maxTokens: 100,
        });
        return json({ ok: true, saludo: r.saludo, usado_usd: await consumo(), tope_usd: tope });
      }

      default:
        return error("Acción desconocida.");
    }
  } catch (e) {
    if (e instanceof ErrorIa) return error(e.message, 422);
    return error("No se pudo completar la solicitud de IA.", 500);
  }
});
