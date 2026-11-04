import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { supabase } from "./supabase";
import { aplicarAcento, aplicarTema, cambiarTemaAnimado, type Tema } from "./tema";

/**
 * Preferencias de interfaz de cada usuario. Se guardan en perfiles.preferencias
 * (lo siguen a cualquier computadora) y en localStorage para aplicarlas antes del
 * primer pintado. Todo se expresa como atributos data-* en <html>; index.css hace
 * el resto (tamaño de texto, densidad, contraste, animaciones).
 */
export interface Preferencias {
  tema: Tema;
  texto: "normal" | "grande" | "muy-grande";
  densidad: "comoda" | "compacta";
  contraste: "normal" | "alto";
  movimiento: "completo" | "reducido";
  /** Estilo de color del modo claro y del oscuro (index.css: data-claro / data-oscuro). */
  claro: "nieve" | "marfil" | "niebla";
  oscuro: "grafito" | "medianoche" | "carbon";
  /** Ruta que se abre al entrar: "auto" = según el rol (navegacion.ts#inicioPorRol), "/" = Inicio. */
  inicio: string;
  /** Minutos de inactividad para bloquear la sesión; "nunca" lo desactiva. */
  bloqueo: "nunca" | "15" | "25" | "30";
  /** Respuestas rápidas de Soporte MEDORA (solo las usa el superadmin en Ayuda). Vacío = las de fábrica. */
  respuestasSoporte: string[];
  /** Acento personal (#rrggbb) que pisa el color del hospital; "hospital" = usar el del sistema. */
  acento: string;
  /** Orden y widgets ocultos del inicio, por rol de vista ("operacion" | "medico"). */
  widgets: Partial<Record<"operacion" | "medico", { orden: string[]; ocultos: string[] }>>;
}

export const PREFERENCIAS_DEFECTO: Preferencias = {
  tema: "sistema",
  texto: "normal",
  densidad: "comoda",
  contraste: "normal",
  movimiento: "completo",
  claro: "nieve",
  oscuro: "grafito",
  inicio: "auto",
  bloqueo: "nunca",
  respuestasSoporte: [],
  acento: "hospital",
  widgets: {},
};

const CLAVE = "medora.preferencias";
const CLAVE_TEMA = "medora.tema";

function leer(): Preferencias {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as Partial<Preferencias>;
    const tema = (localStorage.getItem(CLAVE_TEMA) as Tema) || guardadas.tema;
    return normalizar({ ...guardadas, tema });
  } catch {
    return PREFERENCIAS_DEFECTO;
  }
}

/** Acepta solo valores conocidos (lo que venga de la base o de versiones viejas). */
function normalizar(p: Partial<Preferencias>): Preferencias {
  const de = <K extends keyof Preferencias>(k: K, validos: readonly Preferencias[K][]) =>
    validos.includes(p[k] as Preferencias[K]) ? (p[k] as Preferencias[K]) : PREFERENCIAS_DEFECTO[k];
  return {
    tema: de("tema", ["claro", "oscuro", "sistema"]),
    texto: de("texto", ["normal", "grande", "muy-grande"]),
    densidad: de("densidad", ["comoda", "compacta"]),
    contraste: de("contraste", ["normal", "alto"]),
    movimiento: de("movimiento", ["completo", "reducido"]),
    claro: de("claro", ["nieve", "marfil", "niebla"]),
    oscuro: de("oscuro", ["grafito", "medianoche", "carbon"]),
    inicio: typeof p.inicio === "string" && (p.inicio === "auto" || p.inicio.startsWith("/")) ? p.inicio : "auto",
    bloqueo: de("bloqueo", ["nunca", "15", "25", "30"]),
    respuestasSoporte: Array.isArray(p.respuestasSoporte)
      ? p.respuestasSoporte.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.slice(0, 500)).slice(0, 30)
      : [],
    acento: typeof p.acento === "string" && (p.acento === "hospital" || /^#[0-9a-f]{6}$/i.test(p.acento)) ? p.acento : "hospital",
    widgets: normalizarWidgets(p.widgets),
  };
}

/** Solo listas de ids de texto; descarta cualquier otra cosa que venga de la base. */
function normalizarWidgets(w: unknown): Preferencias["widgets"] {
  if (!w || typeof w !== "object") return {};
  const out: Preferencias["widgets"] = {};
  for (const vista of ["operacion", "medico"] as const) {
    const v = (w as Record<string, unknown>)[vista];
    if (v && typeof v === "object") {
      const orden = (v as { orden?: unknown }).orden;
      const ocultos = (v as { ocultos?: unknown }).ocultos;
      out[vista] = {
        orden: Array.isArray(orden) ? orden.filter((x): x is string => typeof x === "string") : [],
        ocultos: Array.isArray(ocultos) ? ocultos.filter((x): x is string => typeof x === "string") : [],
      };
    }
  }
  return out;
}

let actuales = leer();
const oyentes = new Set<() => void>();

function aplicarAtributos(p: Preferencias) {
  const d = document.documentElement.dataset;
  d.texto = p.texto;
  d.densidad = p.densidad;
  d.contraste = p.contraste;
  d.movimiento = p.movimiento;
  d.claro = p.claro;
  d.oscuro = p.oscuro;
  aplicarAcento(p.acento === "hospital" ? null : p.acento);
}

function publicar(p: Preferencias) {
  actuales = p;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    /* almacenamiento no disponible */
  }
  oyentes.forEach((o) => o());
}

function conFundido(cambio: () => void) {
  const raiz = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches || raiz.dataset.movimiento === "reducido";
  if (!doc.startViewTransition || reducir) return cambio();
  raiz.classList.add("cambiando-tema");
  doc.startViewTransition(cambio).finished.finally(() => requestAnimationFrame(() => raiz.classList.remove("cambiando-tema")));
}

/** Al arrancar (main.tsx), antes de renderizar. */
export function aplicarPreferenciasIniciales() {
  aplicarTema(actuales.tema);
  aplicarAtributos(actuales);
}

/**
 * Cambia una o varias preferencias. El tema usa el fundido de pantalla completa y
 * el estado de React se actualiza dentro de la captura (flushSync), así el
 * selector del menú aparece ya en su lugar nuevo en vez de moverse a destiempo.
 */
export function cambiarPreferencias(cambios: Partial<Preferencias>, usuarioId?: string) {
  const nuevas = normalizar({ ...actuales, ...cambios });
  const cambiaEstilo =
    (cambios.claro && cambios.claro !== actuales.claro) ||
    (cambios.oscuro && cambios.oscuro !== actuales.oscuro) ||
    (cambios.acento !== undefined && cambios.acento !== actuales.acento);
  if (cambios.tema && cambios.tema !== actuales.tema) {
    cambiarTemaAnimado(nuevas.tema, () => flushSync(() => publicar(nuevas)));
  } else if (cambiaEstilo) {
    // Mismo fundido que el cambio de tema (View Transitions), sin colores a destiempo.
    conFundido(() => {
      aplicarAtributos(nuevas);
      flushSync(() => publicar(nuevas));
    });
  } else {
    publicar(nuevas);
  }
  aplicarAtributos(nuevas);
  if (usuarioId) guardarRemoto(usuarioId, nuevas);
}

// La escritura en el perfil se agrupa: arrastrar un widget o alternar un ajuste
// rápido dispara muchos cambios seguidos y no queremos una petición por cada uno.
// Lo local (memoria + localStorage) ya se aplicó al instante; esto solo sincroniza.
let tempGuardado: ReturnType<typeof setTimeout> | undefined;
function guardarRemoto(usuarioId: string, p: Preferencias) {
  if (tempGuardado) clearTimeout(tempGuardado);
  tempGuardado = setTimeout(() => {
    tempGuardado = undefined;
    void supabase.from("perfiles").update({ preferencias: { ...p } }).eq("id", usuarioId);
  }, 700);
}

/** Al iniciar sesión: lo guardado en el perfil manda sobre lo local. */
export function sincronizarDesdePerfil(remotas: unknown) {
  if (!remotas || typeof remotas !== "object" || !Object.keys(remotas).length) return;
  const nuevas = normalizar(remotas as Partial<Preferencias>);
  if (JSON.stringify(nuevas) === JSON.stringify(actuales)) return;
  if (nuevas.tema !== actuales.tema) aplicarTema(nuevas.tema);
  aplicarAtributos(nuevas);
  publicar(nuevas);
}

export function usePreferencias() {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => actuales,
  );
}
