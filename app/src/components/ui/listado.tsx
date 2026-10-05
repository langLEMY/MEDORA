import { ArrowDownUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Boton } from "./boton";

/** Un criterio de orden para un listado: cómo comparar y en qué sentido empieza. */
export interface OrdenListado<T> {
  clave: string;
  etiqueta: string;
  valor: (fila: T) => string | number | null | undefined;
  /** Por defecto ascendente; los montos y las fechas suelen empezar de mayor a menor. */
  descendente?: boolean;
}

const comparar = (a: string | number | null | undefined, b: string | number | null | undefined) => {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
};

/**
 * Orden y paginación en el cliente para listados que ya se traen completos
 * (inventario, cobros del día, gastos…). Vuelve a la página 1 al cambiar filtros.
 */
export function useListado<T>(filas: T[], ordenes: OrdenListado<T>[], { porPagina = 50, reiniciar = [] as unknown[] } = {}) {
  const [orden, setOrden] = useState(ordenes[0]?.clave ?? "");
  const [invertido, setInvertido] = useState(false);
  const [pagina, setPagina] = useState(0);

  const actual = ordenes.find((o) => o.clave === orden) ?? ordenes[0];
  const ordenadas = useMemo(() => {
    if (!actual) return filas;
    const sentido = (actual.descendente ? -1 : 1) * (invertido ? -1 : 1);
    return [...filas].sort((a, b) => sentido * comparar(actual.valor(a), actual.valor(b)));
  }, [filas, actual, invertido]);

  const paginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPagina(0), [orden, invertido, ...reiniciar]);
  useEffect(() => {
    if (pagina >= paginas) setPagina(paginas - 1);
  }, [pagina, paginas]);

  return {
    visibles: ordenadas.slice(pagina * porPagina, (pagina + 1) * porPagina),
    total: ordenadas.length,
    porPagina,
    pagina,
    paginas,
    setPagina,
    orden,
    invertido,
    ordenar: (clave: string) => {
      if (clave === orden) setInvertido((v) => !v);
      else {
        setOrden(clave);
        setInvertido(false);
      }
    },
    ordenes,
  };
}

interface EstadoOrden {
  orden: string;
  invertido: boolean;
  ordenar: (clave: string) => void;
  ordenes: { clave: string; etiqueta: string }[];
}
interface EstadoPaginas {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  setPagina: (p: number) => void;
}

/** Selector compacto de orden: elegir otra vez el mismo criterio invierte el sentido. */
export function SelectorOrden({ listado }: { listado: EstadoOrden }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-borde bg-superficie pr-1 pl-2.5 text-sm text-texto-2">
      <ArrowDownUp className="size-3.5 text-texto-3" />
      <select
        value={listado.orden}
        onChange={(e) => listado.ordenar(e.target.value)}
        className="h-full bg-transparent pr-1 text-sm text-texto outline-none"
        aria-label="Ordenar por"
      >
        {listado.ordenes.map((o) => (
          <option key={o.clave} value={o.clave}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      <button
        type="button"
        title={listado.invertido ? "Orden invertido" : "Invertir orden"}
        onClick={() => listado.ordenar(listado.orden)}
        className="grid size-7 place-items-center rounded-md text-texto-3 transition-colors hover:bg-superficie-2 hover:text-texto"
      >
        <ArrowDownUp className={`size-3.5 transition-transform duration-200 ${listado.invertido ? "rotate-180" : ""}`} />
      </button>
    </label>
  );
}

/** Pie de paginación: solo aparece si hay más de una página. */
export function Paginacion({ listado }: { listado: EstadoPaginas }) {
  if (listado.paginas <= 1) return null;
  const desde = listado.pagina * listado.porPagina + 1;
  const hasta = Math.min(listado.total, desde + listado.porPagina - 1);
  return (
    <div className="flex items-center justify-between border-t border-borde px-5 py-3 text-sm text-texto-2">
      <span className="tabular">
        {desde}–{hasta} de {listado.total}
      </span>
      <div className="flex gap-1.5">
        <Boton variante="secundario" tamano="sm" aria-label="Página anterior" disabled={listado.pagina === 0} onClick={() => listado.setPagina(listado.pagina - 1)}>
          <ChevronLeft className="size-4" />
        </Boton>
        <Boton variante="secundario" tamano="sm" aria-label="Página siguiente" disabled={listado.pagina + 1 >= listado.paginas} onClick={() => listado.setPagina(listado.pagina + 1)}>
          <ChevronRight className="size-4" />
        </Boton>
      </div>
    </div>
  );
}
