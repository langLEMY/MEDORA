import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ShieldAlert } from "lucide-react";
import { Outlet } from "react-router-dom";
import { Boton } from "@/components/ui/boton";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/sesion/SesionProvider";
import { CambiarPassword } from "./CambiarPassword";
import { ConfiguracionInicial } from "./ConfiguracionInicial";
import { Login } from "./Login";
import { PantallaAcceso, Splash } from "./PantallaAcceso";

/** Decide qué ve la persona: primer arranque, login, cambio de contraseña o la app. */
export function Puerta() {
  const { cargando, sesion, perfil, sistemas, esSuperadmin, cerrarSesion } = useSesion();

  const instalacion = useQuery({
    queryKey: ["estado-instalacion"],
    enabled: !cargando && !sesion,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estado_instalacion");
      if (error) throw error;
      return data as { requiere_configuracion: boolean };
    },
  });

  let vista: { clave: string; nodo: React.ReactNode };
  if (cargando || (!sesion && instalacion.isLoading)) {
    vista = { clave: "splash", nodo: <Splash /> };
  } else if (!sesion) {
    vista = instalacion.data?.requiere_configuracion
      ? { clave: "config", nodo: <ConfiguracionInicial /> }
      : { clave: "login", nodo: <Login /> };
  } else if (perfil && !perfil.activo) {
    vista = {
      clave: "desactivado",
      nodo: (
        <PantallaAcceso>
          <div className="mb-4 grid size-11 place-items-center rounded-xl bg-superficie-2 text-peligro">
            <ShieldAlert className="size-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Cuenta desactivada</h2>
          <p className="mt-2 text-sm text-texto-2">Tu acceso a MEDORA fue desactivado. Contacta a la administración de la plataforma.</p>
          <Boton variante="secundario" className="mt-6" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </Boton>
        </PantallaAcceso>
      ),
    };
  } else if (perfil?.debe_cambiar_password) {
    vista = { clave: "pwd", nodo: <CambiarPassword /> };
  } else if (sistemas.length === 0 && !esSuperadmin) {
    vista = {
      clave: "sin-acceso",
      nodo: (
        <PantallaAcceso>
          <div className="mb-4 grid size-11 place-items-center rounded-xl bg-superficie-2 text-aviso">
            <ShieldAlert className="size-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Tu cuenta no tiene acceso todavía</h2>
          <p className="mt-2 text-sm text-texto-2">
            No perteneces a ningún sistema hospitalario activo. Pide a la administración de tu hospital que te agregue
            al personal.
          </p>
          <Boton variante="secundario" className="mt-6" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </Boton>
        </PantallaAcceso>
      ),
    };
  } else {
    vista = { clave: "app", nodo: <Outlet /> };
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={vista.clave}
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {vista.nodo}
      </motion.div>
    </AnimatePresence>
  );
}
