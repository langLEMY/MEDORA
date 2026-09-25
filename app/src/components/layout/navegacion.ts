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
  ScrollText,
  ShoppingCart,
  Tags,
  UserCog,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { Modulo } from "@/lib/permisos";

export interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  modulo?: Modulo;
  soloSuperadmin?: boolean;
  grupo: "Operación" | "Finanzas" | "Gestión" | "Plataforma";
}

export const NAVEGACION: ItemNav[] = [
  { ruta: "/", etiqueta: "Inicio", icono: LayoutDashboard, modulo: "dashboard", grupo: "Operación" },
  { ruta: "/recepcion", etiqueta: "Recepción", icono: ClipboardList, modulo: "recepcion", grupo: "Operación" },
  { ruta: "/agenda", etiqueta: "Agenda", icono: CalendarDays, modulo: "agenda", grupo: "Operación" },
  { ruta: "/pacientes", etiqueta: "Pacientes", icono: Users, modulo: "pacientes", grupo: "Operación" },
  { ruta: "/inventario", etiqueta: "Inventario", icono: Pill, modulo: "inventario", grupo: "Operación" },
  { ruta: "/caja", etiqueta: "Caja y facturación", icono: Wallet, modulo: "caja", grupo: "Finanzas" },
  { ruta: "/compras", etiqueta: "Compras", icono: ShoppingCart, modulo: "compras", grupo: "Finanzas" },
  { ruta: "/comisiones", etiqueta: "Comisiones", icono: BadgePercent, modulo: "comisiones", grupo: "Finanzas" },
  { ruta: "/nomina", etiqueta: "Nómina", icono: WalletCards, modulo: "nomina", grupo: "Finanzas" },
  { ruta: "/contabilidad", etiqueta: "Contabilidad", icono: BookOpenCheck, modulo: "contabilidad", grupo: "Finanzas" },
  { ruta: "/reportes", etiqueta: "Reportes", icono: FileBarChart, modulo: "reportes", grupo: "Finanzas" },
  { ruta: "/personal", etiqueta: "Personal", icono: UserCog, modulo: "personal", grupo: "Gestión" },
  { ruta: "/catalogos", etiqueta: "Servicios y seguros", icono: Tags, modulo: "catalogos", grupo: "Gestión" },
  { ruta: "/auditoria", etiqueta: "Auditoría", icono: ScrollText, modulo: "auditoria", grupo: "Gestión" },
  { ruta: "/configuracion", etiqueta: "Sistema y sedes", icono: Building2, modulo: "configuracion", grupo: "Gestión" },
  { ruta: "/plataforma", etiqueta: "Plataforma", icono: Network, soloSuperadmin: true, grupo: "Plataforma" },
];
