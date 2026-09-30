import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { datos, supabase } from "@/lib/supabase";
import { fechaHora, relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Boton } from "./ui/boton";
import { Modal } from "./ui/modal";
import { contenedorEscalonado, itemEscalonado } from "./ui/movimiento";
import { Avatar, Esqueleto, Vacio } from "./ui/superficies";

/**
 * Registra en la auditoría que se abrió el expediente (el servidor ignora
 * repeticiones de la misma persona en 10 minutos).
 */
export function useRegistrarAcceso(pacienteId: string | undefined, recurso: string) {
  useEffect(() => {
    if (!pacienteId) return;
    void supabase.rpc("registrar_acceso_expediente", { p_paciente: pacienteId, p_recurso: recurso });
  }, [pacienteId, recurso]);
}

/** Botón "Quién lo vio" (admin, gerencia, auditoría). */
export function AccesosExpediente({ pacienteId }: { pacienteId: string }) {
  const { roles, esSuperadmin } = useSistema();
  const [abierto, setAbierto] = useState(false);
  const puede = esSuperadmin || roles.some((r) => ["admin", "gerencia", "auditor"].includes(r));
  const q = useQuery({
    queryKey: ["accesos-expediente", pacienteId],
    enabled: abierto && puede,
    queryFn: async () => datos(await supabase.rpc("accesos_expediente", { p_paciente: pacienteId })) as { cuando: string; usuario: string; recurso: string }[],
  });
  if (!puede) return null;
  return (
    <>
      <Boton variante="fantasma" tamano="sm" icono={<Eye className="size-3.5" />} onClick={() => setAbierto(true)}>
        Quién lo vio
      </Boton>
      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Quién vio este expediente" descripcion="Cada apertura queda registrada y no se puede borrar.">
        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-10" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <Vacio icono={<Eye />} titulo="Nadie lo ha abierto todavía" />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="max-h-96 divide-y divide-borde overflow-y-auto">
            {q.data.map((a, i) => (
              <motion.li key={i} variants={itemEscalonado} className="flex items-center gap-3 py-2.5">
                <Avatar nombre={a.usuario} tamano={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.usuario}</p>
                  <p className="text-xs text-texto-3">
                    Abrió {a.recurso === "expediente" ? "el" : "la"} {a.recurso} · {fechaHora(a.cuando)}
                  </p>
                </div>
                <span className="text-xs text-texto-3">{relativo(a.cuando)}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Modal>
    </>
  );
}
