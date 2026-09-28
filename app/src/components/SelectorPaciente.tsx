import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Search, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { puedeEscribir } from "@/lib/permisos";
import { supabase } from "@/lib/supabase";
import { cn, patronBusqueda } from "@/lib/utils";
import { FormPaciente } from "@/paginas/pacientes/FormPaciente";
import { useSistema } from "@/sesion/SesionProvider";
import { Campo } from "./ui/campos";
import { Capa, usePosicionFlotante } from "./ui/flotante";
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
  textoInicial,
}: {
  valor: PacienteBreve | null;
  onChange: (p: PacienteBreve | null) => void;
  etiqueta?: string;
  error?: string;
  /** Búsqueda ya escrita (p. ej. la cédula que el paciente tecleó en el quiosco). */
  textoInicial?: string;
}) {
  const { sistemaId, roles } = useSistema();
  const [texto, setTexto] = useState(textoInicial ?? "");
  const [busqueda, setBusqueda] = useState(textoInicial ?? "");
  const [abierto, setAbierto] = useState(!!textoInicial);
  useEffect(() => {
    if (!textoInicial) return;
    setTexto(textoInicial);
    setBusqueda(textoInicial);
    setAbierto(true);
  }, [textoInicial]);
  const [indice, setIndice] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 180);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!raiz.current?.contains(n) && !lista.current?.contains(n))
        setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const visible = abierto && !valor && busqueda.trim().length >= 2;
  const pos = usePosicionFlotante(raiz, visible, { alto: 288 });

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

  // Paciente nuevo desde aquí: lo escrito se usa como cédula (si son números) o como nombre.
  const puedeCrear = puedeEscribir.pacientes(roles);
  const [nuevo, setNuevo] = useState<{
    nombres?: string;
    apellidos?: string;
    documento?: string;
  } | null>(null);
  const abrirNuevo = () => {
    const t = texto.trim();
    if (/^[\d\s-]+$/.test(t)) setNuevo({ documento: t });
    else {
      const partes = t.split(/\s+/);
      const corte = partes.length >= 4 ? 2 : 1;
      setNuevo({
        nombres: partes.slice(0, corte).join(" "),
        apellidos: partes.slice(corte).join(" "),
      });
    }
    setAbierto(false);
  };
  const creado = async (id: string) => {
    const { data } = await supabase
      .from("pacientes")
      .select("id, nombres, apellidos, expediente, documento, aseguradora_id")
      .eq("id", id)
      .single();
    if (data) elegir(data as PacienteBreve);
  };

  return (
    <>
      <Campo etiqueta={etiqueta} error={error}>
        {(id) =>
          valor ? (
            <div className="flex h-9 items-center gap-2.5 rounded-[10px] border border-borde bg-superficie-2 pr-1 pl-1.5">
              <Avatar
                nombre={`${valor.nombres} ${valor.apellidos}`}
                tamano={24}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {valor.nombres} {valor.apellidos}
              </span>
              <span className="text-xs text-texto-3 tabular">
                {valor.expediente}
              </span>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="grid size-7 place-items-center rounded-md text-texto-3 hover:bg-superficie hover:text-texto"
              >
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
                  if (e.key === "ArrowDown")
                    setIndice((i) => Math.min(i + 1, resultados.length - 1));
                  if (e.key === "ArrowUp") setIndice((i) => Math.max(i - 1, 0));
                  if (e.key === "Enter" && resultados[indice]) {
                    e.preventDefault();
                    elegir(resultados[indice]);
                  }
                }}
                className="h-9 w-full rounded-[10px] border border-borde bg-superficie pr-3 pl-9 text-sm shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-texto-3 focus:border-marca focus:[box-shadow:0_0_0_4px_var(--anillo)] aria-[invalid=true]:border-peligro"
              />
              <Capa>
                <AnimatePresence>
                  {visible && pos && (
                    <motion.ul
                      ref={lista}
                      initial={{
                        opacity: 0,
                        y: pos.arriba ? 4 : -4,
                        scale: 0.98,
                      }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.08 } }}
                      transition={{
                        type: "spring",
                        duration: 0.22,
                        bounce: 0.1,
                      }}
                      style={pos.estilo}
                      className="z-[60] overflow-y-auto rounded-xl border border-borde bg-superficie p-1 shadow-lg"
                    >
                      {q.isFetching && resultados.length === 0 ? (
                        <li className="px-3 py-3 text-sm text-texto-3">
                          Buscando…
                        </li>
                      ) : resultados.length === 0 ? (
                        <li className="px-3 pt-3 pb-1 text-sm text-texto-3">
                          No está registrado.
                        </li>
                      ) : (
                        resultados.map((p, i) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onMouseEnter={() => setIndice(i)}
                              onClick={() => elegir(p)}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                                i === indice && "bg-superficie-2",
                              )}
                            >
                              <Avatar
                                nombre={`${p.nombres} ${p.apellidos}`}
                                tamano={26}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {p.nombres} {p.apellidos}
                              </span>
                              <span className="text-xs text-texto-3 tabular">
                                {p.documento ?? p.expediente}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                      {puedeCrear &&
                        !(q.isFetching && resultados.length === 0) && (
                          <li
                            className={cn(
                              resultados.length > 0 &&
                                "mt-1 border-t border-borde pt-1",
                            )}
                          >
                            <button
                              type="button"
                              onClick={abrirNuevo}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-marca-texto hover:bg-marca-suave"
                            >
                              <UserPlus className="size-4" />
                              <span className="min-w-0 flex-1 truncate">
                                Registrar «{texto.trim()}» como paciente nuevo
                              </span>
                            </button>
                          </li>
                        )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </Capa>
            </div>
          )
        }
      </Campo>
      <FormPaciente
        abierto={!!nuevo}
        inicial={nuevo ?? undefined}
        onCerrar={() => setNuevo(null)}
        onGuardado={(id) => void creado(id)}
      />
    </>
  );
}
