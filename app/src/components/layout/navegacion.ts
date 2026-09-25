import {
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Network,
  Pill,
  ScrollText,
  Tags,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Modulo } from "@/lib/permisos";

export interface ItemNav {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  modulo?: Modulo;
  soloSuperadmin?: boolean;
  grupo: "Operación" | "Gestión" | "Plataforma";
}

export const NAVEGACION: ItemNav[] = [
  { ruta: "/", etiqueta: "Inicio", icono: LayoutDashboard, modulo: "dashboard", grupo: "Operación" },
  { ruta: "/recepcion", etiqueta: "Recepción", icono: ClipboardList, modulo: "recepcion", grupo: "Operación" },
  { ruta: "/agenda", etiqueta: "Agenda", icono: CalendarDays, modulo: "agenda", grupo: "Operación" },
  { ruta: "/pacientes", etiqueta: "Pacientes", icono: Users, modulo: "pacientes", grupo: "Operación" },
  { ruta: "/caja", etiqueta: "Caja", icono: Wallet, modulo: "caja", grupo: "Operación" },
  { ruta: "/inventario", etiqueta: "Inventario", icono: Pill, modulo: "inventario", grupo: "Operación" },
  { ruta: "/personal", etiqueta: "Personal", icono: UserCog, modulo: "personal", grupo: "Gestión" },
  { ruta: "/catalogos", etiqueta: "Servicios y seguros", icono: Tags, modulo: "catalogos", grupo: "Gestión" },
  { ruta: "/auditoria", etiqueta: "Auditoría", icono: ScrollText, modulo: "auditoria", grupo: "Gestión" },
  { ruta: "/configuracion", etiqueta: "Sistema y sedes", icono: Building2, modulo: "configuracion", grupo: "Gestión" },
  { ruta: "/plataforma", etiqueta: "Plataforma", icono: Network, soloSuperadmin: true, grupo: "Plataforma" },
];
