import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, KeyRound, MoreHorizontal, Pencil, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Campo, Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, usePersonal, useSedes, type Miembro } from "@/lib/consultas";
import { ETIQUETA_ROL, ROLES } from "@/lib/permisos";
import { invocar, mensajeError, supabase, type Rol } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

export default function Personal() {
  const { sistema, sistemaId } = useSistema();
  const personal = usePersonal(sistemaId);
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Miembro | null>(null);
  const [credenciales, setCredenciales] = useState<{ email: string; password: string } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);

  const restablecer = useMutation({
    mutationFn: async (m: Miembro) => {
      const r = await invocar<{ password_temporal: string }>("gestion-usuarios", {
        accion: "restablecer_password",
        sistema_id: sistemaId,
        usuario_id: m.usuario_id,
      });
      return { email: m.perfil?.email ?? "", password: r.password_temporal };
    },
    onSuccess: setCredenciales,
    onError: (e) => toast.error((e as Error).message),
  });

  const lista = (personal.data ?? []).filter((m) => verInactivos || m.activo);

  return (
    <>
      <EncabezadoPagina
        titulo="Personal"
        descripcion={`Personas con acceso a ${sistema.nombre} y sus roles.`}
        acciones={
          <>
            <Interruptor activo={verInactivos} onChange={setVerInactivos} etiqueta="Mostrar inactivos" />
            <Boton icono={<UserPlus className="size-4" />} onClick={() => setNuevo(true)}>
              Agregar personal
            </Boton>
          </>
        }
      />

      <Tarjeta className="overflow-hidden">
        {personal.isLoading ? (
          <FilasEsqueleto />
        ) : lista.length === 0 ? (
          <Vacio icono={<Users />} titulo="Sin personal" descripcion="Agrega a médicos, enfermería, recepción y caja." />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {lista.map((m) => (
              <motion.li key={m.id} variants={itemEscalonado} className={cn("flex items-center gap-4 px-5 py-3.5", !m.activo && "opacity-50")}>
                <Avatar nombre={m.perfil?.nombre_completo} tamano={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.perfil?.nombre_completo}
                    {m.especialidad && <span className="font-normal text-texto-3"> · {m.especialidad}</span>}
                  </p>
                  <p className="truncate text-xs text-texto-3">{m.perfil?.email}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {m.roles.map((r) => (
                    <Insignia key={r} tono={r === "admin" ? "marca" : r === "medico" ? "info" : "neutro"}>
                      {ETIQUETA_ROL[r]}
                    </Insignia>
                  ))}
                  {!m.activo && <Insignia tono="peligro">Inactivo</Insignia>}
                </div>
                <Menu
                  alinear="derecha"
                  ancho={220}
                  disparador={() => (
                    <button className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto">
                      <MoreHorizontal className="size-4" />
                    </button>
                  )}
                >
                  {(cerrar) => (
                    <>
                      <ItemMenu icono={<Pencil />} onClick={() => (setEditar(m), cerrar())}>
                        Editar roles y datos
                      </ItemMenu>
                      <ItemMenu icono={<KeyRound />} onClick={() => (restablecer.mutate(m), cerrar())}>
                        Restablecer contraseña
                      </ItemMenu>
                    </>
                  )}
                </Menu>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>

      <NuevoMiembro abierto={nuevo} onCerrar={() => setNuevo(false)} onCreado={setCredenciales} />
      <EditarMiembro miembro={editar} onCerrar={() => setEditar(null)} />
      <MostrarCredenciales datos={credenciales} onCerrar={() => setCredenciales(null)} />
    </>
  );
}

export function SelectorRoles({ valor, onChange }: { valor: Rol[]; onChange: (r: Rol[]) => void }) {
  return (
    <Campo etiqueta="Roles">
      {() => (
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const activo = valor.includes(r);
            return (
              <motion.button
                key={r}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onChange(activo ? valor.filter((x) => x !== r) : [...valor, r])}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150",
                  activo ? "border-marca bg-marca-suave text-marca-texto" : "border-borde text-texto-2 hover:border-borde-fuerte",
                )}
              >
                <AnimatePresence initial={false}>
                  {activo && (
                    <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 14, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="overflow-hidden">
                      <Check className="size-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
                {ETIQUETA_ROL[r]}
              </motion.button>
            );
          })}
        </div>
      )}
    </Campo>
  );
}

function NuevoMiembro({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (c: { email: string; password: string }) => void;
}) {
  const { sistemaId } = useSistema();
  const sedes = useSedes(sistemaId);
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [especialidad, setEspecialidad] = useState("");
  const [exequatur, setExequatur] = useState("");
  const [sede, setSede] = useState("");

  useEffect(() => {
    if (abierto) {
      setNombre("");
      setEmail("");
      setRoles([]);
      setEspecialidad("");
      setExequatur("");
      setSede("");
    }
  }, [abierto]);

  const m = useMutation({
    mutationFn: () =>
      invocar<{ password_temporal: string | null; ya_existia: boolean }>("gestion-usuarios", {
        accion: "crear",
        sistema_id: sistemaId,
        email,
        nombre_completo: nombre,
        roles,
        especialidad: especialidad || null,
        exequatur: exequatur || null,
        sede_id: sede || null,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: claves.personal(sistemaId) });
      onCerrar();
      if (r.password_temporal) onCreado({ email, password: r.password_temporal });
      else toast.success("La persona ya tenía cuenta en MEDORA: se le dio acceso a este sistema.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Agregar personal"
      descripcion="Se crea su cuenta con una contraseña temporal que deberá cambiar al entrar."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={nombre.trim().length < 3 || !email.includes("@") || roles.length === 0} onClick={() => m.mutate()}>
            Crear acceso
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Entrada etiqueta="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <SelectorRoles valor={roles} onChange={setRoles} />
        <AnimatePresence initial={false}>
          {roles.includes("medico") && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-4 pb-1">
                <Entrada etiqueta="Especialidad" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />
                <Entrada etiqueta="Exequátur" value={exequatur} onChange={(e) => setExequatur(e.target.value)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {(sedes.data?.length ?? 0) > 0 && (
          <Selector etiqueta="Sede principal" value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="">—</option>
            {sedes.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        )}
      </div>
    </Modal>
  );
}

function EditarMiembro({ miembro, onCerrar }: { miembro: Miembro | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const { sesion } = useSesion();
  const sedes = useSedes(sistemaId);
  const qc = useQueryClient();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [especialidad, setEspecialidad] = useState("");
  const [exequatur, setExequatur] = useState("");
  const [sede, setSede] = useState("");
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (!miembro) return;
    setRoles(miembro.roles);
    setEspecialidad(miembro.especialidad ?? "");
    setExequatur(miembro.exequatur ?? "");
    setSede(miembro.sede_id ?? "");
    setActivo(miembro.activo);
  }, [miembro]);

  const soyYo = miembro?.usuario_id === sesion?.user.id;

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("membresias")
        .update({ roles, especialidad: especialidad || null, exequatur: exequatur || null, sede_id: sede || null, activo })
        .eq("id", miembro!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cambios guardados");
      void qc.invalidateQueries({ queryKey: claves.personal(sistemaId) });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={!!miembro}
      onCerrar={onCerrar}
      titulo={miembro?.perfil?.nombre_completo ?? ""}
      descripcion={miembro?.perfil?.email}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={roles.length === 0} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorRoles valor={roles} onChange={setRoles} />
        {soyYo && !roles.includes("admin") && (
          <p className="text-xs text-aviso">Atención: te estás quitando el rol de administración en este sistema.</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Especialidad" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />
          <Entrada etiqueta="Exequátur" value={exequatur} onChange={(e) => setExequatur(e.target.value)} />
        </div>
        {(sedes.data?.length ?? 0) > 0 && (
          <Selector etiqueta="Sede principal" value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="">—</option>
            {sedes.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        )}
        <Interruptor activo={activo} onChange={setActivo} etiqueta={activo ? "Acceso activo" : "Acceso desactivado"} />
      </div>
    </Modal>
  );
}

export function MostrarCredenciales({ datos, onCerrar }: { datos: { email: string; password: string } | null; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(`MEDORA\nUsuario: ${datos?.email}\nContraseña temporal: ${datos?.password}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  };
  return (
    <Modal
      abierto={!!datos}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Credenciales de acceso"
      descripcion="Entrégalas en persona. La contraseña no se volverá a mostrar."
      pie={<Boton onClick={onCerrar}>Listo</Boton>}
    >
      <div className="space-y-3 rounded-xl bg-superficie-2 p-4">
        <div>
          <p className="text-xs text-texto-3">Usuario</p>
          <p className="text-sm font-medium">{datos?.email}</p>
        </div>
        <div>
          <p className="text-xs text-texto-3">Contraseña temporal</p>
          <p className="font-mono text-lg font-semibold tracking-wider">{datos?.password}</p>
        </div>
      </div>
      <Boton variante="secundario" className="mt-4 w-full justify-center" onClick={copiar}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copiado ? "ok" : "copiar"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="inline-flex items-center gap-2"
          >
            {copiado ? <Check className="size-4 text-exito" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar credenciales"}
          </motion.span>
        </AnimatePresence>
      </Boton>
    </Modal>
  );
}
