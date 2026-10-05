import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCircle2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "@/components/ui/menu";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";

export interface Aviso {
  clave: string;
  nivel: "peligro" | "aviso" | "info";
  cantidad: number;
  titulo: string;
  detalle: string;
  enlace: string;
}

const COLOR: Record<Aviso["nivel"], string> = {
  peligro: "bg-peligro",
  aviso: "bg-aviso",
  info: "bg-marca",
};

// Lo ya visto (clave → cantidad) por sistema: la campana solo marca lo nuevo o lo que creció.
const llaveVistos = (sistemaId: string) => `medora.avisos-vistos.${sistemaId}`;
function leerVistos(sistemaId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(llaveVistos(sistemaId)) ?? "{}");
  } catch {
    return {};
  }
}
function guardarVistos(sistemaId: string, avisos: Aviso[]) {
  try {
    localStorage.setItem(llaveVistos(sistemaId), JSON.stringify(Object.fromEntries(avisos.map((a) => [a.clave, a.cantidad]))));
  } catch {
    /* sin almacenamiento: la campana sigue funcionando, solo no recuerda lo visto */
  }
}

/** Avisos calculados en el servidor (mis_avisos) según el rol de cada quien. */
export function useAvisos() {
  const { sistema } = useSesion();
  return useQuery({
    queryKey: ["avisos", sistema?.id],
    enabled: !!sistema,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mis_avisos", { p_sistema: sistema!.id });
      if (error) throw error;
      return (data ?? []) as unknown as Aviso[];
    },
  });
}

/** Campana de la barra superior: lo que requiere atención, con enlace a dónde resolverlo. */
export function CentroAvisos() {
  const { sistema } = useSesion();
  const navigate = useNavigate();
  const avisos = useAvisos().data ?? [];
  const [vistos, setVistos] = useState<Record<string, number>>({});
  useEffect(() => {
    if (sistema) setVistos(leerVistos(sistema.id));
  }, [sistema]);

  const nuevos = avisos.filter((a) => (vistos[a.clave] ?? 0) < a.cantidad).length;
  const marcarVistos = () => {
    if (!sistema) return;
    guardarVistos(sistema.id, avisos);
    setVistos(Object.fromEntries(avisos.map((a) => [a.clave, a.cantidad])));
  };

  if (!sistema) return null;
  return (
    <Menu
      alinear="derecha"
      ancho={360}
      disparador={(abierto) => <Campana abierto={abierto} nuevos={nuevos} hay={avisos.length > 0} onAbrir={marcarVistos} />}
    >
      {(cerrar) => (
        <div className="p-1">
          <p className="px-2.5 pt-1.5 pb-2 text-[0.8125rem] font-semibold">Avisos</p>
          {avisos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CheckCircle2 className="size-6 text-exito" />
              <p className="text-sm text-texto-2">Todo en orden por ahora.</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {avisos.map((a) => (
                <li key={a.clave}>
                  <button
                    type="button"
                    onClick={() => {
                      cerrar();
                      navigate(a.enlace);
                    }}
                    className="group flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-superficie-2"
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", COLOR[a.nivel])} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.titulo}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-texto-3">{a.detalle}</span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-texto-3 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Menu>
  );
}

function Campana({ abierto, nuevos, hay, onAbrir }: { abierto: boolean; nuevos: number; hay: boolean; onAbrir: () => void }) {
  useEffect(() => {
    if (abierto) onAbrir();
    // Solo al abrir: marcar como visto lo que hay en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  return (
    <button
      type="button"
      title="Avisos"
      aria-label={nuevos ? `Avisos: ${nuevos} nuevos` : "Avisos"}
      className={cn("relative grid size-9 place-items-center rounded-full transition-colors hover:bg-superficie-2", abierto ? "text-texto" : hay ? "text-texto-2" : "text-texto-3")}
    >
      <Bell className="size-[1.125rem]" />
      <AnimatePresence>
        {nuevos > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
            className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-peligro px-1 text-[0.625rem] font-semibold text-white ring-2 ring-superficie"
          >
            {nuevos > 9 ? "9+" : nuevos}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
