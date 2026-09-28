import {
  BadgePercent,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Network,
  Pill,
  Plug,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { Modulo } from "@/lib/permisos";
import type { Rol } from "@/lib/supabase";

export interface ItemNav {
  ruta: string;
  etiqueta: string;
  /** Nombre cuando quien entra solo ve lo suyo (médico). */
  etiquetaPropia?: string;
  icono: LucideIcon;
  modulo?: Modulo;
  soloSuperadmin?: boolean;
  /** No aparece para quien solo ve lo suyo (médicos): p. ej. el directorio de colegas. */
  ocultoPropio?: boolean;
  grupo: "Operación" | "Finanzas" | "Gestión" | "Plataforma";
}

export const NAVEGACION: ItemNav[] = [
  { ruta: "/", etiqueta: "Inicio", icono: LayoutDashboard, modulo: "dashboard", grupo: "Operación" },
  { ruta: "/recepcion", etiqueta: "Recepción", etiquetaPropia: "Mi consulta", icono: ClipboardList, modulo: "recepcion", grupo: "Operación" },
  { ruta: "/medicos", etiqueta: "Médicos", icono: Stethoscope, modulo: "recepcion", ocultoPropio: true, grupo: "Operación" },
  { ruta: "/agenda", etiqueta: "Agenda", etiquetaPropia: "Mi agenda", icono: CalendarDays, modulo: "agenda", grupo: "Operación" },
  { ruta: "/pacientes", etiqueta: "Pacientes", etiquetaPropia: "Mis pacientes", icono: Users, modulo: "pacientes", grupo: "Operación" },
  { ruta: "/inventario", etiqueta: "Inventario", icono: Pill, modulo: "inventario", grupo: "Operación" },
  { ruta: "/caja", etiqueta: "Caja y facturación", icono: Wallet, modulo: "caja", grupo: "Finanzas" },
  { ruta: "/compras", etiqueta: "Compras", icono: ShoppingCart, modulo: "compras", grupo: "Finanzas" },
  { ruta: "/comisiones", etiqueta: "Comisiones", icono: BadgePercent, modulo: "comisiones", grupo: "Finanzas" },
  { ruta: "/nomina", etiqueta: "Nómina", icono: WalletCards, modulo: "nomina", grupo: "Finanzas" },
  { ruta: "/contabilidad", etiqueta: "Contabilidad", icono: BookOpenCheck, modulo: "contabilidad", grupo: "Finanzas" },
  { ruta: "/reportes", etiqueta: "Reportes", icono: FileBarChart, modulo: "reportes", grupo: "Finanzas" },
  { ruta: "/personal", etiqueta: "Personal", icono: UserCog, modulo: "personal", grupo: "Gestión" },
  { ruta: "/servicios", etiqueta: "Servicios", icono: Tags, modulo: "catalogos", grupo: "Gestión" },
  { ruta: "/aseguradoras", etiqueta: "Aseguradoras", icono: ShieldCheck, modulo: "aseguradoras", grupo: "Gestión" },
  { ruta: "/integraciones", etiqueta: "Integraciones", icono: Plug, modulo: "integraciones", grupo: "Gestión" },
  { ruta: "/auditoria", etiqueta: "Auditoría", icono: ScrollText, modulo: "auditoria", grupo: "Gestión" },
  { ruta: "/configuracion", etiqueta: "Sistema y sedes", icono: Building2, modulo: "configuracion", soloSuperadmin: true, grupo: "Plataforma" },
  { ruta: "/plataforma", etiqueta: "Plataforma", icono: Network, soloSuperadmin: true, grupo: "Plataforma" },
];

/**
 * Pantalla con la que abre MEDORA cuando la persona no eligió otra
 * (Personalización → "Al entrar, abrir" = "Según mi rol"): cada quien aterriza
 * donde trabaja. Dirección y finanzas ven el panel de Inicio.
 */
export function inicioPorRol(roles: Rol[], esSuperadmin: boolean): string {
  const tiene = (...r: Rol[]) => r.some((x) => roles.includes(x));
  if (esSuperadmin || tiene("admin", "gerencia", "contabilidad", "auditor")) return "/";
  if (tiene("recepcion")) return "/recepcion";
  if (tiene("caja")) return "/caja";
  if (tiene("medico", "psicologia", "nutricion", "terapia", "enfermeria")) return "/recepcion";
  if (tiene("farmacia")) return "/inventario";
  return "/";
}
