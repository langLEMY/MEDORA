import { AnimatePresence, motion } from "motion/react";
import { ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCuentas, type CuentaContable } from "@/lib/consultas";
import { cn } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Campo } from "./ui/campos";

const TONO_TIPO: Record<string, string> = {
  activo: "text-[#1570ef]",
  pasivo: "text-[#c11574]",
  patrimonio: "text-[#6938ef]",
  ingreso: "text-exito",
  costo: "text-aviso",
  gasto: "text-peligro",
};

/** Normaliza para buscar sin tildes ni mayúsculas. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Búsqueda de cuentas por código ("6.2", "620") o por nombre ("sumin"). Los
 * códigos que empiezan igual van primero; se resaltan las coincidencias.
 */
export function SelectorCuenta({
  valor,
  onChange,
  etiqueta,
  soloMovimiento = true,
  tipos,
  compacto,
  error,
}: {
  valor: string | null;
  onChange: (codigo: string) => void;
  etiqueta?: string;
  soloMovimiento?: boolean;
  tipos?: string[];
  compacto?: boolean;
  error?: string;
}) {
  const { sistemaId } = useSistema();
  const cuentas = useCuentas(sistemaId);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [indice, setIndice] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const resultados = useMemo(() => {
    const t = norm(texto.trim());
    const tSinPuntos = t.replace(/\./g, "");
    return (cuentas.data ?? [])
      .filter((c) => c.activo && (!soloMovimiento || c.acepta_movimiento) && (!tipos || tipos.includes(c.tipo)))
      .map((c) => {
        if (!t) return { c, peso: 1 };
        const codigo = c.codigo;
        if (codigo.startsWith(t) || codigo.replace(/\./g, "").startsWith(tSinPuntos)) return { c, peso: 3 };
        if (norm(c.nombre).split(/\s+/).some((p) => p.startsWith(t))) return { c, peso: 2 };
        if (norm(c.nombre).includes(t) || codigo.includes(t)) return { c, peso: 1 };
        return null;
      })
      .filter((x): x is { c: CuentaContable; peso: number } => !!x)
      .sort((a, b) => b.peso - a.peso || a.c.codigo.localeCompare(b.c.codigo, undefined, { numeric: true }))
      .slice(0, 40)
      .map((x) => x.c);
  }, [cuentas.data, texto, soloMovimiento, tipos]);

  const actual = cuentas.data?.find((c) => c.codigo === valor);

  const elegir = (c: CuentaContable) => {
    onChange(c.codigo);
    setAbierto(false);
    setTexto("");
  };

  const resaltar = (s: string) => {
    const t = texto.trim();
    if (!t) return s;
    const i = norm(s).indexOf(norm(t));
    if (i < 0) return s;
    return (
      <>
        {s.slice(0, i)}
        <mark className="rounded-sm bg-marca-suave px-0.5 text-marca-texto">{s.slice(i, i + t.length)}</mark>
        {s.slice(i + t.length)}
      </>
    );
  };

  const control = (id?: string) => (
    <div ref={raiz} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-invalid={!!error}
        className={cn(
          "flex w-full items-center gap-2 rounded-[10px] border border-borde bg-superficie px-3 text-left text-sm shadow-sm transition-colors hover:border-borde-fuerte aria-[invalid=true]:border-peligro",
          compacto ? "h-8" : "h-9",
          abierto && "border-marca [box-shadow:0_0_0_4px_var(--anillo)]",
        )}
      >
        {actual ? (
          <>
            <span className="font-mono text-xs text-texto-2 tabular">{actual.codigo}</span>
            <span className="min-w-0 flex-1 truncate">{actual.nombre}</span>
          </>
        ) : (
          <span className="flex-1 text-texto-3">Buscar cuenta por código o nombre…</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-texto-3" />
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ type: "spring", duration: 0.22, bounce: 0.1 }}
            style={{ transformOrigin: "top" }}
            className="absolute inset-x-0 top-full z-40 mt-1.5 min-w-[340px] overflow-hidden rounded-xl border border-borde bg-superficie shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-borde px-3">
              <Search className="size-4 text-texto-3" />
              <input
                autoFocus
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setIndice(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setIndice((i) => Math.min(i + 1, resultados.length - 1));
                  if (e.key === "ArrowUp") setIndice((i) => Math.max(i - 1, 0));
                  if (e.key === "Enter" && resultados[indice]) {
                    e.preventDefault();
                    elegir(resultados[indice]);
                  }
                  if (e.key === "Escape") setAbierto(false);
                }}
                placeholder="Ej. 6.2 · 620 · suministros"
                className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-texto-3"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-1">
              {resultados.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-texto-3">Sin cuentas que coincidan.</li>
              ) : (
                resultados.map((c, i) => (
                  <li key={c.codigo}>
                    <button
                      type="button"
                      onMouseEnter={() => setIndice(i)}
                      onClick={() => elegir(c)}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm", i === indice && "bg-superficie-2")}
                    >
                      <span className="w-16 font-mono text-xs text-texto-2 tabular">{resaltar(c.codigo)}</span>
                      <span className="min-w-0 flex-1 truncate">{resaltar(c.nombre)}</span>
                      <span className={cn("text-[11px] capitalize", TONO_TIPO[c.tipo])}>{c.tipo}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (!etiqueta) return control();
  return (
    <Campo etiqueta={etiqueta} error={error}>
      {(id) => control(id)}
    </Campo>
  );
}
