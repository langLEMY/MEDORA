import { useQuery } from "@tanstack/react-query";
import type { Tono } from "@/components/ui/superficies";
import { datos, supabase, type EstadoCita, type Rol } from "./supabase";

/** Claves de react-query: siempre llevan el sistema, así cambiar de sistema no mezcla cachés. */
export const claves = {
  pacientes: (s: string) => ["pacientes", s] as const,
  paciente: (s: string, id: string) => ["paciente", s, id] as const,
  citas: (s: string) => ["citas", s] as const,
  personal: (s: string) => ["personal", s] as const,
  servicios: (s: string) => ["servicios", s] as const,
  aseguradoras: (s: string) => ["aseguradoras", s] as const,
  sedes: (s: string) => ["sedes", s] as const,
  caja: (s: string) => ["caja", s] as const,
  inventario: (s: string) => ["inventario", s] as const,
};

export interface Miembro {
  id: string;
  usuario_id: string;
  roles: Rol[];
  especialidad: string | null;
  exequatur: string | null;
  sede_id: string | null;
  activo: boolean;
  atiende_agenda: boolean;
  creado_en: string;
  perfil: { nombre_completo: string; email: string; telefono: string | null } | null;
}

export function usePersonal(sistemaId: string) {
  return useQuery({
    queryKey: claves.personal(sistemaId),
    queryFn: async () =>
      datos(
        await supabase
          .from("membresias")
          .select("id, usuario_id, roles, especialidad, exequatur, sede_id, activo, atiende_agenda, creado_en, perfil:perfiles!membresias_usuario_id_fkey(nombre_completo, email, telefono)")
          .eq("sistema_id", sistemaId)
          .order("creado_en"),
      ) as unknown as Miembro[],
  });
}

/** Profesionales con agenda propia (médicos, psicología, nutrición, terapia…). */
export function useMedicos(sistemaId: string) {
  const q = usePersonal(sistemaId);
  return { ...q, data: q.data?.filter((m) => m.activo && m.atiende_agenda) };
}

export interface CuentaContable {
  codigo: string;
  nombre: string;
  tipo: string;
  acepta_movimiento: boolean;
  activo: boolean;
  padre_codigo: string | null;
}

export function useCuentas(sistemaId: string) {
  return useQuery({
    queryKey: ["cuentas", sistemaId],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      datos(
        await supabase
          .from("cuentas_contables")
          .select("codigo, nombre, tipo, acepta_movimiento, activo, padre_codigo")
          .eq("sistema_id", sistemaId)
          .order("codigo"),
      ) as CuentaContable[],
  });
}

export function useProveedores(sistemaId: string) {
  return useQuery({
    queryKey: ["proveedores", sistemaId],
    queryFn: async () => datos(await supabase.from("proveedores").select("*").eq("sistema_id", sistemaId).order("nombre")),
  });
}

export const CATEGORIAS_SERVICIO: Record<string, string> = {
  consulta: "Consultas",
  procedimiento: "Procedimientos",
  laboratorio: "Laboratorio",
  imagen: "Imágenes",
  emergencia: "Emergencias",
  hospitalizacion: "Hospitalización",
  farmacia: "Farmacia",
  otro: "Otros",
};

export const METODOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  cheque: "Cheque",
  anticipo: "Anticipo",
  credito: "Crédito",
  seguro: "Seguro",
  otro: "Otro",
};

export const TIPOS_NCF: Record<string, string> = {
  B01: "B01 · Crédito fiscal",
  B02: "B02 · Consumo",
  B14: "B14 · Régimen especial",
  B15: "B15 · Gubernamental",
};

export function useServicios(sistemaId: string) {
  return useQuery({
    queryKey: claves.servicios(sistemaId),
    queryFn: async () =>
      datos(await supabase.from("servicios").select("*").eq("sistema_id", sistemaId).order("nombre")),
  });
}

export function useAseguradoras(sistemaId: string) {
  return useQuery({
    queryKey: claves.aseguradoras(sistemaId),
    queryFn: async () =>
      datos(await supabase.from("aseguradoras").select("*").eq("sistema_id", sistemaId).order("nombre")),
  });
}

export function useSedes(sistemaId: string) {
  return useQuery({
    queryKey: claves.sedes(sistemaId),
    queryFn: async () => datos(await supabase.from("sedes").select("*").eq("sistema_id", sistemaId).order("nombre")),
  });
}

export const ESTADO_CITA: Record<EstadoCita, { etiqueta: string; tono: Tono }> = {
  programada: { etiqueta: "Programada", tono: "neutro" },
  confirmada: { etiqueta: "Confirmada", tono: "info" },
  en_espera: { etiqueta: "En espera", tono: "aviso" },
  en_consulta: { etiqueta: "En consulta", tono: "violeta" },
  completada: { etiqueta: "Completada", tono: "exito" },
  cancelada: { etiqueta: "Cancelada", tono: "peligro" },
  no_asistio: { etiqueta: "No asistió", tono: "peligro" },
};

export interface CitaConRelaciones {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  motivo: string | null;
  notas: string | null;
  llegada_en: string | null;
  paciente_id: string;
  medico_id: string;
  servicio_id: string | null;
  sede_id: string | null;
  paciente: { id: string; nombres: string; apellidos: string; expediente: string } | null;
  medico: { nombre_completo: string } | null;
  servicio: { nombre: string } | null;
}

export const SELECT_CITA =
  "id, inicio, fin, estado, motivo, notas, llegada_en, paciente_id, medico_id, servicio_id, sede_id, paciente:pacientes!citas_sistema_id_paciente_id_fkey(id, nombres, apellidos, expediente), medico:perfiles!citas_medico_perfil_fk(nombre_completo), servicio:servicios!citas_sistema_id_servicio_id_fkey(nombre)";

/** Citas de un rango [desde, hasta) — ISO. */
export function useCitas(sistemaId: string, desde: string, hasta: string, medicoId?: string) {
  return useQuery({
    queryKey: [...claves.citas(sistemaId), desde, hasta, medicoId ?? "todos"],
    queryFn: async () => {
      let q = supabase
        .from("citas")
        .select(SELECT_CITA)
        .eq("sistema_id", sistemaId)
        .gte("inicio", desde)
        .lt("inicio", hasta)
        .order("inicio");
      if (medicoId) q = q.eq("medico_id", medicoId);
      return datos(await q) as unknown as CitaConRelaciones[];
    },
  });
}
