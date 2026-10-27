/**
 * Capacidades por tipo de establecimiento (modelo RD). Espejo de
 * `privado.capacidades_tipo` en la base (migración 20261012090000). Define qué
 * MÓDULOS OPERATIVOS aplican según el tipo de sede.
 *
 * Gobierna SOLO los módulos diferenciadores; el ERP existente (caja, nómina,
 * contabilidad, inventario, personal, precios) no depende de esto. Mantener
 * sincronizado con la migración si se cambia un preset.
 */
export type TipoSede = "hospital" | "clinica" | "consultorio" | "laboratorio" | "farmacia" | "otro";

export type Capacidad =
  | "agenda"
  | "historia_clinica"
  | "recetas"
  | "internamiento"
  | "emergencia"
  | "quirofano"
  | "imagenes"
  | "laboratorio"
  | "farmacia_pos"
  | "controlados";

type Preset = Partial<Record<Capacidad, boolean>>;

const PRESETS: Record<TipoSede, Preset> = {
  consultorio: { agenda: true, historia_clinica: true, recetas: true },
  clinica: {
    agenda: true, historia_clinica: true, recetas: true,
    internamiento: true, emergencia: true, quirofano: true,
    laboratorio: true, farmacia_pos: true,
  },
  hospital: {
    agenda: true, historia_clinica: true, recetas: true,
    internamiento: true, emergencia: true, quirofano: true, imagenes: true,
    laboratorio: true, farmacia_pos: true, controlados: true,
  },
  laboratorio: { laboratorio: true },
  farmacia: { farmacia_pos: true, controlados: true },
  otro: { agenda: true, historia_clinica: true, recetas: true },
};

export interface SedeConCapacidades {
  tipo: string;
  capacidades?: Record<string, boolean> | null;
}

/** Capacidades efectivas = preset del tipo + overrides de la sede. */
export function capacidadesSede(sede: SedeConCapacidades | null | undefined): Preset {
  if (!sede) return {};
  const preset = PRESETS[sede.tipo as TipoSede] ?? PRESETS.otro;
  return { ...preset, ...((sede.capacidades ?? {}) as Preset) };
}

/** ¿La sede tiene activa una capacidad (por tipo u override)? */
export function tieneCapacidad(sede: SedeConCapacidades | null | undefined, cap: Capacidad): boolean {
  return capacidadesSede(sede)[cap] === true;
}

/** Etiquetas legibles (para la UI de configuración de sede). */
export const ETIQUETA_CAPACIDAD: Record<Capacidad, string> = {
  agenda: "Agenda y consultas",
  historia_clinica: "Historia clínica",
  recetas: "Recetas y documentos",
  internamiento: "Internamiento (camas)",
  emergencia: "Emergencia",
  quirofano: "Quirófano / cirugías",
  imagenes: "Imágenes / radiología",
  laboratorio: "Laboratorio clínico",
  farmacia_pos: "Farmacia (dispensación)",
  controlados: "Medicamentos controlados (DNCD)",
};

/** Capacidades que trae cada tipo por defecto (para mostrar el preset en la UI). */
export function presetDeTipo(tipo: string): Preset {
  return PRESETS[tipo as TipoSede] ?? PRESETS.otro;
}
