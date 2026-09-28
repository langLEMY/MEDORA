import {
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Network,
  Pill,
  Settings2,
  ShoppingCart,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { puede, type Modulo, type Permisos } from "@/lib/permisos";
import type { Rol } from "@/lib/supabase";

export interface ItemNav {
  ruta: string;
  etiqueta: string;
  /** Nombre cuando quien entra solo ve lo suyo (médico). */
  etiquetaPropia?: string;
  icono: LucideIcon;
  modulo?: Modulo;
  /** Entrada que agrupa varias secciones: visible si puede ver al menos una. */
  modulos?: Modulo[];
  soloSuperadmin?: boolean;
  /** No aparece en el menú, solo en el buscador (Ctrl+K): secciones dentro de una entrada agrupada. */
  soloBusqueda?: boolean;
  /** No aparece para quien solo ve lo suyo (médicos): p. ej. el directorio de colegas. */
  ocultoPropio?: boolean;
  grupo: "Operación" | "Finanzas" | "Gestión" | "Plataforma";
}

/**
 * Menú. Para no abrumar, varias pantallas relacionadas viven juntas bajo una
 * entrada con pestañas (?vista=, ver paginas/Secciones.tsx):
 *   Médicos           → Directorio · Pago de médicos (comisiones)
 *   Precios y seguros → Servicios · Aseguradoras
 *   Administración    → Sistema y sedes · Integraciones · Auditoría
 * Las secciones siguen en el buscador (soloBusqueda) con su nombre de siempre.
 */
export const NAVEGACION: ItemNav[] = [
  { ruta: "/", etiqueta: "Inicio", icono: LayoutDashboard, modulo: "dashboard", grupo: "Operación" },
  { ruta: "/recepcion", etiqueta: "Recepción", etiquetaPropia: "Mi consulta", icono: ClipboardList, modulo: "recepcion", grupo: "Operación" },
  { ruta: "/agenda", etiqueta: "Agenda", etiquetaPropia: "Mi agenda", icono: CalendarDays, modulo: "agenda", grupo: "Operación" },
  { ruta: "/pacientes", etiqueta: "Pacientes", etiquetaPropia: "Mis pacientes", icono: Users, modulo: "pacientes", grupo: "Operación" },
  { ruta: "/medicos", etiqueta: "Médicos", icono: Stethoscope, modulos: ["recepcion", "comisiones"], ocultoPropio: true, grupo: "Operación" },
  { ruta: "/inventario", etiqueta: "Inventario", icono: Pill, modulo: "inventario", grupo: "Operación" },
  { ruta: "/caja", etiqueta: "Caja y facturación", icono: Wallet, modulo: "caja", grupo: "Finanzas" },
  { ruta: "/compras", etiqueta: "Compras", icono: ShoppingCart, modulo: "compras", grupo: "Finanzas" },
  { ruta: "/nomina", etiqueta: "Nómina", icono: WalletCards, modulo: "nomina", grupo: "Finanzas" },
  { ruta: "/contabilidad", etiqueta: "Contabilidad", icono: BookOpenCheck, modulo: "contabilidad", grupo: "Finanzas" },
  { ruta: "/reportes", etiqueta: "Reportes", icono: FileBarChart, modulo: "reportes", grupo: "Finanzas" },
  { ruta: "/personal", etiqueta: "Personal", icono: UserCog, modulo: "personal", grupo: "Gestión" },
  { ruta: "/precios", etiqueta: "Precios y seguros", icono: Tags, modulos: ["catalogos", "aseguradoras"], grupo: "Gestión" },
  { ruta: "/administracion", etiqueta: "Administración", icono: Settings2, modulos: ["configuracion", "integraciones", "auditoria"], grupo: "Gestión" },
  { ruta: "/plataforma", etiqueta: "Plataforma", icono: Network, soloSuperadmin: true, grupo: "Plataforma" },
  // Solo en el buscador:
  { ruta: "/medicos?vista=directorio", etiqueta: "Directorio de médicos", icono: Stethoscope, modulo: "recepcion", ocultoPropio: true, soloBusqueda: true, grupo: "Operación" },
  { ruta: "/medicos?vista=pagos", etiqueta: "Pago de médicos (comisiones)", icono: Stethoscope, modulo: "comisiones", soloBusqueda: true, grupo: "Finanzas" },
  { ruta: "/precios?vista=servicios", etiqueta: "Servicios", icono: Tags, modulo: "catalogos", soloBusqueda: true, grupo: "Gestión" },
  { ruta: "/precios?vista=aseguradoras", etiqueta: "Aseguradoras y tarifarios", icono: Tags, modulo: "aseguradoras", soloBusqueda: true, grupo: "Gestión" },
  { ruta: "/administracion?vista=sistema", etiqueta: "Sistema y sedes", icono: Settings2, soloSuperadmin: true, soloBusqueda: true, grupo: "Gestión" },
  { ruta: "/administracion?vista=integraciones", etiqueta: "Integraciones", icono: Settings2, modulo: "integraciones", soloBusqueda: true, grupo: "Gestión" },
  { ruta: "/administracion?vista=auditoria", etiqueta: "Auditoría", icono: Settings2, modulo: "auditoria", soloBusqueda: true, grupo: "Gestión" },
];

/** ¿Esta persona ve esta entrada? Una sola regla para menú, buscador y Personalización. */
export function puedeVer(i: ItemNav, roles: Rol[], esSuperadmin: boolean, permisos: Permisos | null | undefined, propio: boolean) {
  if (i.soloSuperadmin) return esSuperadmin;
  if (i.ocultoPropio && propio) return false;
  if (i.modulos) return i.modulos.some((m) => puede(roles, m, esSuperadmin, permisos));
  return i.modulo ? puede(roles, i.modulo, esSuperadmin, permisos) : true;
}

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
