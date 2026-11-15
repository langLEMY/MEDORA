import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Search, Stethoscope, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Entrada } from "@/components/ui/campos";
import { Capa, usePosicionFlotante } from "@/components/ui/flotante";
import { codigoCie10, formatoCie10, SEPARADOR_CIE10, type Cie10 } from "@/lib/cie10";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Diagnóstico por CIE-10: se busca por código («I10», «m54») o como lo dice la gente
 * («dolor de cabeza», «presión alta»). Solo se guarda lo elegido de la lista; lo que se
 * escribe sin elegir no se guarda. Un valor viejo en texto libre se muestra tal cual.
 */
export function SelectorCie10({
  valor,
  onChange,
  etiqueta = "Diagnóstico (CIE-10)",
  placeholder = "Busca por código o por palabras: «dolor lumbar», «I10»…",
  contenedor,
}: {
  valor: string;
  onChange: (v: string) => void;
  etiqueta?: string;
  placeholder?: string;
  contenedor?: string;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const ancla = useRef<HTMLDivElement>(null);
  const idLista = useId();

  // Espera a que se deje de escribir (no consulta por cada tecla).
  useEffect(() => {
    const t = window.setTimeout(() => setBusqueda(texto.trim()), 180);
    return () => window.clearTimeout(t);
  }, [texto]);

  const q = useQuery({
    queryKey: ["cie10", busqueda],
    enabled: abierto && busqueda.length >= 1,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buscar_cie10", { p_texto: busqueda, p_limite: 15 });
      if (error) throw error;
      return (data ?? []) as Cie10[];
    },
  });
  const resultados = q.data ?? [];
  useEffect(() => setActivo(0), [busqueda]);

  const pos = usePosicionFlotante(ancla, abierto && busqueda.length >= 1, { alto: 300 });

  const elegir = (c: Cie10) => {
    onChange(formatoCie10(c));
    setTexto("");
    setAbierto(false);
  };

  const codigo = codigoCie10(valor);
  const [cod, desc] = codigo ? [codigo, valor.slice(valor.indexOf(SEPARADOR_CIE10) + SEPARADOR_CIE10.length)] : [null, valor];

  return (
    <div className={cn("min-w-0", contenedor)}>
      {valor && !abierto ? (
        // Diagnóstico elegido: se ve como ficha; tocarla permite cambiarlo.
        <div>
          {etiqueta && <p className="mb-1.5 text-[0.8125rem] font-medium text-texto-2">{etiqueta}</p>}
          <div className="flex min-h-9 items-center gap-2 rounded-[10px] border border-borde bg-superficie px-2.5 py-1.5">
            <Stethoscope className="size-4 shrink-0 text-marca" />
            <button type="button" onClick={() => setAbierto(true)} className="min-w-0 flex-1 text-left text-sm" title="Cambiar diagnóstico">
              {cod && <span className="mr-1.5 rounded-md bg-marca-suave px-1.5 py-0.5 font-mono text-xs font-semibold text-marca-texto">{cod}</span>}
              <span className={cn(!cod && "text-texto-2 italic")}>{desc}</span>
              {!cod && <span className="ml-1.5 text-xs text-aviso">(sin código: elige uno)</span>}
            </button>
            <button type="button" aria-label="Quitar diagnóstico" onClick={() => onChange("")} className="shrink-0 text-texto-3 hover:text-peligro">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div ref={ancla}>
          <Entrada
            etiqueta={etiqueta}
            icono={<Search />}
            placeholder={placeholder}
            value={texto}
            autoFocus={!!valor && abierto}
            role="combobox"
            aria-expanded={abierto && resultados.length > 0}
            aria-controls={idLista}
            aria-autocomplete="list"
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            // Al salir sin elegir no se guarda texto libre (se conserva lo que había).
            onBlur={() => window.setTimeout(() => (setAbierto(false), setTexto("")), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActivo((i) => Math.min(i + 1, resultados.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActivo((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && resultados[activo]) {
                e.preventDefault();
                elegir(resultados[activo]);
              } else if (e.key === "Escape") {
                setAbierto(false);
                setTexto("");
              }
            }}
          />
          {pos && (
            <Capa>
              <AnimatePresence>
                <motion.ul
                  id={idLista}
                  role="listbox"
                  initial={{ opacity: 0, y: pos.arriba ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  style={pos.estilo}
                  className="z-[70] overflow-y-auto rounded-xl border border-borde bg-superficie p-1 shadow-lg"
                  // Que el clic en un resultado llegue antes que el blur del campo.
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {q.isLoading ? (
                    <li className="px-3 py-2 text-xs text-texto-3">Buscando…</li>
                  ) : !resultados.length ? (
                    <li className="px-3 py-2 text-xs text-texto-3">Nada en la CIE-10 con «{busqueda}». Prueba otra palabra o el código.</li>
                  ) : (
                    resultados.map((c, i) => (
                      <li
                        key={c.codigo}
                        role="option"
                        aria-selected={i === activo}
                        onMouseEnter={() => setActivo(i)}
                        onClick={() => elegir(c)}
                        className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm", i === activo ? "bg-marca-suave" : "hover:bg-superficie-2")}
                      >
                        <span className="mt-px w-14 shrink-0 font-mono text-xs font-semibold text-marca-texto">{c.codigo}</span>
                        <span className="min-w-0 flex-1">{c.descripcion}</span>
                      </li>
                    ))
                  )}
                </motion.ul>
              </AnimatePresence>
            </Capa>
          )}
        </div>
      )}
    </div>
  );
}
