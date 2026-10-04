import * as Sentry from "@sentry/react";

/**
 * Monitoreo de errores (Sentry) para el soporte de MEDORA. Apagado mientras no
 * exista VITE_SENTRY_DSN (el DSN no es secreto: solo permite enviar errores).
 *
 * Privacidad (Ley 172-13 y secreto médico): nunca salen datos de pacientes.
 *   - sin datos personales por defecto, sin capturas de pantalla ni de la sesión;
 *   - del usuario solo su id; del contexto, el sistema y la versión;
 *   - se quitan cuerpos de peticiones, query strings y cualquier texto con
 *     forma de cédula, teléfono o correo de los mensajes y migas.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
export const monitoreoActivo = !!DSN;

const PATRONES: [RegExp, string][] = [
  [/\b\d{3}-?\d{7}-?\d\b/g, "[cédula]"],
  [/\b(?:\+?1[\s-]?)?(?:809|829|849)[\s-]?\d{3}[\s-]?\d{4}\b/g, "[teléfono]"],
  [/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]"],
];
const limpiar = (s?: string) => (s ? PATRONES.reduce((t, [re, r]) => t.replace(re, r), s) : s);
const sinQuery = (url?: string) => (url ? url.split("?")[0] : url);

export function iniciarMonitoreo() {
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
export function contextoMonitoreo(usuarioId: string | null, sistema: string | null) {
  if (!DSN) return;
  Sentry.setUser(usuarioId ? { id: usuarioId } : null);
  Sentry.setTag("sistema", sistema ?? "ninguno");
}
