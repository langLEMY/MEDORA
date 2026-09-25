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
  | "nomina"
  | "contabilidad"
  | "reportes"
  | "inventario"
  | "personal"
  | "catalogos"
  | "auditoria"
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
  nomina: ["admin", "contabilidad", "gerencia", "auditor"],
  contabilidad: ["admin", "contabilidad", "gerencia", "auditor"],
  reportes: ["admin", "contabilidad", "gerencia", "auditor", "caja"],
  inventario: ["admin", "farmacia", "enfermeria", "medico", "gerencia"],
  personal: ["admin"],
  catalogos: ["admin"],
  auditoria: ["admin", "auditor", "gerencia"],
  configuracion: ["admin"],
};

// El superadmin de la plataforma administra personal y configuración de
// cualquier sistema, pero no ve datos clínicos/financieros sin membresía.
const SUPERADMIN: Modulo[] = ["dashboard", "personal", "catalogos", "auditoria", "configuracion"];

export function puede(roles: Rol[], modulo: Modulo, esSuperadmin = false) {
  if (esSuperadmin && SUPERADMIN.includes(modulo)) return true;
  return MATRIZ[modulo].some((r) => roles.includes(r));
}

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
};

export const ROLES: Rol[] = [
  "admin", "gerencia", "contabilidad", "medico", "enfermeria", "psicologia", "nutricion", "terapia",
  "recepcion", "caja", "farmacia", "auditor",
];

/** Roles que normalmente tienen agenda propia. */
export const ROLES_PROFESIONALES: Rol[] = ["medico", "psicologia", "nutricion", "terapia"];
