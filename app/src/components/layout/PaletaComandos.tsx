import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftRight,
  CalendarPlus,
  HandCoins,
  Megaphone,
  Moon,
  Receipt,
  Search,
  ShoppingCart,
  Sun,
  Ticket,
  Tv,
  UserCog,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { puede, puedeEscribir, ROLES_PROFESIONALES } from "@/lib/permisos";
import { cambiarPreferencias, usePreferencias } from "@/lib/preferencias";
import { mensajeError, supabase } from "@/lib/supabase";
import { patronBusqueda } from "@/lib/utils";
import { soloLoPropio, useSesion } from "@/sesion/SesionProvider";
import { NAVEGACION } from "./navegacion";

function useDebounce<T>(valor: T, ms = 200) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function PaletaComandos({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const { sistema, roles, permisos, esSuperadmin, perfil } = useSesion();
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const busqueda = useDebounce(texto);

  useEffect(() => {
    if (!abierta) setTexto("");
  }, [abierta]);

  const pacientes = useQuery({
    queryKey: ["paleta-pacientes", sistema?.id, busqueda],
    enabled: abierta && !!sistema && busqueda.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nombres, apellidos, expediente, documento")
        .eq("sistema_id", sistema!.id)
        .is("eliminado_en", null)
        .ilike("busqueda", patronBusqueda(busqueda))
        .limit(6);
      return data ?? [];
    },
  });

  const ir = (ruta: string) => {
    onCerrar();
    navigate(ruta);
  };

  const modulos = NAVEGACION.filter((i) =>
    i.soloSuperadmin ? esSuperadmin : i.ocultoPropio && soloLoPropio(roles) ? false : i.modulo ? puede(roles, i.modulo, esSuperadmin, permisos) : true,
  );

  // Acciones rápidas: abren la ventana correspondiente (?accion=…, ver lib/accionUrl) o actúan aquí mismo.
  const { tema } = usePreferencias();
  const oscuro = tema === "oscuro" || (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  const propio = soloLoPropio(roles);
  const conSistema = !!sistema;
  const llamar = async () => {
    onCerrar();
    const { data, error } = await supabase.rpc("llamar_siguiente", { p_sistema: sistema!.id });
    if (error) toast.error(mensajeError(error));
    else if (data) toast.success(`Llamando al turno ${(data as { turno: string }).turno}`);
    else toast.info("No hay pacientes esperando.");
    navigate("/recepcion");
  };
  const acciones: { id: string; etiqueta: string; icono: React.ReactNode; claves: string; ver: boolean; hacer: () => void }[] = [
    { id: "llamar", etiqueta: "Llamar al siguiente paciente", icono: <Megaphone />, claves: "turno consulta cola", ver: conSistema && roles.some((r) => ROLES_PROFESIONALES.includes(r)), hacer: () => void llamar() },
    { id: "cobro", etiqueta: "Nuevo cobro", icono: <Receipt />, claves: "factura cobrar pagar caja", ver: conSistema && puedeEscribir.caja(roles), hacer: () => ir("/caja?accion=cobro") },
    { id: "llegada", etiqueta: "Dar turno (registrar llegada)", icono: <Ticket />, claves: "turno llegada recepcion", ver: conSistema && !propio && puedeEscribir.citas(roles), hacer: () => ir("/recepcion?accion=llegada") },
    { id: "paciente", etiqueta: "Registrar paciente", icono: <UserPlus />, claves: "nuevo paciente expediente", ver: conSistema && puedeEscribir.pacientes(roles), hacer: () => ir("/pacientes?accion=nuevo") },
    { id: "cita", etiqueta: "Programar cita", icono: <CalendarPlus />, claves: "agenda cita", ver: conSistema && puedeEscribir.citas(roles), hacer: () => ir("/agenda?accion=nueva") },
    { id: "anticipo", etiqueta: "Nuevo anticipo", icono: <HandCoins />, claves: "deposito adelanto caja", ver: conSistema && puedeEscribir.caja(roles), hacer: () => ir("/caja?accion=anticipo") },
    { id: "movimiento", etiqueta: "Ingreso o egreso de caja", icono: <ArrowLeftRight />, claves: "movimiento gasto efectivo caja", ver: conSistema && puedeEscribir.caja(roles), hacer: () => ir("/caja?accion=movimiento") },
    { id: "compra", etiqueta: "Registrar gasto o compra", icono: <ShoppingCart />, claves: "compra gasto proveedor factura luz", ver: conSistema && puedeEscribir.compras(roles), hacer: () => ir("/compras?accion=nueva") },
    { id: "pantalla", etiqueta: "Abrir pantalla de la sala", icono: <Tv />, claves: "tv llamados turnos", ver: conSistema && !propio && puede(roles, "recepcion", esSuperadmin, permisos), hacer: () => ir("/pantalla") },
    {
      id: "tema",
      etiqueta: oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro",
      icono: oscuro ? <Sun /> : <Moon />,
      claves: "tema oscuro claro modo noche",
      ver: true,
      hacer: () => {
        onCerrar();
        cambiarPreferencias({ tema: oscuro ? "claro" : "oscuro" }, perfil?.id);
      },
    },
    { id: "perfil", etiqueta: "Mi perfil y personalización", icono: <UserCog />, claves: "perfil foto contraseña preferencias", ver: true, hacer: () => ir("/perfil") },
  ];
  const q = busqueda.trim().toLowerCase();
  const accionesVisibles = acciones.filter((a) => a.ver && (!q || a.etiqueta.toLowerCase().includes(q) || a.claves.includes(q)));

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[rgb(10_13_18/0.4)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCerrar}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ type: "spring", duration: 0.28, bounce: 0.1 }}
            className="relative mx-auto mt-[12vh] w-full max-w-xl overflow-hidden rounded-2xl border border-borde bg-superficie shadow-lg"
          >
            <Command
              shouldFilter={false}
              onKeyDown={(e) => e.key === "Escape" && onCerrar()}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-texto-3 [&_[cmdk-group-heading]]:uppercase"
            >
              <div className="flex items-center gap-3 border-b border-borde px-4">
                <Search className="size-4 text-texto-3" />
                <Command.Input
                  autoFocus
                  value={texto}
                  onValueChange={setTexto}
                  placeholder="Busca un paciente, una acción o una pantalla…"
                  className="h-13 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-texto-3"
                />
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-sm text-texto-3">
                  {pacientes.isFetching ? "Buscando…" : "Sin resultados."}
                </Command.Empty>
                {(pacientes.data?.length ?? 0) > 0 && (
                  <Command.Group heading="Pacientes">
                    {pacientes.data!.map((p) => (
                      <Item key={p.id} onSelect={() => ir(`/pacientes/${p.id}`)} icono={<UserRound />}>
                        <span className="flex-1 truncate">
                          {p.nombres} {p.apellidos}
                        </span>
                        <span className="text-xs text-texto-3 tabular">{p.expediente}</span>
                      </Item>
                    ))}
                  </Command.Group>
                )}
                {accionesVisibles.length > 0 && (
                  <Command.Group heading="Acciones">
                    {accionesVisibles.map((a) => (
                      <Item key={a.id} onSelect={a.hacer} icono={a.icono}>
                        {a.etiqueta}
                      </Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="Ir a">
                  {modulos
                    .filter((m) => !busqueda || m.etiqueta.toLowerCase().includes(busqueda.toLowerCase()))
                    .map((m) => (
                      <Item key={m.ruta} onSelect={() => ir(m.ruta)} icono={<m.icono />}>
                        {m.etiqueta}
                      </Item>
                    ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Item({ children, icono, onSelect }: { children: React.ReactNode; icono: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-texto data-[selected=true]:bg-superficie-2 [&>svg]:size-4 [&>svg]:text-texto-3"
    >
      {icono}
      {children}
    </Command.Item>
  );
}
