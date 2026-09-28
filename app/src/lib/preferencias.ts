import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { supabase } from "./supabase";
import { aplicarTema, cambiarTemaAnimado, type Tema } from "./tema";

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
  /** Ruta que se abre al entrar: "auto" = según el rol (navegacion.ts#inicioPorRol), "/" = Inicio. */
  inicio: string;
}

export const PREFERENCIAS_DEFECTO: Preferencias = {
  tema: "sistema",
  texto: "normal",
  densidad: "comoda",
  contraste: "normal",
  movimiento: "completo",
  inicio: "auto",
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
    inicio: typeof p.inicio === "string" && (p.inicio === "auto" || p.inicio.startsWith("/")) ? p.inicio : "auto",
  };
}

let actuales = leer();
const oyentes = new Set<() => void>();

function aplicarAtributos(p: Preferencias) {
  const d = document.documentElement.dataset;
  d.texto = p.texto;
  d.densidad = p.densidad;
  d.contraste = p.contraste;
  d.movimiento = p.movimiento;
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
  if (cambios.tema && cambios.tema !== actuales.tema) {
    cambiarTemaAnimado(nuevas.tema, () => flushSync(() => publicar(nuevas)));
  } else {
    publicar(nuevas);
  }
  aplicarAtributos(nuevas);
  if (usuarioId) void supabase.from("perfiles").update({ preferencias: { ...nuevas } }).eq("id", usuarioId);
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
