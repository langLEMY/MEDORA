import { clsx, type ClassValue } from "clsx";

export const cn = (...c: ClassValue[]) => clsx(c);

const fmtMoneda = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 2 });

/** Pesos dominicanos (RD$). MEDORA opera solo en República Dominicana. */
export function moneda(valor: number | string | null | undefined) {
  return fmtMoneda.format(Number(valor ?? 0));
}

// Identificación dominicana (JCE / DGII). Espejo de privado.tg_identificacion_rd.
const digitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/** Cédula como 000-0000000-0, o null si no tiene 11 dígitos. */
export function cedula(v?: string | null) {
  const d = digitos(v);
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}` : null;
}

/** RNC solo con dígitos (9, u 11 si es cédula), o null si no es válido. */
export function rnc(v?: string | null) {
  const d = digitos(v);
  return d.length === 9 || d.length === 11 ? d : null;
}

/** Teléfono dominicano (809/829/849, con o sin +1) → "809-000-0000"; null si no es válido. */
export function telefonoRd(v?: string | null) {
  let d = digitos(v);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 && /^(809|829|849)/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : null;
}

/** Correo (espejo de perfiles.correo_contacto). */
export const CORREO_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** Nombre de usuario de acceso (espejo de perfiles.ck_perfiles_nombre_usuario). */
export const USUARIO_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;

/** Correo de contacto real (los internos *.invalid solo existen para Auth). */
export const correoVisible = (email?: string | null) => (email && !email.endsWith(".invalid") ? email : null);

/** Sugerencia de usuario a partir del nombre: "Ana María Pérez" → "ana.perez". */
export function sugerirUsuario(nombre: string) {
  const p = slugificar(nombre).split("-").filter(Boolean);
  return p.length > 1 ? `${p[0]}.${p[p.length - 1]}` : (p[0] ?? "");
}

export function numero(valor: number | null | undefined) {
  return new Intl.NumberFormat("es-DO").format(Number(valor ?? 0));
}

const fmtFecha = new Intl.DateTimeFormat("es-DO", { day: "2-digit", month: "short", year: "numeric" });
const fmtFechaHora = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});
// Formato de 12 horas, como se usa en República Dominicana: "1:30 p. m.".
const fmtHora = new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit", hourCycle: "h12" });

export const fecha = (v?: string | Date | null) => (v ? fmtFecha.format(new Date(v)) : "—");
export const fechaHora = (v?: string | Date | null) => (v ? fmtFechaHora.format(new Date(v)) : "—");
export const hora = (v?: string | Date | null) => (v ? fmtHora.format(new Date(v)) : "—");

/** Etiqueta corta de una hora en punto para ejes y cuadrículas: 13 → "1 p. m.". */
export const horaCorta = (h: number) => `${h % 12 || 12} ${h < 12 ? "a. m." : "p. m."}`;

/** Fecha "YYYY-MM-DD" en hora local (no UTC) para inputs y filtros. */
export function isoDia(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function edad(nacimiento?: string | null) {
  if (!nacimiento) return null;
  const n = new Date(nacimiento + "T00:00:00");
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) e--;
  return e;
}

export function iniciales(nombre?: string | null) {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "·";
}

export function slugificar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function relativo(v: string | Date) {
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(diff) < 60) return "ahora";
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

/** Escapa comodines de ILIKE para búsquedas de texto libre. */
export function patronBusqueda(texto: string) {
  return "%" + texto.trim().toLowerCase().replace(/[%_\\,()]/g, " ") + "%";
}
