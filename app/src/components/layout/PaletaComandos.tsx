import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { puede } from "@/lib/permisos";
import { supabase } from "@/lib/supabase";
import { patronBusqueda } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { NAVEGACION } from "./navegacion";

function useDebounce<T>(valor: T, ms = 200) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function PaletaComandos({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const { sistema, roles, esSuperadmin } = useSesion();
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const busqueda = useDebounce(texto);

  useEffect(() => {
    if (!abierta) setTexto("");
  }, [abierta]);

  const pacientes = useQuery({
    queryKey: ["paleta-pacientes", sistema?.id, busqueda],
    enabled: abierta && !!sistema && busqueda.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nombres, apellidos, expediente, documento")
        .eq("sistema_id", sistema!.id)
        .is("eliminado_en", null)
        .ilike("busqueda", patronBusqueda(busqueda))
        .limit(6);
      return data ?? [];
    },
  });

  const ir = (ruta: string) => {
    onCerrar();
    navigate(ruta);
  };

  const modulos = NAVEGACION.filter((i) =>
    i.soloSuperadmin ? esSuperadmin : i.modulo ? puede(roles, i.modulo, esSuperadmin) : true,
  );

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[rgb(10_13_18/0.4)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCerrar}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ type: "spring", duration: 0.28, bounce: 0.1 }}
            className="relative mx-auto mt-[12vh] w-full max-w-xl overflow-hidden rounded-2xl border border-borde bg-superficie shadow-lg"
          >
            <Command
              shouldFilter={false}
              onKeyDown={(e) => e.key === "Escape" && onCerrar()}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-texto-3 [&_[cmdk-group-heading]]:uppercase"
            >
              <div className="flex items-center gap-3 border-b border-borde px-4">
                <Search className="size-4 text-texto-3" />
                <Command.Input
                  autoFocus
                  value={texto}
                  onValueChange={setTexto}
                  placeholder="Busca un paciente por nombre, cédula o expediente…"
                  className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-texto-3"
                />
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-sm text-texto-3">
                  {pacientes.isFetching ? "Buscando…" : "Sin resultados."}
                </Command.Empty>
                {(pacientes.data?.length ?? 0) > 0 && (
                  <Command.Group heading="Pacientes">
                    {pacientes.data!.map((p) => (
                      <Item key={p.id} onSelect={() => ir(`/pacientes/${p.id}`)} icono={<UserRound />}>
                        <span className="flex-1 truncate">
                          {p.nombres} {p.apellidos}
                        </span>
                        <span className="text-xs text-texto-3 tabular">{p.expediente}</span>
                      </Item>
                    ))}
                  </Command.Group>
                )}
                {!busqueda && (
                  <Command.Group heading="Acciones">
                    <Item onSelect={() => ir("/pacientes?nuevo=1")} icono={<Plus />}>
                      Registrar paciente
                    </Item>
                    <Item onSelect={() => ir("/agenda?nueva=1")} icono={<Plus />}>
                      Programar cita
                    </Item>
                  </Command.Group>
                )}
                <Command.Group heading="Ir a">
                  {modulos
                    .filter((m) => !busqueda || m.etiqueta.toLowerCase().includes(busqueda.toLowerCase()))
                    .map((m) => (
                      <Item key={m.ruta} onSelect={() => ir(m.ruta)} icono={<m.icono />}>
                        {m.etiqueta}
                      </Item>
                    ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Item({ children, icono, onSelect }: { children: React.ReactNode; icono: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-texto data-[selected=true]:bg-superficie-2 [&>svg]:size-4 [&>svg]:text-texto-3"
    >
      {icono}
      {children}
    </Command.Item>
  );
}
