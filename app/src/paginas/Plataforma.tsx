import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Network, Plus, Power, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Segmentado } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { datos, invocar, mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, slugificar } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { COLORES_MARCA } from "./Configuracion";
import { CodigosInvitacion } from "./plataforma/CodigosInvitacion";
import { UsuariosPlataforma } from "./plataforma/UsuariosPlataforma";

type Pestana = "sistemas" | "usuarios" | "codigos";

/** Superadministración: sistemas hospitalarios, usuarios y códigos de invitación. */
export default function Plataforma() {
  const { esSuperadmin } = useSesion();
  const [pestana, setPestana] = useState<Pestana>("sistemas");
  if (!esSuperadmin) return <Navigate to="/" replace />;

  return (
    <>
      <EncabezadoPagina
        titulo="Plataforma"
        descripcion="Administración global de MEDORA: sistemas hospitalarios, cuentas de usuario y códigos de invitación."
      />
      <div className="mb-5">
        <Segmentado
          id="plataforma"
          valor={pestana}
          onChange={setPestana}
          opciones={[
            { valor: "sistemas", etiqueta: "Sistemas hospitalarios" },
            { valor: "usuarios", etiqueta: "Usuarios" },
            { valor: "codigos", etiqueta: "Códigos de invitación" },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          {pestana === "sistemas" && <SistemasPlataforma />}
          {pestana === "usuarios" && <UsuariosPlataforma />}
          {pestana === "codigos" && <CodigosInvitacion />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function SistemasPlataforma() {
  const { esSuperadmin, cambiarSistema, recargar, sesion } = useSesion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);
  const [eliminar, setEliminar] = useState<{ id: string; nombre: string; personal: number } | null>(null);

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

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-texto-2">Cada sistema está aislado: su personal, pacientes y finanzas no se cruzan con los demás.</p>
        <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>
          Nuevo sistema
        </Boton>
      </div>

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
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => alternar.mutate({ id: s.id, activo: !s.activo })}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-texto-3 transition-colors hover:text-texto"
                    >
                      <Power className="size-3.5" /> {s.activo ? "Desactivar" : "Reactivar"}
                    </button>
                    <button
                      onClick={() => setEliminar({ id: s.id, nombre: s.nombre, personal: q.data!.personal(s.id) })}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-texto-3 transition-colors hover:text-peligro"
                    >
                      <Trash2 className="size-3.5" /> Eliminar
                    </button>
                  </div>
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

      <EliminarSistema
        sistema={eliminar}
        onCerrar={() => setEliminar(null)}
        onEliminado={async () => {
          await qc.invalidateQueries({ queryKey: ["plataforma-sistemas"] });
          await recargar();
        }}
      />

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

/**
 * Borrado definitivo de un sistema hospitalario y todos sus datos. Se confirma
 * escribiendo el nombre exacto (Postgres vuelve a verificarlo). Sugiere desactivar
 * en su lugar: eso es reversible.
 */
function EliminarSistema({
  sistema,
  onCerrar,
  onEliminado,
}: {
  sistema: { id: string; nombre: string; personal: number } | null;
  onCerrar: () => void;
  onEliminado: () => Promise<void>;
}) {
  const [confirmacion, setConfirmacion] = useState("");
  const coincide = !!sistema && confirmacion.trim() === sistema.nombre;

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("plataforma_eliminar_sistema", { p_sistema: sistema!.id, p_confirmacion: confirmacion.trim() });
      if (error) throw error;
      // Los anexos viven en Storage: se limpian aparte (si falla, el sistema ya no existe igual).
      await invocar("plataforma-usuarios", { accion: "limpiar_archivos_sistema", sistema_id: sistema!.id }).catch(() => undefined);
      return data as { nombre: string; registros: Record<string, number> };
    },
    onSuccess: async (r) => {
      const total = Object.values(r.registros ?? {}).reduce((a, b) => a + b, 0);
      toast.success(`${r.nombre} eliminado`, { description: `${total.toLocaleString("es-DO")} registros borrados.` });
      cerrar();
      await onEliminado();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const cerrar = () => {
    setConfirmacion("");
    onCerrar();
  };

  return (
    <Modal
      abierto={!!sistema}
      onCerrar={cerrar}
      titulo="Eliminar sistema hospitalario"
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" icono={<Trash2 className="size-4" />} cargando={m.isPending} disabled={!coincide} onClick={() => m.mutate()}>
            Eliminar definitivamente
          </Boton>
        </>
      }
    >
      {sistema && (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--peligro)_30%,transparent)] bg-[color-mix(in_oklab,var(--peligro)_8%,transparent)] p-3.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-peligro" />
            <div className="space-y-1.5">
              <p className="font-medium text-texto">Esta acción no se puede deshacer.</p>
              <p className="text-texto-2">
                Se borran <b>todos</b> los datos de <b>{sistema.nombre}</b>: pacientes, historial clínico, agenda, cobros, inventario,
                contabilidad, nómina, anexos y bitácora. Las {sistema.personal} cuenta(s) de su personal siguen existiendo, pero sin
                acceso a este sistema.
              </p>
              <p className="text-texto-2">Si solo quieres cortar el acceso, usa <b>Desactivar</b>: es reversible.</p>
            </div>
          </div>
          <Entrada
            etiqueta={`Escribe «${sistema.nombre}» para confirmar`}
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </div>
      )}
    </Modal>
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
