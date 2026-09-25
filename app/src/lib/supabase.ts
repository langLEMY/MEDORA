import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient<Database>(url, clave, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "medora.sesion" },
});

export type Tablas = Database["public"]["Tables"];
export type Fila<T extends keyof Tablas> = Tablas[T]["Row"];
export type Rol = Database["public"]["Enums"]["rol_sistema"];
export type EstadoCita = Database["public"]["Enums"]["estado_cita"];
export type MetodoPago = Database["public"]["Enums"]["metodo_pago"];
export type TipoEntradaClinica = Database["public"]["Enums"]["tipo_entrada_clinica"];

/** Traduce errores de Postgres/PostgREST a un mensaje legible en español. */
export function mensajeError(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  if (!err) return "Ocurrió un error inesperado.";
  switch (err.code) {
    case "42501":
      return err.message?.includes("row-level security")
        ? "No tienes permiso para realizar esta acción."
        : (err.message ?? "Permiso denegado.");
    case "23505":
      return "Ya existe un registro con esos datos.";
    case "23P01":
      return "El médico ya tiene una cita en ese horario.";
    case "23503":
      return "El registro está relacionado con otros datos y no puede modificarse así.";
    case "P0001":
      return err.message ?? "Operación no permitida.";
  }
  if (err.message === "Invalid login credentials") return "Correo o contraseña incorrectos.";
  if (err.message?.includes("Failed to fetch")) return "Sin conexión con el servidor. Revisa tu internet.";
  return err.message ?? "Ocurrió un error inesperado.";
}

/** Invoca una Edge Function y lanza con el mensaje del servidor si falla. */
export async function invocar<T>(nombre: string, cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body: cuerpo });
  if (error) {
    let mensaje = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        mensaje = (await ctx.json()).error ?? mensaje;
      } catch {
        /* cuerpo no JSON */
      }
    }
    throw new Error(mensaje);
  }
  return data as T;
}

/** Lanza si PostgREST devolvió error; si no, devuelve data. */
export function datos<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
