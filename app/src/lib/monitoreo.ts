import * as Sentry from "@sentry/react";
import { enEscritorio } from "./escritorio";
import { supabase } from "./supabase";

/**
 * Monitoreo de errores para el soporte de MEDORA, por dos vías:
 *   - Errores de la app → tabla errores_cliente (registrar_error_cliente), siempre
 *     activo; el superadmin los ve en Soporte → «Errores recientes».
 *   - Sentry, apagado mientras no exista VITE_SENTRY_DSN (el DSN no es secreto).
 *
 * Privacidad (Ley 172-13 y secreto médico): nunca salen datos de pacientes.
 *   - sin datos personales por defecto, sin capturas de pantalla ni de la sesión;
 *   - del usuario solo su id; del contexto, el sistema, el rol y la versión;
 *   - se quitan cuerpos de peticiones, query strings y cualquier texto con
 *     forma de cédula, teléfono, correo, token o número de expediente.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const monitoreoActivo = !!DSN;

const PATRONES: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]"],
  [/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]"],
  [/\b\d{3}-?\d{7}-?\d\b/g, "[cédula]"],
  [/\b(?:\+?1[\s-]?)?(?:809|829|849)[\s-]?\d{3}[\s-]?\d{4}\b/g, "[teléfono]"],
  [/\b\d{9,11}\b/g, "[número]"],
];
const limpiar = (s?: string) => (s ? PATRONES.reduce((t, [re, r]) => t.replace(re, r), s) : s);
const sinQuery = (url?: string) => (url ? url.split("?")[0] : url);

// --- Errores de la app → errores_cliente -----------------------------------
let contexto: { sistema: string | null; rol: string | null } = { sistema: null, rol: null };
const yaReportados = new Set<string>();
const MAX_POR_SESION = 25;

/** Pantalla actual sin parámetros (el hash puede llevar ids o búsquedas). */
const pantallaActual = () => limpiar((location.hash || "").replace(/^#/, "").split("?")[0] || "/")!;

async function reportarError(mensaje: unknown, tipo?: string, stack?: string) {
  try {
    if (yaReportados.size >= MAX_POR_SESION) return;
    const texto = (limpiar(String(mensaje ?? "")) ?? "").slice(0, 2000);
    const pila = stack ? (limpiar(stack) ?? "").slice(0, 8000) : undefined;
    const huella = `${tipo}:${texto}:${(pila ?? "").slice(0, 120)}`;
    if (!texto || yaReportados.has(huella)) return;
    yaReportados.add(huella);
    await supabase.rpc("registrar_error_cliente", {
      p_sistema: contexto.sistema ?? undefined,
      p_rol: contexto.rol ?? undefined,
      p_entorno: enEscritorio ? "escritorio" : "navegador",
      p_version: __VERSION_APP__,
      p_pantalla: pantallaActual(),
      p_tipo: (tipo ?? "Error").slice(0, 120),
      p_mensaje: texto,
      p_stack: pila,
      p_user_agent: navigator.userAgent.slice(0, 300),
    });
  } catch {
    // Reportar nunca debe romper la app.
  }
}

function escucharErrores() {
  window.addEventListener("error", (e) => {
    const err = e.error as Error | undefined;
    void reportarError(err?.message ?? e.message, err?.name, err?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as Error | string | undefined;
    if (typeof r === "string") void reportarError(r, "UnhandledRejection");
    else void reportarError(r?.message ?? "Promesa rechazada", r?.name ?? "UnhandledRejection", r?.stack);
  });
}

export function iniciarMonitoreo() {
  escucharErrores();
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    release: `medora@${__VERSION_APP__}`,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    beforeBreadcrumb(miga) {
      if (miga.category === "ui.input") return null;
      miga.message = limpiar(miga.message);
      if (miga.data?.url) miga.data.url = sinQuery(String(miga.data.url));
      return miga;
    },
    beforeSend(evento) {
      if (evento.request) {
        delete evento.request.data;
        delete evento.request.cookies;
        delete evento.request.headers;
        evento.request.url = sinQuery(evento.request.url);
        evento.request.query_string = undefined;
      }
      evento.message = limpiar(evento.message);
      for (const ex of evento.exception?.values ?? []) ex.value = limpiar(ex.value);
      if (evento.user) evento.user = { id: evento.user.id };
      delete evento.extra;
      return evento;
    },
  });
}

/** Quién y dónde (sin datos personales): para agrupar errores por hospital. */
export function contextoMonitoreo(usuarioId: string | null, sistema: string | null, rol: string | null = null) {
  contexto = { sistema, rol };
  if (!DSN) return;
  Sentry.setUser(usuarioId ? { id: usuarioId } : null);
  Sentry.setTag("sistema", sistema ?? "ninguno");
}
