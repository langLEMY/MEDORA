import type { Rol } from "./supabase";

/**
 * Qué roles ven cada módulo en la navegación. Es un espejo de las políticas de
 * RLS (supabase/migrations) para no mostrar pantallas que igual responderían
 * vacías o con "permiso denegado". La autorización real vive en Postgres.
 */
export type Modulo =
  | "dashboard"
  | "recepcion"
  | "agenda"
  | "pacientes"
  | "caja"
  | "compras"
  | "comisiones"
  | "estadisticas"
  | "nomina"
  | "contabilidad"
  | "reportes"
  | "inventario"
  | "personal"
  | "catalogos"
  | "aseguradoras"
  | "auditoria"
  | "integraciones"
  | "configuracion";

const CLINICOS: Rol[] = ["medico", "enfermeria", "psicologia", "nutricion", "terapia"];

const MATRIZ: Record<Modulo, Rol[]> = {
  dashboard: ["admin", "medico", "enfermeria", "recepcion", "caja", "farmacia", "auditor", "gerencia", "contabilidad", "psicologia", "nutricion", "terapia"],
  recepcion: ["admin", "recepcion", "gerencia", ...CLINICOS],
  agenda: ["admin", "recepcion", "gerencia", "contabilidad", ...CLINICOS],
  pacientes: ["admin", "recepcion", "caja", "farmacia", "auditor", "gerencia", ...CLINICOS],
  caja: ["admin", "caja", "auditor", "gerencia", "contabilidad"],
  compras: ["admin", "farmacia", "contabilidad", "gerencia", "auditor"],
  comisiones: ["admin", "contabilidad", "gerencia", "auditor"],
  // Cada profesional ve sus números; dirección y finanzas, los de cualquiera (estadisticas_medico).
  estadisticas: ["admin", "gerencia", "contabilidad", "auditor", "medico", "psicologia", "nutricion", "terapia"],
  nomina: ["admin", "contabilidad", "gerencia", "auditor"],
  contabilidad: ["admin", "contabilidad", "gerencia", "auditor"],
  reportes: ["admin", "contabilidad", "gerencia", "auditor", "caja"],
  inventario: ["admin", "farmacia", "enfermeria", "medico", "gerencia"],
  personal: ["admin"],
  catalogos: ["admin"],
  aseguradoras: ["admin"],
  auditoria: ["admin", "auditor", "gerencia"],
  // Conectores (WhatsApp, Azul, correo, SMS): la administración de cada hospital.
  integraciones: ["admin"],
  // Identidad del hospital y sedes: solo superadministración (ver migración accesos_superadmin).
  configuracion: [],
};

// El superadmin de la plataforma administra personal y configuración de
// cualquier sistema, pero no ve datos clínicos/financieros sin membresía.
const SUPERADMIN: Modulo[] = ["dashboard", "personal", "catalogos", "aseguradoras", "auditoria", "integraciones", "configuracion"];

/** Módulo de la UI → clave de membresias.permisos (privado.modulos_ajustables). */
const CLAVE_PERMISO: Partial<Record<Modulo, ModuloAjustable>> = {
  pacientes: "pacientes",
  agenda: "agenda",
  caja: "caja",
  inventario: "inventario",
  compras: "compras",
  comisiones: "comisiones",
  nomina: "nomina",
  contabilidad: "contabilidad",
  catalogos: "catalogos",
  aseguradoras: "catalogos",
  auditoria: "auditoria",
};

export type Permisos = Partial<Record<ModuloAjustable, boolean>>;

/**
 * ¿Ve el módulo? Un permiso explícito de la persona (true/false) gana sobre lo
 * que da su rol, igual que privado.mis_sistemas_con_rol en Postgres.
 */
export function puede(roles: Rol[], modulo: Modulo, esSuperadmin = false, permisos?: Permisos | null) {
  if (esSuperadmin && SUPERADMIN.includes(modulo)) return true;
  const clave = CLAVE_PERMISO[modulo];
  const explicito = clave ? permisos?.[clave] : undefined;
  if (typeof explicito === "boolean") return explicito;
  return MATRIZ[modulo].some((r) => roles.includes(r));
}

export const MODULOS_AJUSTABLES = [
  "pacientes", "historial", "agenda", "caja", "inventario", "compras",
  "comisiones", "nomina", "contabilidad", "catalogos", "auditoria",
] as const;
export type ModuloAjustable = (typeof MODULOS_AJUSTABLES)[number];

export const ETIQUETA_MODULO: Record<ModuloAjustable, string> = {
  pacientes: "Pacientes",
  historial: "Historial clínico",
  agenda: "Agenda",
  caja: "Caja y cobros",
  inventario: "Inventario",
  compras: "Compras",
  comisiones: "Comisiones",
  nomina: "Nómina",
  contabilidad: "Contabilidad y finanzas",
  catalogos: "Servicios y aseguradoras",
  auditoria: "Auditoría",
};

const alguno = (permitidos: Rol[]) => (r: Rol[]) => r.some((x) => permitidos.includes(x));

export const puedeEscribir = {
  pacientes: alguno(["admin", "recepcion", "caja", ...CLINICOS]),
  citas: alguno(["admin", "recepcion", "gerencia", ...CLINICOS]),
  historial: alguno(CLINICOS),
  verHistorial: alguno([...CLINICOS, "auditor"]),
  psicologia: alguno(["psicologia"]),
  caja: alguno(["admin", "caja"]),
  abonos: alguno(["admin", "caja", "contabilidad"]),
  inventario: alguno(["admin", "farmacia"]),
  salidaInventario: alguno(["admin", "farmacia", "enfermeria"]),
  compras: alguno(["admin", "farmacia", "contabilidad", "gerencia"]),
  anularCompras: alguno(["admin", "contabilidad", "gerencia"]),
  comisiones: alguno(["admin", "contabilidad", "gerencia"]),
  nomina: alguno(["admin", "contabilidad", "gerencia"]),
  contabilidad: alguno(["admin", "contabilidad"]),
};

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administración",
  gerencia: "Gerencia",
  contabilidad: "Contabilidad",
  medico: "Médico",
  enfermeria: "Enfermería",
  psicologia: "Psicología",
  nutricion: "Nutrición",
  terapia: "Terapia",
  recepcion: "Recepción",
  caja: "Caja",
  farmacia: "Farmacia",
  auditor: "Auditoría",
  quiosco: "Quiosco de turnos",
};

export const ROLES: Rol[] = [
  "admin", "gerencia", "contabilidad", "medico", "enfermeria", "psicologia", "nutricion", "terapia",
  "recepcion", "caja", "farmacia", "auditor", "quiosco",
];

/** Cuenta de la pantalla táctil de turnos: solo ve el quiosco (y la pantalla de la sala). */
export const esQuiosco = (roles: Rol[]) => roles.length > 0 && roles.every((r) => r === "quiosco");

/** Roles que normalmente tienen agenda propia. */
export const ROLES_PROFESIONALES: Rol[] = ["medico", "psicologia", "nutricion", "terapia"];
