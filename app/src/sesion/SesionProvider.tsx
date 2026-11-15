import { useQuery, useQueryClient } from "@tanstack/react-query";
import { borrarCacheOperativa } from "@/lib/sinConexion";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { marcarSalidaInvoluntaria } from "@/lib/equipo";
import { datos, fijarVerComo, supabase, type Fila, type Rol } from "@/lib/supabase";
import type { Permisos } from "@/lib/permisos";
import { sincronizarDesdePerfil } from "@/lib/preferencias";
import { contextoMonitoreo } from "@/lib/monitoreo";
import { capacidadesSede, type Capacidad } from "@/lib/capacidades";
import type { Naturaleza } from "@/lib/fundacion";
import { aplicarColorMarca } from "@/lib/tema";

/** Sede (local físico) del sistema activo, con su tipo y capacidades. */
export interface SedeAcceso {
  id: string;
  nombre: string;
  tipo: string;
  capacidades: Record<string, boolean> | null;
  activo: boolean;
}

export interface SistemaAcceso {
  id: string;
  nombre: string;
  slug: string;
  color_marca: string;
  /** Logo de la marca (menú, quiosco, pantalla de la sala). */
  logo_url: string | null;
  /** Logo de impresión (facturas, recibos, tickets). */
  logo_factura: string | null;
  moneda: string;
  zona_horaria: string;
  activo: boolean;
  roles: Rol[];
  /** Permisos por módulo de mi membresía (anulan lo que da el rol). */
  permisos: Permisos;
}

interface ContextoSesion {
  cargando: boolean;
  sesion: Session | null;
  perfil: Fila<"perfiles"> | null;
  sistemas: SistemaAcceso[];
  sistema: SistemaAcceso | null;
  /** Sedes del sistema activo y la sede en la que se está operando. */
  sedes: SedeAcceso[];
  sede: SedeAcceso | null;
  /** Capacidades efectivas de la sede activa (según su tipo + overrides). */
  capacidades: Partial<Record<Capacidad, boolean>>;
  cambiarSede: (id: string) => void;
  /** Cómo se financia el sistema: privada, fundación (ASFL) o pública. Activa los módulos de fundación. */
  naturaleza: Naturaleza;
  roles: Rol[];
  permisos: Permisos;
  /** Falso mientras se usa «ver como» (para probar exactamente lo que ve ese rol). */
  esSuperadmin: boolean;
  /** «Ver como» (superadmin): roles simulados, o null. Postgres los usa solo para restar permisos. */
  verComo: Rol[] | null;
  cambiarVerComo: (roles: Rol[] | null) => void;
  /** Superadmin de verdad (aunque esté viendo como otro rol). */
  esSuperadminReal: boolean;
  /** Mis roles reales en el sistema activo (los que se pueden simular). */
  rolesReales: Rol[];
  /** La cuenta tiene 2FA y esta sesión todavía no pasó el código (aal1 → aal2). */
  requiereSegundoPaso: boolean;
  /** Vuelve a leer el nivel de verificación (tras activar o quitar el 2FA). */
  actualizarVerificacion: () => Promise<void>;
  cambiarSistema: (id: string) => void;
  cerrarSesion: () => Promise<void>;
  recargar: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);
const CLAVE_SISTEMA = "medora.sistema";
const CLAVE_SEDE = "medora.sede";
// En sessionStorage: cerrar la app vuelve a la vista propia.
const CLAVE_VER_COMO = "medora.ver-como";

function leerVerComo(): Rol[] | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE_VER_COMO) ?? "null") as unknown;
    const roles = Array.isArray(v) ? (v.filter((x) => typeof x === "string") as Rol[]) : null;
    fijarVerComo(roles);
    return roles?.length ? roles : null;
  } catch {
    return null;
  }
}

function leerSistemaGuardado() {
  try {
    return localStorage.getItem(CLAVE_SISTEMA);
  } catch {
    return null;
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [sesion, setSesion] = useState<Session | null>(null);
  const [sesionLista, setSesionLista] = useState(false);
  const [sistemaId, setSistemaId] = useState<string | null>(leerSistemaGuardado);
  const saliendo = useRef(false);
  // Se lee antes de cualquier consulta, así la cabecera ya va en la primera petición.
  const [verComo, setVerComo] = useState<Rol[] | null>(leerVerComo);
  const [sedeId, setSedeId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLAVE_SEDE);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setSesionLista(true);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (evento === "SIGNED_OUT") {
        qc.clear();
        // Cerrada sin pedirlo (vencida, cerrada por soporte o al restablecer contraseñas):
        // el login lo explica en vez de aparecer sin más.
        if (!saliendo.current) marcarSalidaInvoluntaria();
        saliendo.current = false;
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const usuarioId = sesion?.user.id;

  // Nivel de verificación de la sesión (Supabase Auth MFA). Se lee del token y de
  // los factores del usuario; cambia al pasar el código (MFA_CHALLENGE_VERIFIED).
  const [aal, setAal] = useState<{ actual: string | null; siguiente: string | null } | null>(null);
  const tokenSesion = sesion?.access_token;
  const actualizarVerificacion = useCallback(async () => {
    if (!tokenSesion) {
      setAal(null);
      return;
    }
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal({ actual: data?.currentLevel ?? null, siguiente: data?.nextLevel ?? null });
  }, [tokenSesion]);
  useEffect(() => {
    void actualizarVerificacion();
  }, [actualizarVerificacion]);
  const requiereSegundoPaso = !!aal && aal.siguiente === "aal2" && aal.actual !== "aal2";

  const perfilQ = useQuery({
    queryKey: ["perfil", usuarioId],
    enabled: !!usuarioId,
    queryFn: async () => datos(await supabase.from("perfiles").select("*").eq("id", usuarioId!).single()),
  });

  const sistemasQ = useQuery({
    queryKey: ["mis-sistemas", usuarioId],
    enabled: !!usuarioId,
    queryFn: async () => (datos(await supabase.rpc("mis_sistemas_detalle")) ?? []) as SistemaAcceso[],
  });

  const sistemas = useMemo(() => sistemasQ.data ?? [], [sistemasQ.data]);
  const sistema =
    sistemas.find((s) => s.id === sistemaId) ??
    sistemas.find((s) => s.id === perfilQ.data?.ultimo_sistema_id) ??
    sistemas.find((s) => s.roles.length > 0) ??
    sistemas[0] ??
    null;

  // Sedes del sistema activo y la sede en la que se opera (modelo por sede).
  const sedesQ = useQuery({
    queryKey: ["sedes", sistema?.id],
    enabled: !!sistema?.id,
    queryFn: async () =>
      (datos(
        await supabase.from("sedes").select("id, nombre, tipo, capacidades, activo").eq("sistema_id", sistema!.id).eq("activo", true).order("nombre"),
      ) ?? []) as SedeAcceso[],
  });
  const sedes = useMemo(() => sedesQ.data ?? [], [sedesQ.data]);
  const sede = sedes.find((s) => s.id === sedeId) ?? sedes[0] ?? null;
  const capacidades = useMemo(() => capacidadesSede(sede), [sede]);

  // Naturaleza de la institución (no viene en mis_sistemas_detalle para no tocar el inicio de sesión).
  const naturalezaQ = useQuery({
    queryKey: ["naturaleza", sistema?.id],
    enabled: !!sistema?.id,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      datos(await supabase.from("sistemas").select("naturaleza").eq("id", sistema!.id).maybeSingle()) as { naturaleza: Naturaleza } | null,
  });

  const cambiarSede = useCallback((id: string) => {
    setSedeId(id);
    try {
      localStorage.setItem(CLAVE_SEDE, id);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  useEffect(() => {
    aplicarColorMarca(sistema?.color_marca);
  }, [sistema?.color_marca]);


  const rolPrincipal = sistema?.roles[0] ?? null;
  useEffect(() => {
    contextoMonitoreo(usuarioId ?? null, sistema?.id ?? null, rolPrincipal);
  }, [usuarioId, sistema?.id, rolPrincipal]);

  // Las preferencias guardadas en el perfil siguen al usuario a cualquier computadora.
  useEffect(() => {
    sincronizarDesdePerfil(perfilQ.data?.preferencias);
  }, [perfilQ.data?.preferencias]);

  const cambiarSistema = useCallback(
    (id: string) => {
      setSistemaId(id);
      try {
        localStorage.setItem(CLAVE_SISTEMA, id);
      } catch {
        /* sin almacenamiento */
      }
      if (usuarioId) {
        void supabase.from("perfiles").update({ ultimo_sistema_id: id }).eq("id", usuarioId);
        void supabase.rpc("registrar_evento", { p_accion: "CAMBIO_SISTEMA", p_sistema: id });
      }
    },
    [usuarioId],
  );

  // «Ver como»: solo un superadmin real, y solo resta (los roles simulados ∩ los suyos).
  const esSuperadminReal = !!perfilQ.data?.es_superadmin;
  const rolesReales = useMemo(() => sistema?.roles ?? [], [sistema?.roles]);
  const simulando = esSuperadminReal && !!verComo?.length;
  const rolesVista = useMemo(() => (simulando ? rolesReales.filter((r) => verComo!.includes(r)) : rolesReales), [simulando, rolesReales, verComo]);

  const cambiarVerComo = useCallback(
    (roles: Rol[] | null) => {
      const v = roles?.length ? roles : null;
      setVerComo(v);
      fijarVerComo(v);
      try {
        if (v) sessionStorage.setItem(CLAVE_VER_COMO, JSON.stringify(v));
        else sessionStorage.removeItem(CLAVE_VER_COMO);
      } catch {
        /* sin almacenamiento */
      }
      // Lo que se ve depende del rol: se vuelve a pedir todo con la cabecera nueva.
      void qc.resetQueries();
    },
    [qc],
  );

  // Una cabecera guardada en una PC compartida no sirve a quien no es superadmin.
  useEffect(() => {
    if (perfilQ.data && !perfilQ.data.es_superadmin && verComo) cambiarVerComo(null);
  }, [perfilQ.data, verComo, cambiarVerComo]);

  const cerrarSesion = useCallback(async () => {
    saliendo.current = true;
    fijarVerComo(null);
    try {
      sessionStorage.removeItem(CLAVE_VER_COMO);
    } catch {
      /* sin almacenamiento */
    }
    await supabase.rpc("registrar_evento", { p_accion: "LOGOUT", p_sistema: sistema?.id });
    await supabase.auth.signOut();
    await borrarCacheOperativa();
  }, [sistema?.id]);

  const recargar = useCallback(async () => {
    await Promise.all([perfilQ.refetch(), sistemasQ.refetch()]);
  }, [perfilQ, sistemasQ]);

  const valor: ContextoSesion = {
    cargando: !sesionLista || (!!usuarioId && (perfilQ.isLoading || sistemasQ.isLoading || !aal)),
    sesion,
    perfil: perfilQ.data ?? null,
    sistemas,
    sistema,
    sedes,
    sede,
    capacidades,
    cambiarSede,
    naturaleza: naturalezaQ.data?.naturaleza ?? "privada",
    roles: rolesVista,
    // Viendo como otro rol no cuentan los permisos personales (igual que en Postgres).
    permisos: simulando ? {} : (sistema?.permisos ?? {}),
    esSuperadmin: esSuperadminReal && !simulando,
    verComo: simulando ? verComo : null,
    cambiarVerComo,
    esSuperadminReal,
    rolesReales,
    requiereSegundoPaso,
    actualizarVerificacion,
    cambiarSistema,
    cerrarSesion,
    recargar,
  };

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSesion fuera de SesionProvider");
  return c;
}

const ROLES_CONSULTA: Rol[] = ["medico", "psicologia", "nutricion", "terapia"];

/**
 * Solo tiene roles de consulta: ve únicamente sus citas y sus pacientes.
 * Espejo de privado.sistemas_vista_completa() (la restricción real está en RLS).
 */
export const soloLoPropio = (roles: Rol[]) => roles.length > 0 && roles.every((r) => ROLES_CONSULTA.includes(r));

/** Para páginas que solo se renderizan con un sistema activo. */
export function useSistema() {
  const { sistema, roles, permisos, esSuperadmin } = useSesion();
  if (!sistema) throw new Error("Sin sistema activo");
  return { sistema, sistemaId: sistema.id, roles, permisos, esSuperadmin, soloPropio: soloLoPropio(roles) };
}
