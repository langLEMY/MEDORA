import { clsx, type ClassValue } from "clsx";

export const cn = (...c: ClassValue[]) => clsx(c);

export function moneda(valor: number | string | null | undefined, codigo = "DOP") {
  const n = Number(valor ?? 0);
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: codigo, maximumFractionDigits: 2 }).format(n);
}

export function numero(valor: number | null | undefined) {
  return new Intl.NumberFormat("es-DO").format(Number(valor ?? 0));
}

const fmtFecha = new Intl.DateTimeFormat("es-DO", { day: "2-digit", month: "short", year: "numeric" });
const fmtFechaHora = new Intl.DateTimeFormat("es-DO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const fmtHora = new Intl.DateTimeFormat("es-DO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const fecha = (v?: string | Date | null) => (v ? fmtFecha.format(new Date(v)) : "—");
export const fechaHora = (v?: string | Date | null) => (v ? fmtFechaHora.format(new Date(v)) : "—");
export const hora = (v?: string | Date | null) => (v ? fmtHora.format(new Date(v)) : "—");

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
