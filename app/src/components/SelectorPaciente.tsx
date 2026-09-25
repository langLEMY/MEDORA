import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn, patronBusqueda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Campo } from "./ui/campos";
import { Avatar } from "./ui/superficies";

export interface PacienteBreve {
  id: string;
  nombres: string;
  apellidos: string;
  expediente: string;
  documento: string | null;
  aseguradora_id: string | null;
}

/** Combobox de búsqueda de pacientes (nombre, documento o expediente). */
export function SelectorPaciente({
  valor,
  onChange,
  etiqueta = "Paciente",
  error,
}: {
  valor: PacienteBreve | null;
  onChange: (p: PacienteBreve | null) => void;
  etiqueta?: string;
  error?: string;
}) {
  const { sistemaId } = useSistema();
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 180);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const q = useQuery({
    queryKey: ["selector-paciente", sistemaId, busqueda],
    enabled: busqueda.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nombres, apellidos, expediente, documento, aseguradora_id")
        .eq("sistema_id", sistemaId)
        .is("eliminado_en", null)
        .ilike("busqueda", patronBusqueda(busqueda))
        .limit(8);
      return (data ?? []) as PacienteBreve[];
    },
  });

  const resultados = q.data ?? [];
  const elegir = (p: PacienteBreve) => {
    onChange(p);
    setTexto("");
    setAbierto(false);
  };

  return (
    <Campo etiqueta={etiqueta} error={error}>
      {(id) =>
        valor ? (
          <div className="flex h-9 items-center gap-2.5 rounded-[10px] border border-borde bg-superficie-2 pr-1 pl-1.5">
            <Avatar nombre={`${valor.nombres} ${valor.apellidos}`} tamano={24} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {valor.nombres} {valor.apellidos}
            </span>
            <span className="text-xs text-texto-3 tabular">{valor.expediente}</span>
            <button type="button" onClick={() => onChange(null)} className="grid size-7 place-items-center rounded-md text-texto-3 hover:bg-superficie hover:text-texto">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div ref={raiz} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-3" />
            <input
              id={id}
              value={texto}
              autoComplete="off"
              placeholder="Buscar por nombre, cédula o expediente…"
              aria-invalid={!!error}
              onChange={(e) => {
                setTexto(e.target.value);
                setAbierto(true);
                setIndice(0);
              }}
              onFocus={() => setAbierto(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setIndice((i) => Math.min(i + 1, resultados.length - 1));
                if (e.key === "ArrowUp") setIndice((i) => Math.max(i - 1, 0));
                if (e.key === "Enter" && resultados[indice]) {
                  e.preventDefault();
                  elegir(resultados[indice]);
                }
              }}
              className="h-9 w-full rounded-[10px] border border-borde bg-superficie pr-3 pl-9 text-sm shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-texto-3 focus:border-marca focus:[box-shadow:0_0_0_4px_var(--anillo)] aria-[invalid=true]:border-peligro"
            />
            <AnimatePresence>
              {abierto && busqueda.trim().length >= 2 && (
                <motion.ul
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ type: "spring", duration: 0.22, bounce: 0.1 }}
                  style={{ transformOrigin: "top" }}
                  className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-borde bg-superficie p-1 shadow-lg"
                >
                  {q.isFetching && resultados.length === 0 ? (
                    <li className="px-3 py-3 text-sm text-texto-3">Buscando…</li>
                  ) : resultados.length === 0 ? (
                    <li className="px-3 py-3 text-sm text-texto-3">Sin coincidencias.</li>
                  ) : (
                    resultados.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setIndice(i)}
                          onClick={() => elegir(p)}
                          className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm", i === indice && "bg-superficie-2")}
                        >
                          <Avatar nombre={`${p.nombres} ${p.apellidos}`} tamano={26} />
                          <span className="min-w-0 flex-1 truncate">
                            {p.nombres} {p.apellidos}
                          </span>
                          <span className="text-xs text-texto-3 tabular">{p.documento ?? p.expediente}</span>
                        </button>
                      </li>
                    ))
                  )}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )
      }
    </Campo>
  );
}
