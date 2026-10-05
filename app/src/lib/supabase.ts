import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
export const SUPABASE_URL = url;
export const SUPABASE_CLAVE = clave;

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
      return "El profesional ya tiene una cita en ese horario.";
    case "23503":
      return "El registro está relacionado con otros datos y no puede modificarse así.";
    case "P0001":
      return err.message ?? "Operación no permitida.";
  }
  if (err.message === "Invalid login credentials") return "Correo o contraseña incorrectos.";
  if (err.message?.toLowerCase().includes("banned")) return "Tu cuenta está desactivada. Contacta a la administración de MEDORA.";
  if (err.message?.includes("Failed to fetch")) return "Sin conexión con el servidor. Revisa tu internet.";
  if (err.code === "same_password") return "La nueva contraseña debe ser distinta de la actual.";
  if (err.code === "weak_password") return "Esa contraseña es muy fácil de adivinar. Elige otra más larga o menos común.";
  return err.message ?? "Ocurrió un error inesperado.";
}

/** Error de una Edge Function: el mensaje del servidor, su código HTTP y el cuerpo completo. */
export class ErrorFuncion extends Error {
  constructor(
    mensaje: string,
    readonly estado: number | null,
    readonly cuerpo: Record<string, unknown> | null,
    readonly sinConexion = false,
  ) {
    super(mensaje);
  }
}

/** Invoca una Edge Function y lanza con el mensaje del servidor si falla. */
export async function invocar<T>(nombre: string, cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body: cuerpo });
  if (error) {
    let mensaje = error.message;
    let datosError: Record<string, unknown> | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        datosError = await ctx.json();
        mensaje = (datosError?.error as string) ?? mensaje;
      } catch {
        /* cuerpo no JSON */
      }
    }
    // FunctionsFetchError: la petición ni siquiera salió (sin internet, DNS, servidor caído).
    const sinConexion = error.name === "FunctionsFetchError";
    if (sinConexion) mensaje = "No hay conexión con el servidor. Revisa tu internet.";
    throw new ErrorFuncion(mensaje, ctx instanceof Response ? ctx.status : null, datosError, sinConexion);
  }
  return data as T;
}

/** Lanza si PostgREST devolvió error; si no, devuelve data. */
export function datos<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
