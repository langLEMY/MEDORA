import { useQuery, useQueryClient } from "@tanstack/react-query";
import { borrarCacheOperativa } from "@/lib/sinConexion";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { datos, supabase, type Fila, type Rol } from "@/lib/supabase";
import type { Permisos } from "@/lib/permisos";
import { sincronizarDesdePerfil } from "@/lib/preferencias";
import { aplicarColorMarca } from "@/lib/tema";

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
  roles: Rol[];
  permisos: Permisos;
  esSuperadmin: boolean;
  cambiarSistema: (id: string) => void;
  cerrarSesion: () => Promise<void>;
  recargar: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);
const CLAVE_SISTEMA = "medora.sistema";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setSesionLista(true);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (evento === "SIGNED_OUT") qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const usuarioId = sesion?.user.id;

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

  useEffect(() => {
    aplicarColorMarca(sistema?.color_marca);
  }, [sistema?.color_marca]);

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

  const cerrarSesion = useCallback(async () => {
    await supabase.rpc("registrar_evento", { p_accion: "LOGOUT", p_sistema: sistema?.id });
    await supabase.auth.signOut();
    await borrarCacheOperativa();
  }, [sistema?.id]);

  const recargar = useCallback(async () => {
    await Promise.all([perfilQ.refetch(), sistemasQ.refetch()]);
  }, [perfilQ, sistemasQ]);

  const valor: ContextoSesion = {
    cargando: !sesionLista || (!!usuarioId && (perfilQ.isLoading || sistemasQ.isLoading)),
    sesion,
    perfil: perfilQ.data ?? null,
    sistemas,
    sistema,
    roles: sistema?.roles ?? [],
    permisos: sistema?.permisos ?? {},
    esSuperadmin: !!perfilQ.data?.es_superadmin,
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
