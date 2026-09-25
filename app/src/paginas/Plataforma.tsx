import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, Network, Plus, Power } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, slugificar } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { COLORES_MARCA } from "./Configuracion";

/** Superadministración: todos los sistemas hospitalarios de la plataforma. */
export default function Plataforma() {
  const { esSuperadmin, cambiarSistema, recargar, sesion } = useSesion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);

  const q = useQuery({
    queryKey: ["plataforma-sistemas"],
    enabled: esSuperadmin,
    queryFn: async () => {
      const [sistemas, membresias, sedes] = await Promise.all([
        supabase.from("sistemas").select("*").order("nombre"),
        supabase.from("membresias").select("sistema_id, activo"),
        supabase.from("sedes").select("sistema_id"),
      ]);
      return {
        sistemas: datos(sistemas) ?? [],
        personal: (id: string) => (datos(membresias) ?? []).filter((m) => m.sistema_id === id && m.activo).length,
        sedes: (id: string) => (datos(sedes) ?? []).filter((s) => s.sistema_id === id).length,
      };
    },
  });

  const alternar = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from("sistemas").update({ activo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["plataforma-sistemas"] });
      await recargar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  if (!esSuperadmin) return <Navigate to="/" replace />;

  return (
    <>
      <EncabezadoPagina
        titulo="Sistemas hospitalarios"
        descripcion="Cada sistema está aislado: su personal, pacientes y finanzas no se cruzan con los demás."
        acciones={
          <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>
            Nuevo sistema
          </Boton>
        }
      />

      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (q.data?.sistemas.length ?? 0) === 0 ? (
        <Tarjeta>
          <Vacio icono={<Network />} titulo="Sin sistemas" accion={<Boton onClick={() => setNuevo(true)}>Crear el primero</Boton>} />
        </Tarjeta>
      ) : (
        <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data!.sistemas.map((s) => (
            <motion.div key={s.id} variants={itemEscalonado} whileHover={{ y: -2 }} transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}>
              <Tarjeta className={cn("group relative overflow-hidden p-5 transition-shadow hover:shadow-md", !s.activo && "opacity-60")}>
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: s.color_marca }} />
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white shadow-sm" style={{ background: s.color_marca }}>
                    {s.nombre.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.nombre}</p>
                    <p className="text-xs text-texto-3">Creado el {fecha(s.creado_en)}</p>
                  </div>
                  {!s.activo && <Insignia tono="peligro">Inactivo</Insignia>}
                </div>
                <div className="mt-5 flex gap-6 text-sm">
                  <div>
                    <p className="text-lg font-semibold tabular">{q.data!.sedes(s.id)}</p>
                    <p className="text-xs text-texto-3">Sedes</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular">{q.data!.personal(s.id)}</p>
                    <p className="text-xs text-texto-3">Personal</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-borde pt-4">
                  <button
                    onClick={() => alternar.mutate({ id: s.id, activo: !s.activo })}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-texto-3 transition-colors hover:text-texto"
                  >
                    <Power className="size-3.5" /> {s.activo ? "Desactivar" : "Reactivar"}
                  </button>
                  <button
                    onClick={() => {
                      cambiarSistema(s.id);
                      navigate("/personal");
                    }}
                    className="group/b inline-flex items-center gap-1 text-[13px] font-medium text-marca-texto"
                  >
                    Administrar <ArrowRight className="size-3.5 transition-transform group-hover/b:translate-x-0.5" />
                  </button>
                </div>
              </Tarjeta>
            </motion.div>
          ))}
        </motion.div>
      )}

      <NuevoSistema
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        usuarioId={sesion?.user.id ?? ""}
        onCreado={async (id) => {
          await qc.invalidateQueries({ queryKey: ["plataforma-sistemas"] });
          await recargar();
          cambiarSistema(id);
        }}
      />
    </>
  );
}

function NuevoSistema({
  abierto,
  onCerrar,
  usuarioId,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  usuarioId: string;
  onCreado: (id: string) => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES_MARCA[0]);
  const [unirme, setUnirme] = useState(true);

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("sistemas")
        .insert({ nombre: nombre.trim(), slug: slugificar(nombre) || `sistema-${Date.now()}`, color_marca: color })
        .select("id")
        .single();
      if (error) throw error;
      if (unirme) {
        const r = await supabase.from("membresias").insert({ sistema_id: data.id, usuario_id: usuarioId, roles: ["admin"] });
        if (r.error) throw r.error;
      }
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success("Sistema creado");
      setNombre("");
      onCerrar();
      await onCreado(id);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nuevo sistema hospitalario"
      descripcion="Luego podrás agregar sus sedes, personal y catálogos."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={nombre.trim().length < 2} onClick={() => m.mutate()}>
            Crear sistema
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Entrada etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} ayuda={nombre ? `Identificador: ${slugificar(nombre)}` : undefined} />
        <div>
          <p className="mb-2 text-[13px] font-medium text-texto-2">Color</p>
          <div className="flex flex-wrap gap-2">
            {COLORES_MARCA.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("size-8 rounded-full ring-offset-2 ring-offset-superficie transition-shadow", color === c && "ring-2")}
                style={{ background: c, ["--tw-ring-color" as string]: c }}
              />
            ))}
          </div>
        </div>
        <Interruptor activo={unirme} onChange={setUnirme} etiqueta="Agregarme como administrador de este sistema" />
      </div>
    </Modal>
  );
}
