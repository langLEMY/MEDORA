import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Quién tiene MEDORA abierto ahora, por sistema (Supabase Realtime Presence;
 * no guarda nada en la base). Cada sesión anuncia su nombre y la pantalla en
 * la que está. La superadministración no se anuncia: el personal no la ve.
 */
export interface Conectado {
  id: string;
  nombre: string;
  pantalla: string;
  desde: string;
}

interface Canal {
  canal: RealtimeChannel;
  lista: Conectado[];
  oyentes: Set<() => void>;
  usos: number;
  propio: Conectado | null;
}
const canales = new Map<string, Canal>();

function obtener(sistemaId: string): Canal {
  let c = canales.get(sistemaId);
  if (c) return c;
  const canal = supabase.channel(`presencia:${sistemaId}`, { config: { presence: { key: crypto.randomUUID() } } });
  const nuevo: Canal = { canal, lista: [], oyentes: new Set(), usos: 0, propio: null };
  canal.on("presence", { event: "sync" }, () => {
    const estado = canal.presenceState<Conectado>();
    // Una persona con varias pestañas cuenta una vez (la más reciente).
    const porPersona = new Map<string, Conectado>();
    for (const metas of Object.values(estado)) {
      for (const m of metas) {
        const previo = porPersona.get(m.id);
        if (!previo || previo.desde < m.desde) porPersona.set(m.id, { id: m.id, nombre: m.nombre, pantalla: m.pantalla, desde: m.desde });
      }
    }
    nuevo.lista = [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    nuevo.oyentes.forEach((f) => f());
  });
  canal.subscribe((estado) => {
    if (estado === "SUBSCRIBED" && nuevo.propio) void canal.track(nuevo.propio);
  });
  canales.set(sistemaId, nuevo);
  return nuevo;
}

function soltar(sistemaId: string) {
  const c = canales.get(sistemaId);
  if (!c) return;
  c.usos -= 1;
  if (c.usos <= 0) {
    void supabase.removeChannel(c.canal);
    canales.delete(sistemaId);
  }
}

/** Anuncia esta sesión en el sistema activo (montado una vez en AppShell). */
export function useAnunciarPresencia(sistemaId: string | undefined, yo: { id: string; nombre: string } | null, pantalla: string, visible: boolean) {
  useEffect(() => {
    if (!sistemaId) return;
    const c = obtener(sistemaId);
    c.usos += 1;
    return () => {
      if (c.propio) void c.canal.untrack();
      c.propio = null;
      soltar(sistemaId);
    };
  }, [sistemaId]);

  useEffect(() => {
    if (!sistemaId || !yo) return;
    const c = canales.get(sistemaId);
    if (!c) return;
    if (!visible) {
      c.propio = null;
      void c.canal.untrack();
      return;
    }
    c.propio = { id: yo.id, nombre: yo.nombre, pantalla, desde: c.propio?.desde ?? new Date().toISOString() };
    void c.canal.track(c.propio);
  }, [sistemaId, yo?.id, yo?.nombre, pantalla, visible]);
}

/** Lista de conectados en el sistema. */
export function useConectados(sistemaId: string | undefined): Conectado[] {
  useEffect(() => {
    if (!sistemaId) return;
    obtener(sistemaId).usos += 1;
    return () => soltar(sistemaId);
  }, [sistemaId]);
  return useSyncExternalStore(
    (f) => {
      if (!sistemaId) return () => {};
      const c = obtener(sistemaId);
      c.oyentes.add(f);
      return () => c.oyentes.delete(f);
    },
    () => (sistemaId ? (canales.get(sistemaId)?.lista ?? VACIA) : VACIA),
  );
}
const VACIA: Conectado[] = [];

/** Nombre legible de la pantalla a partir de la ruta. */
export function nombrePantalla(ruta: string) {
  const r = ruta.replace(/^#?\//, "").split(/[/?]/)[0];
  const nombres: Record<string, string> = {
    "": "Inicio",
    recepcion: "Recepción",
    agenda: "Agenda",
    pacientes: "Pacientes",
    estadisticas: "Estadísticas",
    medicos: "Médicos",
    inventario: "Inventario",
    caja: "Caja",
    gastos: "Gastos",
    nomina: "Nómina",
    contabilidad: "Contabilidad",
    finanzas: "Finanzas",
    personal: "Personal",
    precios: "Precios y seguros",
    administracion: "Administración",
    perfil: "Mi perfil",
    plataforma: "Plataforma",
    quiosco: "Quiosco",
    pantalla: "Pantalla de sala",
  };
  return nombres[r] ?? r;
}
