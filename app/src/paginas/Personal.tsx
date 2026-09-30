import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, KeyRound, LockKeyhole, MoreHorizontal, Pencil, Search, Trash2, UserPlus, Users, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useConectados } from "@/lib/presencia";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Campo, Entrada, Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { ItemMenu, Menu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, usePersonal, useSedes, type Miembro } from "@/lib/consultas";
import { ETIQUETA_MODULO, ETIQUETA_ROL, MODULOS_AJUSTABLES, puedeEscribir, ROLES, ROLES_PROFESIONALES, type Permisos } from "@/lib/permisos";
import { datos, invocar, mensajeError, supabase, type Rol } from "@/lib/supabase";
import { cn, correoVisible, sugerirUsuario, USUARIO_RE } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { IMPORTACIONES } from "@/lib/importaciones";

const COLUMNAS_PERSONAL: ColumnaDatos<Miembro>[] = [
  { titulo: "Nombre", valor: (m) => m.perfil?.nombre_completo },
  { titulo: "Usuario", valor: (m) => m.perfil?.nombre_usuario },
  { titulo: "Correo", valor: (m) => correoVisible(m.perfil?.email) },
  { titulo: "Roles", valor: (m) => m.roles.map((r) => ETIQUETA_ROL[r]).join(", ") },
  { titulo: "Especialidad", valor: (m) => m.especialidad },
  { titulo: "Exequátur", valor: (m) => m.exequatur },
  { titulo: "Atiende citas", valor: (m) => m.atiende_agenda },
  { titulo: "Estado", valor: (m) => (m.activo ? "Activo" : "Inactivo") },
  { titulo: "Desde", valor: (m) => m.creado_en, tipo: "fecha" },
];

export default function Personal() {
  const { sistema, sistemaId } = useSistema();
  const personal = usePersonal(sistemaId);
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<Miembro | null>(null);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  const [asignar, setAsignar] = useState<Miembro | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const [eliminar, setEliminar] = useState<Miembro | null>(null);
  const { esSuperadmin, sesion } = useSesion();
  const { roles } = useSistema();
  const navegar = useNavigate();
  const qc = useQueryClient();

  // Quién ya está en nómina (empleado activo vinculado a su usuario).
  const verNomina = puedeEscribir.nomina(roles);
  const enLinea = new Set(useConectados(sistemaId).map((c) => c.id));
  const enNomina = useQuery({
    queryKey: ["empleados-vinculados", sistemaId],
    enabled: verNomina,
    queryFn: async () =>
      new Set(
        (datos(await supabase.from("empleados").select("usuario_id").eq("sistema_id", sistemaId).eq("activo", true).not("usuario_id", "is", null)) ?? []).map(
          (e) => e.usuario_id as string,
        ),
      ),
  });

  const quitar = useMutation({
    mutationFn: async (m: Miembro) => datos(await supabase.rpc("eliminar_miembro", { p_sistema: sistemaId, p_usuario: m.usuario_id })),
    onSuccess: (_r, m) => {
      toast.success(`${m.perfil?.nombre_completo ?? "La persona"} ya no tiene acceso a ${sistema.nombre}`);
      void qc.invalidateQueries({ queryKey: claves.personal(sistemaId) });
      setEliminar(null);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const restablecer = useMutation({
    mutationFn: async (m: Miembro) => {
      const r = await invocar<{ password_temporal: string; nombre_usuario: string | null }>("gestion-usuarios", {
        accion: "restablecer_password",
        sistema_id: sistemaId,
        usuario_id: m.usuario_id,
      });
      return { usuario: r.nombre_usuario ?? m.perfil?.email ?? "", password: r.password_temporal };
    },
    onSuccess: setCredenciales,
    onError: (e) => toast.error((e as Error).message),
  });

  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState<Rol | null>(null);

  const visibles = useMemo(() => (personal.data ?? []).filter((m) => verInactivos || m.activo), [personal.data, verInactivos]);

  // Solo los roles que existen en este hospital, con cuántas personas los tienen.
  const rolesPresentes = useMemo(
    () => ROLES.map((r) => [r, visibles.filter((m) => m.roles.includes(r)).length] as const).filter(([, n]) => n > 0),
    [visibles],
  );

  const lista = useMemo(() => {
    const t = norm(texto.trim());
    return visibles
      .filter((m) => !rol || m.roles.includes(rol))
      .filter((m) => !t || norm([m.perfil?.nombre_completo, m.perfil?.nombre_usuario, correoVisible(m.perfil?.email), m.especialidad].filter(Boolean).join(" ")).includes(t))
      .sort((a, b) => (a.perfil?.nombre_completo ?? "").localeCompare(b.perfil?.nombre_completo ?? "", "es", { sensitivity: "base" }));
  }, [visibles, rol, texto]);

  return (
    <>
      <EncabezadoPagina
        titulo="Personal"
        descripcion={`Personas con acceso a ${sistema.nombre} y sus roles.`}
        acciones={
          <>
            <Interruptor activo={verInactivos} onChange={setVerInactivos} etiqueta="Mostrar inactivos" />
            <AccionesDatos
              titulo="Personal"
              columnas={COLUMNAS_PERSONAL}
              importaciones={[IMPORTACIONES.personal]}
              onImportado={() => void personal.refetch()}
              obtener={async () => personal.data ?? []}
            />
            <Boton icono={<UserPlus className="size-4" />} onClick={() => setNuevo(true)}>
              Agregar personal
            </Boton>
          </>
        }
      />

      <Tarjeta className="overflow-hidden">
        <div className="space-y-3 border-b border-borde p-3">
          <Entrada icono={<Search />} placeholder="Buscar por nombre, usuario, correo o especialidad…" value={texto} onChange={(e) => setTexto(e.target.value)} contenedor="max-w-md" />
          <div className="flex flex-wrap gap-1.5">
            <ChipRol activo={!rol} onClick={() => setRol(null)}>
              Todos <span className="text-texto-3">{visibles.length}</span>
            </ChipRol>
            {rolesPresentes.map(([r, n]) => (
              <ChipRol key={r} activo={rol === r} onClick={() => setRol(rol === r ? null : r)}>
                {ETIQUETA_ROL[r]} <span className="text-texto-3">{n}</span>
              </ChipRol>
            ))}
          </div>
        </div>
        {personal.isLoading ? (
          <FilasEsqueleto />
        ) : lista.length === 0 ? (
          visibles.length === 0 ? (
            <Vacio icono={<Users />} titulo="Sin personal" descripcion="Agrega a médicos, enfermería, recepción y caja." />
          ) : (
            <Vacio icono={<Search />} titulo="Nadie coincide" descripcion="Prueba con otro nombre o quita el filtro de rol." />
          )
        ) : (
          <motion.ul key={`${rol}-${texto}`} variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {lista.map((m) => (
              <motion.li key={m.id} variants={itemEscalonado} className={cn("flex items-center gap-4 px-5 py-3.5", !m.activo && "opacity-50")}>
                <span className="relative shrink-0">
                  <Avatar nombre={m.perfil?.nombre_completo} foto={m.perfil?.foto} tamano={36} />
                  {enLinea.has(m.usuario_id) && (
                    <span title="Conectado ahora" className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-exito ring-2 ring-superficie" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.perfil?.nombre_completo}
                    {m.especialidad && <span className="font-normal text-texto-3"> · {m.especialidad}</span>}
                  </p>
                  <p className="truncate text-xs text-texto-3">
                    {[m.perfil?.nombre_usuario && `@${m.perfil.nombre_usuario}`, correoVisible(m.perfil?.email)].filter(Boolean).join(" · ") || "Sin usuario asignado"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {m.roles.map((r) => (
                    <Insignia key={r} tono={r === "admin" ? "marca" : r === "medico" ? "info" : "neutro"}>
                      {ETIQUETA_ROL[r]}
                    </Insignia>
                  ))}
                  {enNomina.data?.has(m.usuario_id) && <Insignia tono="exito">En nómina</Insignia>}
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
                      {esSuperadmin && (
                        <ItemMenu icono={<LockKeyhole />} onClick={() => (setAsignar(m), cerrar())}>
                          Asignar contraseña…
                        </ItemMenu>
                      )}
                      {verNomina && (
                        <ItemMenu icono={<WalletCards />} onClick={() => (navegar(`/nomina?vista=empleados&vincular=${m.usuario_id}`), cerrar())}>
                          {enNomina.data?.has(m.usuario_id) ? "Ver en nómina" : "Agregar a nómina"}
                        </ItemMenu>
                      )}
                      {m.usuario_id !== sesion?.user.id && (
                        <ItemMenu icono={<Trash2 />} peligro onClick={() => (setEliminar(m), cerrar())}>
                          Eliminar del sistema…
                        </ItemMenu>
                      )}
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
      <Modal
        abierto={!!eliminar}
        onCerrar={() => setEliminar(null)}
        titulo="Eliminar del sistema"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setEliminar(null)} disabled={quitar.isPending}>
              Cancelar
            </Boton>
            <Boton variante="peligro" cargando={quitar.isPending} onClick={() => eliminar && quitar.mutate(eliminar)}>
              Eliminar
            </Boton>
          </>
        }
      >
        <p className="text-sm leading-relaxed">
          <strong className="font-semibold">{eliminar?.perfil?.nombre_completo}</strong> dejará de tener acceso a {sistema.nombre} y
          desaparecerá de esta lista.
        </p>
        <p className="mt-2 text-xs text-texto-3">
          Lo que hizo (citas, cobros, notas clínicas, auditoría) se conserva con su nombre. Si está en nómina, su ficha de empleado no
          cambia: desactívala o elimínala en Nómina si ya no trabaja aquí.
        </p>
      </Modal>
      <AsignarPassword
        usuario={
          asignar && {
            id: asignar.usuario_id,
            nombre: asignar.perfil?.nombre_completo ?? "",
            acceso: asignar.perfil?.nombre_usuario ?? asignar.perfil?.email ?? "",
          }
        }
        onCerrar={() => setAsignar(null)}
      />
    </>
  );
}

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function ChipRol({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150",
        activo ? "border-marca bg-marca-suave text-marca-texto" : "border-borde text-texto-2 hover:border-borde-fuerte hover:text-texto",
      )}
    >
      {children}
    </button>
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
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors duration-150",
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
  onCreado: (c: Credenciales) => void;
}) {
  const { sistemaId } = useSistema();
  const sedes = useSedes(sistemaId);
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [especialidad, setEspecialidad] = useState("");
  const [exequatur, setExequatur] = useState("");
  const [sede, setSede] = useState("");
  const [agenda, setAgenda] = useState(false);

  useEffect(() => {
    setAgenda(roles.some((x) => ROLES_PROFESIONALES.includes(x)));
  }, [roles]);

  useEffect(() => {
    if (abierto) {
      setNombre("");
      setUsuario("");
      setUsuarioEditado(false);
      setEmail("");
      setRoles([]);
      setEspecialidad("");
      setExequatur("");
      setSede("");
    }
  }, [abierto]);

  const m = useMutation({
    mutationFn: () =>
      invocar<{ password_temporal: string | null; ya_existia: boolean; nombre_usuario: string }>("gestion-usuarios", {
        accion: "crear",
        sistema_id: sistemaId,
        nombre_usuario: usuario,
        email: email.trim() || undefined,
        nombre_completo: nombre,
        roles,
        especialidad: especialidad || null,
        exequatur: exequatur || null,
        sede_id: sede || null,
        atiende_agenda: agenda,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: claves.personal(sistemaId) });
      onCerrar();
      if (r.password_temporal) onCreado({ usuario: r.nombre_usuario, password: r.password_temporal });
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
          <Boton cargando={m.isPending} disabled={nombre.trim().length < 3 || !USUARIO_RE.test(usuario) || roles.length === 0} onClick={() => m.mutate()}>
            Crear acceso
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada
          etiqueta="Nombre completo"
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            if (!usuarioEditado) setUsuario(sugerirUsuario(e.target.value));
          }}
        />
        <div className="grid grid-cols-2 gap-4">
          <Entrada
            etiqueta="Usuario"
            autoCapitalize="none"
            spellCheck={false}
            value={usuario}
            onChange={(e) => {
              setUsuarioEditado(true);
              setUsuario(e.target.value.toLowerCase().replace(/\s/g, ""));
            }}
            error={usuario && !USUARIO_RE.test(usuario) ? "Solo minúsculas, números, punto o guion" : undefined}
            ayuda="Con él inicia sesión."
          />
          <Entrada etiqueta="Correo (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <SelectorRoles valor={roles} onChange={setRoles} />
        <AnimatePresence initial={false}>
          {roles.some((x) => ROLES_PROFESIONALES.includes(x)) && (
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
        <Interruptor activo={agenda} onChange={setAgenda} etiqueta="Atiende citas (aparece como columna en la agenda)" />
      </div>
    </Modal>
  );
}

/** Acceso por módulo de una persona: según su rol, o permitido/bloqueado a mano. Solo superadmin. */
function EditorPermisos({ valor, onChange }: { valor: Permisos; onChange: (p: Permisos) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[0.8125rem] font-medium text-texto-2">Acceso por módulo</p>
        <p className="text-xs text-texto-3">"Según rol" usa lo que dan sus roles. Permitir o bloquear lo fija para esta persona.</p>
      </div>
      <div className="divide-y divide-borde rounded-xl border border-borde">
        {MODULOS_AJUSTABLES.map((m) => {
          const actual = valor[m] === true ? "si" : valor[m] === false ? "no" : "rol";
          return (
            <div key={m} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm">{ETIQUETA_MODULO[m]}</span>
              <Segmentado
                id={`permiso-${m}`}
                valor={actual}
                onChange={(v) => {
                  const siguiente = { ...valor };
                  if (v === "rol") delete siguiente[m];
                  else siguiente[m] = v === "si";
                  onChange(siguiente);
                }}
                opciones={[
                  { valor: "rol", etiqueta: "Según rol" },
                  { valor: "si", etiqueta: "Permitir" },
                  { valor: "no", etiqueta: "Bloquear" },
                ]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditarMiembro({ miembro, onCerrar }: { miembro: Miembro | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const { sesion, esSuperadmin } = useSesion();
  const [permisos, setPermisos] = useState<Permisos>({});
  const sedes = useSedes(sistemaId);
  const qc = useQueryClient();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [especialidad, setEspecialidad] = useState("");
  const [exequatur, setExequatur] = useState("");
  const [sede, setSede] = useState("");
  const [activo, setActivo] = useState(true);
  const [agenda, setAgenda] = useState(false);
  const [nombre, setNombre] = useState("");
  const [consultorio, setConsultorio] = useState("");

  useEffect(() => {
    if (!miembro) return;
    setNombre(miembro.perfil?.nombre_completo ?? "");
    setConsultorio(miembro.consultorio ?? "");
    setAgenda(miembro.atiende_agenda);
    setRoles(miembro.roles);
    setEspecialidad(miembro.especialidad ?? "");
    setExequatur(miembro.exequatur ?? "");
    setSede(miembro.sede_id ?? "");
    setActivo(miembro.activo);
    setPermisos(miembro.permisos ?? {});
  }, [miembro]);

  const soyYo = miembro?.usuario_id === sesion?.user.id;

  const m = useMutation({
    mutationFn: async () => {
      if (nombre.trim() !== (miembro!.perfil?.nombre_completo ?? "")) {
        datos(await supabase.rpc("renombrar_miembro", { p_sistema: sistemaId, p_usuario: miembro!.usuario_id, p_nombre: nombre }));
      }
      const { error } = await supabase
        .from("membresias")
        .update({
          roles,
          especialidad: especialidad || null,
          exequatur: exequatur || null,
          sede_id: sede || null,
          activo,
          atiende_agenda: agenda,
          consultorio: consultorio.trim() || null,
          // Solo la superadministración cambia permisos (lo exige un trigger en Postgres).
          ...(esSuperadmin ? { permisos } : {}),
        })
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
      descripcion={[miembro?.perfil?.nombre_usuario && `@${miembro.perfil.nombre_usuario}`, correoVisible(miembro?.perfil?.email)].filter(Boolean).join(" · ")}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={roles.length === 0 || nombre.trim().length < 2} onClick={() => m.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada etiqueta="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
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
        <Interruptor activo={agenda} onChange={setAgenda} etiqueta="Atiende citas (aparece como columna en la agenda)" />
        {agenda && (
          <Entrada
            etiqueta="Consultorio"
            placeholder="Ej. 3"
            value={consultorio}
            onChange={(e) => setConsultorio(e.target.value)}
            ayuda="Se anuncia al llamar su turno: «Turno MG-012, consultorio 3»."
          />
        )}
        <Interruptor activo={activo} onChange={setActivo} etiqueta={activo ? "Acceso activo" : "Acceso desactivado"} />
        {esSuperadmin && <EditorPermisos valor={permisos} onChange={setPermisos} />}
      </div>
    </Modal>
  );
}

/** El superadmin escribe la contraseña que quiera (y decide si debe cambiarla al entrar). */
export function AsignarPassword({ usuario, onCerrar }: { usuario: { id: string; nombre: string; acceso: string } | null; onCerrar: () => void }) {
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [debeCambiar, setDebeCambiar] = useState(false);

  useEffect(() => {
    if (usuario) {
      setPassword("");
      setVer(false);
      setDebeCambiar(false);
    }
  }, [usuario]);

  const m = useMutation({
    mutationFn: () => invocar("plataforma-usuarios", { accion: "establecer_password", usuario_id: usuario!.id, password, debe_cambiar: debeCambiar }),
    onSuccess: () => {
      toast.success(`Contraseña de ${usuario!.acceso} actualizada.`);
      onCerrar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Modal
      abierto={!!usuario}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Asignar contraseña"
      descripcion={usuario ? `${usuario.nombre} · ${usuario.acceso}` : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={password.length < 8} onClick={() => m.mutate()}>
            Guardar contraseña
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Entrada
          etiqueta="Nueva contraseña"
          type={ver ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          ayuda="Mínimo 8 caracteres."
        />
        <Interruptor activo={ver} onChange={setVer} etiqueta="Mostrar contraseña" />
        <Interruptor activo={debeCambiar} onChange={setDebeCambiar} etiqueta="Pedir que la cambie al entrar" />
      </div>
    </Modal>
  );
}

export interface Credenciales {
  usuario: string;
  password: string;
}

export function MostrarCredenciales({ datos, onCerrar }: { datos: Credenciales | null; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(`MEDORA\nUsuario: ${datos?.usuario}\nContraseña temporal: ${datos?.password}`);
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
          <p className="text-sm font-medium">{datos?.usuario}</p>
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
