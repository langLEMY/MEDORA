import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function error(mensaje: string, status = 400): Response {
  return json({ error: mensaje }, status);
}

export function clienteServicio(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Sin 0/O/1/l/I: la contraseña temporal se dicta o se copia a mano.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function passwordTemporal(longitud = 14): string {
  const bytes = crypto.getRandomValues(new Uint8Array(longitud));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Nombre de usuario: identificador de acceso (ver migración usuarios_por_nombre).
export const USUARIO_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;

export const normalizarUsuario = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Correo de Auth para quien no tiene correo propio: nunca recibe mensajes. */
export const correoInterno = (usuario: string) => `${usuario}@usuarios.medora.invalid`;

/**
 * Valida usuario y correo opcional. El correo, si viene, es la identidad en Auth
 * (y el contacto para usos futuros); si no, se usa el interno.
 */
export function credencialesNuevas(cuerpo: Record<string, unknown>): { usuario: string; email: string } | { error: string } {
  const usuario = normalizarUsuario(cuerpo.nombre_usuario);
  if (!USUARIO_RE.test(usuario)) {
    return { error: "Nombre de usuario inválido: 2 a 40 caracteres, minúsculas, números, punto, guion o guion bajo." };
  }
  const correo = String(cuerpo.email ?? "").trim().toLowerCase();
  if (correo && !EMAIL_RE.test(correo)) return { error: "Correo electrónico inválido." };
  return { usuario, email: correo || correoInterno(usuario) };
}
