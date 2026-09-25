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
  | "inventario"
  | "personal"
  | "catalogos"
  | "auditoria"
  | "configuracion";

const MATRIZ: Record<Modulo, Rol[]> = {
  dashboard: ["admin", "medico", "enfermeria", "recepcion", "caja", "farmacia", "auditor"],
  recepcion: ["admin", "recepcion", "enfermeria", "medico"],
  agenda: ["admin", "medico", "enfermeria", "recepcion"],
  pacientes: ["admin", "medico", "enfermeria", "recepcion", "caja", "farmacia", "auditor"],
  caja: ["admin", "caja", "auditor"],
  inventario: ["admin", "farmacia", "enfermeria", "medico"],
  personal: ["admin"],
  catalogos: ["admin"],
  auditoria: ["admin", "auditor"],
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
  pacientes: alguno(["admin", "medico", "enfermeria", "recepcion", "caja"]),
  citas: alguno(["admin", "medico", "enfermeria", "recepcion"]),
  historial: alguno(["medico", "enfermeria"]),
  verHistorial: alguno(["medico", "enfermeria", "auditor"]),
  caja: alguno(["admin", "caja"]),
  inventario: alguno(["admin", "farmacia"]),
  salidaInventario: alguno(["admin", "farmacia", "enfermeria"]),
};

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administración",
  medico: "Médico",
  enfermeria: "Enfermería",
  recepcion: "Recepción",
  caja: "Caja",
  farmacia: "Farmacia",
  auditor: "Auditoría",
};

export const ROLES: Rol[] = ["admin", "medico", "enfermeria", "recepcion", "caja", "farmacia", "auditor"];
