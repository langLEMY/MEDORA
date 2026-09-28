import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Building2, KeyRound, LockKeyhole, Plus, Power, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { datos, invocar, mensajeError, supabase, type Rol } from "@/lib/supabase";
import { cn, correoVisible, fechaHora, relativo, sugerirUsuario, USUARIO_RE } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { AsignarPassword, MostrarCredenciales, SelectorRoles, type Credenciales } from "../Personal";

interface UsuarioPlataforma {
  id: string;
  nombre_completo: string;
  email: string;
  nombre_usuario: string | null;
  telefono: string | null;
  es_superadmin: boolean;
  activo: boolean;
  creado_en: string;
  ultimo_acceso: string | null;
  sistemas: number;
}

type Filtro = "todos" | "activos" | "desactivados" | "superadmin";
const CLAVE = ["plataforma-usuarios"];

/** Directorio global: cuentas, superadmins, acceso a cada sistema y desactivación. */
export function UsuariosPlataforma() {
  const { sesion } = useSesion();
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);

  const q = useQuery({
    queryKey: CLAVE,
    queryFn: async () => (datos(await supabase.rpc("plataforma_usuarios")) ?? []) as UsuarioPlataforma[],
  });

  const lista = useMemo(
    () =>
      (q.data ?? []).filter((u) => {
        const t = texto.trim().toLowerCase();
        if (t && !`${u.nombre_completo} ${u.nombre_usuario ?? ""} ${u.email}`.toLowerCase().includes(t)) return false;
        if (filtro === "activos") return u.activo;
        if (filtro === "desactivados") return !u.activo;
        if (filtro === "superadmin") return u.es_superadmin;
        return true;
      }),
    [q.data, texto, filtro],
  );

  const usuario = q.data?.find((u) => u.id === seleccionado) ?? null;

  return (
    <>
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-borde p-3">
          <Entrada icono={<Search />} placeholder="Buscar por nombre, usuario o correo…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="w-72" />
          <Segmentado
            id="filtro-usuarios"
            valor={filtro}
            onChange={setFiltro}
            opciones={[
              { valor: "todos", etiqueta: "Todos" },
              { valor: "activos", etiqueta: "Activos" },
              { valor: "desactivados", etiqueta: "Desactivados" },
              { valor: "superadmin", etiqueta: "Superadmin" },
            ]}
          />
          <Boton className="ml-auto" icono={<UserPlus className="size-4" />} onClick={() => setNuevo(true)}>
            Nuevo usuario
          </Boton>
        </div>

        {q.isLoading ? (
          <FilasEsqueleto />
        ) : lista.length === 0 ? (
          <Vacio icono={<Users />} titulo="Sin usuarios que coincidan" />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {lista.map((u) => (
              <motion.li key={u.id} variants={itemEscalonado}>
                <button
                  onClick={() => setSeleccionado(u.id)}
                  className={cn("flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-superficie-2/60", !u.activo && "opacity-55")}
                >
                  <Avatar nombre={u.nombre_completo || u.email} tamano={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{u.nombre_completo || "Sin nombre"}</span>
                      {u.id === sesion?.user.id && <span className="text-xs text-texto-3">(tú)</span>}
                    </span>
                    <span className="block truncate text-xs text-texto-3">
                      {[u.nombre_usuario && `@${u.nombre_usuario}`, correoVisible(u.email)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    {u.es_superadmin && (
                      <Insignia tono="marca">
                        <ShieldCheck className="size-3" /> Superadmin
                      </Insignia>
                    )}
                    {!u.activo && <Insignia tono="peligro">Desactivado</Insignia>}
                  </span>
                  <span className="w-28 text-right text-xs text-texto-2">
                    {u.sistemas} sistema{u.sistemas === 1 ? "" : "s"}
                  </span>
                  <span className="w-32 text-right text-xs text-texto-3" title={fechaHora(u.ultimo_acceso)}>
                    {u.ultimo_acceso ? relativo(u.ultimo_acceso) : "Nunca entró"}
                  </span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Tarjeta>

      <DetalleUsuario usuario={usuario} onCerrar={() => setSeleccionado(null)} onCredenciales={setCredenciales} />
      <NuevoUsuario abierto={nuevo} onCerrar={() => setNuevo(false)} onCreado={setCredenciales} />
      <MostrarCredenciales datos={credenciales} onCerrar={() => setCredenciales(null)} />
    </>
  );
}

function NuevoUsuario({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (c: Credenciales) => void;
}) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [superadmin, setSuperadmin] = useState(false);

  useEffect(() => {
    if (abierto) {
      setNombre("");
      setUsuario("");
      setEmail("");
      setSuperadmin(false);
    }
  }, [abierto]);

  const m = useMutation({
    mutationFn: () =>
      invocar<{ password_temporal: string; nombre_usuario: string }>("plataforma-usuarios", {
        accion: "crear",
        nombre_completo: nombre,
        nombre_usuario: usuario,
        email: email.trim() || undefined,
        es_superadmin: superadmin,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: CLAVE });
      onCerrar();
      onCreado({ usuario: r.nombre_usuario, password: r.password_temporal });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Nuevo usuario"
      descripcion="Después podrás darle acceso a uno o varios sistemas desde su ficha."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={nombre.trim().length < 3 || !USUARIO_RE.test(usuario)} onClick={() => m.mutate()}>
            Crear usuario
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada
          etiqueta="Nombre completo"
          value={nombre}
          onChange={(e) => {
            if (!usuario || usuario === sugerirUsuario(nombre)) setUsuario(sugerirUsuario(e.target.value));
            setNombre(e.target.value);
          }}
        />
        <Entrada
          etiqueta="Usuario"
          autoCapitalize="none"
          spellCheck={false}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s/g, ""))}
          ayuda="Con él inicia sesión."
        />
        <Entrada etiqueta="Correo (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Interruptor activo={superadmin} onChange={setSuperadmin} etiqueta="Superadministración de la plataforma" />
      </div>
    </Modal>
  );
}

interface MembresiaUsuario {
  id: string;
  sistema_id: string;
  roles: Rol[];
  activo: boolean;
  sistema: { nombre: string; color_marca: string } | null;
}

function DetalleUsuario({
  usuario,
  onCerrar,
  onCredenciales,
}: {
  usuario: UsuarioPlataforma | null;
  onCerrar: () => void;
  onCredenciales: (c: Credenciales) => void;
}) {
  const { sesion, recargar } = useSesion();
  const qc = useQueryClient();
  const [ultimo, setUltimo] = useState(usuario);
  const [nombre, setNombre] = useState("");
  const [usuarioAcceso, setUsuarioAcceso] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [superadmin, setSuperadmin] = useState(false);
  const [agregando, setAgregando] = useState<{ sistema: string; roles: Rol[] } | null>(null);
  const [asignar, setAsignar] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    setUltimo(usuario);
    setNombre(usuario.nombre_completo);
    setUsuarioAcceso(usuario.nombre_usuario ?? "");
    setEmail(usuario.email);
    setTelefono(usuario.telefono ?? "");
    setSuperadmin(usuario.es_superadmin);
    setAgregando(null);
  }, [usuario]);

  const u = usuario ?? ultimo;
  const soyYo = u?.id === sesion?.user.id;

  const membresias = useQuery({
    queryKey: ["plataforma-membresias", u?.id],
    enabled: !!usuario,
    queryFn: async () =>
      datos(
        await supabase
          .from("membresias")
          .select("id, sistema_id, roles, activo, sistema:sistemas(nombre, color_marca)")
          .eq("usuario_id", u!.id)
          .order("creado_en"),
      ) as unknown as MembresiaUsuario[],
  });

  const sistemas = useQuery({
    queryKey: ["plataforma-lista-sistemas"],
    enabled: !!usuario,
    queryFn: async () => datos(await supabase.from("sistemas").select("id, nombre").order("nombre")) ?? [],
  });

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: CLAVE });
    await qc.invalidateQueries({ queryKey: ["plataforma-membresias", u?.id] });
    if (soyYo) await recargar();
  };

  const accion = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => invocar<{ password_temporal?: string; nombre_usuario?: string | null }>("plataforma-usuarios", { usuario_id: u!.id, ...cuerpo }),
    onSuccess: async (r, cuerpo) => {
      await refrescar();
      if (cuerpo.accion === "restablecer_password" && r.password_temporal)
        onCredenciales({ usuario: r.nombre_usuario ?? u!.email, password: r.password_temporal });
      else if (cuerpo.accion === "desactivar") toast.success("Usuario desactivado: ya no puede entrar a MEDORA.");
      else if (cuerpo.accion === "activar") toast.success("Usuario reactivado.");
      else toast.success("Cambios guardados.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const guardarMembresia = useMutation({
    mutationFn: async ({ id, roles, activo }: { id: string; roles?: Rol[]; activo?: boolean }) => {
      const cambios: { roles?: Rol[]; activo?: boolean } = {};
      if (roles) cambios.roles = roles;
      if (activo !== undefined) cambios.activo = activo;
      const { error } = await supabase.from("membresias").update(cambios).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: (e) => toast.error(mensajeError(e)),
  });

  const agregar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("membresias").insert({ sistema_id: agregando!.sistema, usuario_id: u!.id, roles: agregando!.roles });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Acceso agregado");
      setAgregando(null);
      await refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  if (!u) return null;
  const disponibles = (sistemas.data ?? []).filter((s) => !membresias.data?.some((m) => m.sistema_id === s.id));
  const cambiosDatos = nombre !== u.nombre_completo || usuarioAcceso !== (u.nombre_usuario ?? "") || email !== u.email || telefono !== (u.telefono ?? "") || superadmin !== u.es_superadmin;

  return (
    <Modal
      lateral
      abierto={!!usuario}
      onCerrar={onCerrar}
      titulo={
        <span className="flex items-center gap-3">
          <Avatar nombre={u.nombre_completo || u.email} tamano={32} />
          <span>{u.nombre_completo || u.email}</span>
        </span>
      }
      descripcion={`Registrado ${fechaHora(u.creado_en)} · último acceso ${u.ultimo_acceso ? relativo(u.ultimo_acceso) : "nunca"}`}
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <h3 className="text-[0.6875rem] font-semibold tracking-wide text-texto-3 uppercase">Cuenta</h3>
          <Entrada etiqueta="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Entrada
              etiqueta="Usuario de acceso"
              autoCapitalize="none"
              spellCheck={false}
              value={usuarioAcceso}
              onChange={(e) => setUsuarioAcceso(e.target.value.toLowerCase().replace(/\s/g, ""))}
              error={usuarioAcceso && !USUARIO_RE.test(usuarioAcceso) ? "Solo minúsculas, números, punto o guion" : undefined}
            />
            <Entrada etiqueta="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            <Entrada
              etiqueta="Correo"
              type="email"
              contenedor="col-span-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              ayuda="Identidad interna y contacto. Para entrar se usa el usuario (o este correo si no tiene usuario)."
            />
          </div>
          <Interruptor activo={superadmin} onChange={setSuperadmin} etiqueta="Superadministración de la plataforma" />
          <AnimatePresence initial={false}>
            {cambiosDatos && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex justify-end gap-2 pt-1">
                  <Boton
                    variante="secundario"
                    onClick={() => {
                      setNombre(u.nombre_completo);
                      setUsuarioAcceso(u.nombre_usuario ?? "");
                      setEmail(u.email);
                      setTelefono(u.telefono ?? "");
                      setSuperadmin(u.es_superadmin);
                    }}
                  >
                    Descartar
                  </Boton>
                  <Boton
                    cargando={accion.isPending && accion.variables?.accion === "actualizar"}
                    onClick={() =>
                      accion.mutate({
                        accion: "actualizar",
                        nombre_completo: nombre,
                        telefono,
                        es_superadmin: superadmin,
                        ...(email !== u.email ? { email } : {}),
                        ...(usuarioAcceso && usuarioAcceso !== u.nombre_usuario ? { nombre_usuario: usuarioAcceso } : {}),
                      })
                    }
                  >
                    Guardar cuenta
                  </Boton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[0.6875rem] font-semibold tracking-wide text-texto-3 uppercase">Acceso a sistemas</h3>
            {!agregando && disponibles.length > 0 && (
              <Boton tamano="sm" variante="secundario" icono={<Plus className="size-3.5" />} onClick={() => setAgregando({ sistema: disponibles[0].id, roles: [] })}>
                Agregar a un sistema
              </Boton>
            )}
          </div>

          <AnimatePresence initial={false}>
            {agregando && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mb-3 space-y-3 rounded-xl border border-dashed border-borde-fuerte p-4">
                  <Selector etiqueta="Sistema" value={agregando.sistema} onChange={(e) => setAgregando({ ...agregando, sistema: e.target.value })}>
                    {disponibles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </Selector>
                  <SelectorRoles valor={agregando.roles} onChange={(roles) => setAgregando({ ...agregando, roles })} />
                  <div className="flex justify-end gap-2">
                    <Boton variante="fantasma" onClick={() => setAgregando(null)}>
                      Cancelar
                    </Boton>
                    <Boton cargando={agregar.isPending} disabled={agregando.roles.length === 0} onClick={() => agregar.mutate()}>
                      Dar acceso
                    </Boton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {(membresias.data?.length ?? 0) === 0 ? (
            <p className="rounded-xl bg-superficie-2 px-4 py-5 text-center text-sm text-texto-3">No tiene acceso a ningún sistema.</p>
          ) : (
            <ul className="space-y-2.5">
              {membresias.data!.map((m) => (
                <FilaMembresia key={m.id} m={m} guardando={guardarMembresia.isPending} onGuardar={(c) => guardarMembresia.mutate({ id: m.id, ...c })} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[0.6875rem] font-semibold tracking-wide text-texto-3 uppercase">Seguridad</h3>
          <div className="flex items-center gap-3 rounded-xl border border-borde p-4">
            <KeyRound className="size-4 text-texto-3" />
            <div className="flex-1">
              <p className="text-sm font-medium">Restablecer contraseña</p>
              <p className="text-xs text-texto-3">Genera una contraseña temporal; deberá cambiarla al entrar.</p>
            </div>
            <Boton variante="secundario" tamano="sm" cargando={accion.isPending && accion.variables?.accion === "restablecer_password"} onClick={() => accion.mutate({ accion: "restablecer_password" })}>
              Restablecer
            </Boton>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-borde p-4">
            <LockKeyhole className="size-4 text-texto-3" />
            <div className="flex-1">
              <p className="text-sm font-medium">Asignar contraseña</p>
              <p className="text-xs text-texto-3">Escribe tú la contraseña; puedes pedir que la cambie al entrar.</p>
            </div>
            <Boton variante="secundario" tamano="sm" onClick={() => setAsignar(true)}>
              Asignar
            </Boton>
          </div>
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4",
              u.activo ? "border-[color-mix(in_oklab,var(--peligro)_30%,var(--borde))]" : "border-borde",
            )}
          >
            <Power className={cn("size-4", u.activo ? "text-peligro" : "text-exito")} />
            <div className="flex-1">
              <p className="text-sm font-medium">{u.activo ? "Desactivar usuario" : "Reactivar usuario"}</p>
              <p className="text-xs text-texto-3">
                {soyYo
                  ? "No puedes desactivar tu propia cuenta."
                  : u.activo
                    ? "Bloquea el inicio de sesión y corta el acceso a todos los sistemas al instante."
                    : "Vuelve a permitir el inicio de sesión con sus accesos anteriores."}
              </p>
            </div>
            <Boton
              variante={u.activo ? "peligro" : "secundario"}
              tamano="sm"
              disabled={soyYo}
              cargando={accion.isPending && (accion.variables?.accion === "desactivar" || accion.variables?.accion === "activar")}
              onClick={() => accion.mutate({ accion: u.activo ? "desactivar" : "activar" })}
            >
              {u.activo ? "Desactivar" : "Reactivar"}
            </Boton>
          </div>
        </section>
      </div>
      <AsignarPassword
        usuario={asignar ? { id: u.id, nombre: u.nombre_completo, acceso: u.nombre_usuario ?? u.email } : null}
        onCerrar={() => setAsignar(false)}
      />
    </Modal>
  );
}

function FilaMembresia({
  m,
  guardando,
  onGuardar,
}: {
  m: MembresiaUsuario;
  guardando: boolean;
  onGuardar: (c: { roles?: Rol[]; activo?: boolean }) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [roles, setRoles] = useState<Rol[]>(m.roles);
  useEffect(() => setRoles(m.roles), [m.roles]);

  return (
    <li className={cn("rounded-xl border border-borde p-3.5", !m.activo && "opacity-60")}>
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: m.sistema?.color_marca }}>
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{m.sistema?.nombre}</p>
          {!editando && (
            <div className="mt-1 flex flex-wrap gap-1">
              {m.roles.map((r) => (
                <Insignia key={r}>{ETIQUETA_ROL[r]}</Insignia>
              ))}
            </div>
          )}
        </div>
        <Interruptor activo={m.activo} onChange={(activo) => onGuardar({ activo })} />
        {!editando && (
          <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(true)}>
            Roles
          </Boton>
        )}
      </div>
      <AnimatePresence initial={false}>
        {editando && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-3 pt-3">
              <SelectorRoles valor={roles} onChange={setRoles} />
              <div className="flex justify-end gap-2">
                <Boton variante="fantasma" tamano="sm" onClick={() => (setRoles(m.roles), setEditando(false))}>
                  Cancelar
                </Boton>
                <Boton
                  tamano="sm"
                  cargando={guardando}
                  disabled={roles.length === 0}
                  onClick={() => {
                    onGuardar({ roles });
                    setEditando(false);
                  }}
                >
                  Guardar roles
                </Boton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
