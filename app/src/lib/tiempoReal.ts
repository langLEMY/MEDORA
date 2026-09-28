import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";

/**
 * Invalida las consultas de una tabla cuando cambia en otra PC (Supabase
 * Realtime). El RLS también filtra estos eventos: solo llegan los del sistema
 * al que la persona pertenece.
 */
let contador = 0;

export function useTiempoReal(tabla: "citas", sistemaId: string, claves: readonly unknown[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    // Nombre único por suscripción: varias pantallas/widgets escuchan la misma tabla a la vez.
    const canal = supabase
      .channel(`${tabla}-${sistemaId}-${++contador}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla, filter: `sistema_id=eq.${sistemaId}` }, () => {
        for (const k of claves) void qc.invalidateQueries({ queryKey: k });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla, sistemaId, qc]);
}
