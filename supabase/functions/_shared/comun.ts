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

/** Cliente con la clave pública (anon): para iniciar sesión en nombre del usuario. */
export function clienteAnon(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * IP del cliente (detrás del proxy de Supabase). Para el limitador de intentos.
 * Primero las cabeceras que fija el proxy (el cliente no puede escribirlas); la primera
 * entrada de x-forwarded-for la manda el propio cliente y cambiándola se saltaría el límite.
 */
export function ipCliente(req: Request): string {
  const fija = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  if (fija?.trim()) return fija.trim();
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "0.0.0.0").trim();
}

/**
 * Limitador de intentos. Devuelve true si se permite; false si pasó el límite.
 * Nunca hace fallar la operación por un error del limitador (mejor permitir que
 * tumbar el acceso por una incidencia de infraestructura).
 */
export async function limitar(admin: SupabaseClient, clave: string, max: number, ventanaSeg: number): Promise<boolean> {
  try {
    const { data } = await admin.rpc("consumir_limite", { p_clave: clave, p_max: max, p_ventana_seg: ventanaSeg });
    return data !== false;
  } catch {
    return true;
  }
}

/** Nivel de garantía (aal) declarado en el token ya validado por getUser. */
export function aalDeToken(token: string): string {
  try {
    // El JWT va en base64url (- y _ en vez de + y /, sin relleno): atob solo lee base64.
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))).aal ?? "aal1";
  } catch {
    return "aal1";
  }
}

/**
 * ¿La sesión cumple el 2FA? true si llegó a aal2 o si la cuenta no tiene segundo
 * factor (2FA opcional). Espejo de privado.mfa_ok() para las Edge Functions.
 */
export async function cumpleMfa(admin: SupabaseClient, token: string, usuarioId: string): Promise<boolean> {
  if (aalDeToken(token) === "aal2") return true;
  const { data } = await admin.rpc("cuenta_tiene_mfa", { p_usuario: usuarioId });
  return data !== true;
}

/** Oculta el correo para mostrarlo sin revelarlo entero. */
export function enmascararCorreo(correo: string): string {
  const [u, d] = correo.split("@");
  if (!d) return correo;
  return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
}

export const MFA_REQUERIDO = "Esta acción requiere verificación en dos pasos: vuelve a entrar e introduce tu código.";

// Sin 0/O/1/l/I: la contraseña temporal se dicta o se copia a mano.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function passwordTemporal(longitud = 14): string {
  // Se descartan los bytes ≥ 224 (4 × 56) para que todas las letras salgan con la misma probabilidad.
  const limite = 256 - (256 % ALFABETO.length);
  const salida: string[] = [];
  while (salida.length < longitud) {
    for (const b of crypto.getRandomValues(new Uint8Array(longitud))) {
      if (b < limite && salida.length < longitud) salida.push(ALFABETO[b % ALFABETO.length]);
    }
  }
  return salida.join("");
}

/**
 * Contraseña temporal solo de números (fácil de dictar): al azar y distinta por persona.
 * 8 dígitos = 100 millones de combinaciones; el acceso está limitado a 10 intentos
 * cada 10 min por usuario y obliga a cambiarla al entrar.
 */
export function pinTemporal(digitos = 8): string {
  const max = 4294967296 - (4294967296 % 10); // sin sesgo de módulo
  const salida: number[] = [];
  while (salida.length < digitos) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n < max) salida.push(n % 10);
  }
  return salida.join("");
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
