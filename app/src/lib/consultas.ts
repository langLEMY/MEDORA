import { useQuery } from "@tanstack/react-query";
import type { Tono } from "@/components/ui/superficies";
import type { Permisos } from "./permisos";
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
  consultorio: string | null;
  permisos: Permisos;
  creado_en: string;
  perfil: { nombre_completo: string; nombre_usuario: string | null; email: string; telefono: string | null; foto: string | null } | null;
}

export function usePersonal(sistemaId: string) {
  return useQuery({
    queryKey: claves.personal(sistemaId),
    queryFn: async () =>
      datos(
        await supabase
          .from("membresias")
          .select("id, usuario_id, roles, especialidad, exequatur, sede_id, activo, atiende_agenda, consultorio, permisos, creado_en, perfil:perfiles!membresias_usuario_id_fkey(nombre_completo, nombre_usuario, email, telefono, foto)")
          .eq("sistema_id", sistemaId)
          // Quitados del sistema con historial: la fila queda solo por integridad.
          .is("eliminado_en", null)
          .order("creado_en"),
      ) as unknown as Miembro[],
  });
}

/** Roles que atienden pacientes. Caja o recepción no aparecen aunque tengan "atiende citas" marcado. */
const ROLES_CLINICOS: Rol[] = ["medico", "psicologia", "nutricion", "terapia"];
export const SIN_ESPECIALIDAD = "Sin especialidad";

/** Profesionales con agenda propia, ordenados por especialidad y nombre. */
export function useMedicos(sistemaId: string) {
  const q = usePersonal(sistemaId);
  const data = q.data
    ?.filter((m) => m.activo && m.atiende_agenda && m.roles.some((r) => ROLES_CLINICOS.includes(r)))
    .sort(
      (a, b) =>
        (a.especialidad ?? "￿").localeCompare(b.especialidad ?? "￿", "es") ||
        (a.perfil?.nombre_completo ?? "").localeCompare(b.perfil?.nombre_completo ?? "", "es"),
    );
  return { ...q, data };
}

/** Médicos agrupados por especialidad (para <optgroup> y filtros). */
export function porEspecialidad(medicos: Miembro[]) {
  const grupos = new Map<string, Miembro[]>();
  for (const m of medicos) {
    const k = m.especialidad?.trim() || SIN_ESPECIALIDAD;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  return [...grupos.entries()];
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
  E31: "E31 · Crédito fiscal electrónico",
  E32: "E32 · Consumo electrónico",
  E33: "E33 · Nota de débito electrónica",
  E34: "E34 · Nota de crédito electrónica",
  E44: "E44 · Régimen especial electrónico",
  E45: "E45 · Gubernamental electrónico",
};

/** Tipo tradicional → su comprobante electrónico (privado.tipo_comprobante). */
export const EQUIVALENTE_ECF: Record<string, string> = { B01: "E31", B02: "E32", B14: "E44", B15: "E45" };

/** Dígitos de la secuencia: 8 en NCF (B…), 10 en e-NCF (E…). */
export const digitosNcf = (tipo: string) => (tipo.startsWith("E") ? 10 : 8);

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
  por_cobrar: { etiqueta: "Por cobrar", tono: "aviso" },
  en_espera: { etiqueta: "En espera", tono: "aviso" },
  llamado: { etiqueta: "Llamado", tono: "info" },
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
  /** null = en la cola de la especialidad, sin médico todavía. */
  medico_id: string | null;
  servicio_id: string | null;
  sede_id: string | null;
  especialidad: string | null;
  turno: string | null;
  turno_en: string | null;
  prioridad: boolean;
  motivo_prioridad: string | null;
  llamado_en: string | null;
  llamado_veces: number;
  motivo_exoneracion: string | null;
  /** Turno del quiosco sin paciente registrado: caja o recepción lo identifica. */
  por_identificar: boolean;
  cedula_llegada: string | null;
  paciente: { id: string; nombres: string; apellidos: string; expediente: string; documento: string | null; aseguradora_id: string | null } | null;
  medico: { nombre_completo: string } | null;
  servicio: { nombre: string } | null;
}

export const SELECT_CITA =
  "id, inicio, fin, estado, motivo, notas, llegada_en, paciente_id, medico_id, servicio_id, sede_id, especialidad, turno, turno_en, prioridad, motivo_prioridad, llamado_en, llamado_veces, motivo_exoneracion, por_identificar, cedula_llegada, " +
  "paciente:pacientes!citas_sistema_id_paciente_id_fkey(id, nombres, apellidos, expediente, documento, aseguradora_id), medico:perfiles!citas_medico_perfil_fk(nombre_completo), servicio:servicios!citas_sistema_id_servicio_id_fkey(nombre)";

/** Nombre para mostrar de una cita; los turnos del quiosco sin registrar salen "Por identificar". */
export function nombrePaciente(c: Pick<CitaConRelaciones, "paciente" | "cedula_llegada">) {
  if (c.paciente) return `${c.paciente.nombres} ${c.paciente.apellidos}`.trim();
  const d = (c.cedula_llegada ?? "").replace(/\D/g, "");
  const ced = d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}` : d;
  return ced ? `Por identificar · ${ced}` : "Por identificar";
}

/** Motivos de atención preferencial (Ley 352-98 de envejecientes, Ley 5-13 de discapacidad, embarazo). */
export const MOTIVOS_PRIORIDAD = ["Envejeciente", "Embarazada", "Persona con discapacidad", "Niño de brazos", "Urgencia"];

/** Turnos de hoy que siguen activos (para Recepción, Mi consulta, Caja y la pantalla de la sala). */
export function useTurnosHoy(sistemaId: string) {
  return useQuery({
    queryKey: [...claves.citas(sistemaId), "turnos-hoy"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return datos(
        await supabase
          .from("citas")
          .select(SELECT_CITA)
          .eq("sistema_id", sistemaId)
          .gte("llegada_en", d.toISOString())
          .order("turno_en", { ascending: true, nullsFirst: false }),
      ) as unknown as CitaConRelaciones[];
    },
  });
}

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
