import { createElement, lazy, type ComponentType } from "react";

/**
 * Pantallas perezosas que se pueden precargar.
 *
 * Con `lazy()` a secas, la primera visita a una pantalla siempre suspende (aunque su
 * archivo ya esté cargado, React resuelve la promesa en otro turno) y React 19 sostiene
 * el esqueleto ~300 ms para no parpadear: cada primer clic en Caja, Contabilidad… se
 * sentía lento. `pantalla()` guarda el módulo al cargarse y, si ya está, lo pinta
 * directo sin suspender. `precargarPantallas()` las carga en reposo al abrir el menú.
 */
const registradas: Array<() => Promise<unknown>> = [];

// Misma firma que React.lazy, para usarla igual en las rutas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- igual que React.lazy
export function pantalla<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>): T {
  let Modulo: T | null = null;
  let promesa: Promise<{ default: T }> | null = null;
  const precargar = () =>
    (promesa ??= cargar().then(
      (m) => {
        Modulo = m.default;
        return m;
      },
      (e) => {
        promesa = null; // si falla la carga, se reintenta al visitarla
        throw e;
      },
    ));
  const Perezosa = lazy(precargar);
  registradas.push(precargar);
  function Pantalla(props: object) {
    return createElement((Modulo ?? Perezosa) as ComponentType<object>, props);
  }
  return Pantalla as unknown as T;
}

let iniciada = false;

/** Carga una a una las pantallas registradas cuando el equipo está libre. */
export function precargarPantallas() {
  if (iniciada) return;
  iniciada = true;
  const enReposo = (f: () => void) =>
    "requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 100);
  const siguiente = (i: number) => {
    if (i >= registradas.length) return;
    enReposo(() => {
      registradas[i]()
        .catch(() => undefined)
        .finally(() => siguiente(i + 1));
    });
  };
  // Primero que termine de pintar el Inicio y de llegar sus datos.
  setTimeout(() => siguiente(0), 2000);
}
