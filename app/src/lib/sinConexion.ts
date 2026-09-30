import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { onlineManager, type Query } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";

/**
 * Modo sin conexión: lo operativo del día se guarda en este equipo (IndexedDB)
 * para que, si se cae el internet, recepción, caja y médicos sigan viendo la
 * agenda, los turnos, el personal y los precios. No se guardan historias
 * clínicas, pacientes ni finanzas. Se borra al cerrar sesión y caduca en 24 h.
 * Mientras no hay conexión nada se modifica (el dinero y los turnos los decide
 * el servidor); al volver, todo se actualiza solo.
 */
const CLAVE = "medora.cache-operativa";
export const MAX_EDAD = 24 * 60 * 60 * 1000;

/** Prefijos de claves de TanStack Query que se guardan en el equipo. */
const GUARDABLES = new Set(["perfil", "mis-sistemas", "citas", "llamados", "personal", "servicios", "aseguradoras", "sedes", "dashboard"]);

export const persistidor = createAsyncStoragePersister({
  key: CLAVE,
  throttleTime: 2000,
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
});

export const guardarEnEquipo = (q: Query) => q.state.status === "success" && GUARDABLES.has(String(q.queryKey[0]));

/** Borra lo guardado (al cerrar sesión o limpiar caché). */
export const borrarCacheOperativa = () => del(CLAVE).catch(() => undefined);

export function useEnLinea() {
  return useSyncExternalStore(
    (f) => onlineManager.subscribe(f),
    () => onlineManager.isOnline(),
  );
}
