import { lazy, Suspense, type ReactNode } from "react";
import { createHashRouter, Navigate } from "react-router-dom";
import { Network } from "lucide-react";
import { ErrorRuta } from "./components/ErrorRuta";
import { AppShell } from "./components/layout/AppShell";
import { Boton } from "./components/ui/boton";
import { Esqueleto, Vacio } from "./components/ui/superficies";
import { Puerta } from "./paginas/acceso/Puerta";
import { useSesion } from "./sesion/SesionProvider";
import { pantalla } from "./lib/precarga";

// Hash router: el launcher sirve archivos estáticos desde disco, no hay
// servidor que reescriba rutas profundas a index.html.
const Dashboard = pantalla(() => import("./paginas/Dashboard"));
const Recepcion = pantalla(() => import("./paginas/Recepcion"));
const Agenda = pantalla(() => import("./paginas/Agenda"));
const Pacientes = pantalla(() => import("./paginas/pacientes/Pacientes"));
const PacienteDetalle = pantalla(() => import("./paginas/pacientes/PacienteDetalle"));
const Caja = pantalla(() => import("./paginas/Caja"));
const Compras = pantalla(() => import("./paginas/Compras"));
const Nomina = pantalla(() => import("./paginas/Nomina"));
const Contabilidad = pantalla(() => import("./paginas/Contabilidad"));
const PaginaMedicos = pantalla(() => import("./paginas/Secciones").then((m) => ({ default: m.PaginaMedicos })));
const PaginaPrecios = pantalla(() => import("./paginas/Secciones").then((m) => ({ default: m.PaginaPrecios })));
const PaginaAdministracion = pantalla(() => import("./paginas/Secciones").then((m) => ({ default: m.PaginaAdministracion })));
const PaginaFinanzas = pantalla(() => import("./paginas/Secciones").then((m) => ({ default: m.PaginaFinanzas })));
const CierresDetalle = pantalla(() => import("./paginas/Finanzas").then((m) => ({ default: m.CierresDetalle })));
const Estadisticas = pantalla(() => import("./paginas/Estadisticas"));
const Inventario = pantalla(() => import("./paginas/Inventario"));
const Laboratorio = pantalla(() => import("./paginas/Laboratorio"));
const Farmacia = pantalla(() => import("./paginas/Farmacia"));
const Internamiento = pantalla(() => import("./paginas/Internamiento"));
const Personal = pantalla(() => import("./paginas/Personal"));
const Plataforma = lazy(() => import("./paginas/Plataforma"));
const Perfil = pantalla(() => import("./paginas/Perfil"));
const Quiosco = lazy(() => import("./paginas/Quiosco"));
const Pantalla = lazy(() => import("./paginas/Pantalla"));
const Ayuda = pantalla(() => import("./paginas/Ayuda"));

/** Pantallas completas sin menú (quiosco táctil y TV de la sala). */
function PantallaCompleta({ children }: { children: ReactNode }) {
  const { sistema } = useSesion();
  if (!sistema) return <Navigate to="/" replace />;
  return <Suspense fallback={<div className="h-dvh bg-fondo" />}>{children}</Suspense>;
}

function Cargando() {
  return (
    <div className="space-y-6">
      <Esqueleto className="h-8 w-56" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Esqueleto className="h-80 rounded-2xl" />
    </div>
  );
}

/** Rutas que operan sobre un sistema hospitalario concreto. */
function ConSistema({ children }: { children: ReactNode }) {
  const { sistema } = useSesion();
  if (!sistema)
    return (
      <Vacio
        icono={<Network />}
        titulo="Aún no hay sistemas hospitalarios"
        descripcion="Crea el primer sistema hospitalario para empezar a registrar sedes, personal y pacientes."
        accion={<Boton onClick={() => (location.hash = "#/plataforma")}>Crear sistema</Boton>}
      />
    );
  return <Suspense fallback={<Cargando />}>{children}</Suspense>;
}

const s = (el: ReactNode) => <ConSistema>{el}</ConSistema>;

export const enrutador = createHashRouter([
  {
    element: <Puerta />,
    errorElement: <ErrorRuta />,
    children: [
      { path: "quiosco", element: <PantallaCompleta><Quiosco /></PantallaCompleta> },
      { path: "pantalla", element: <PantallaCompleta><Pantalla /></PantallaCompleta> },
      {
        element: <AppShell />,
        errorElement: <ErrorRuta />,
        children: [
          { index: true, element: s(<Dashboard />) },
          { path: "recepcion", element: s(<Recepcion />) },
          { path: "estadisticas", element: s(<Estadisticas />) },
          { path: "medicos", element: s(<PaginaMedicos />) },
          { path: "agenda", element: s(<Agenda />) },
          { path: "pacientes", element: s(<Pacientes />) },
          { path: "pacientes/:id", element: s(<PacienteDetalle />) },
          { path: "caja", element: s(<Caja />) },
          { path: "gastos", element: s(<Compras />) },
          { path: "compras", element: <Navigate to="/gastos" replace /> },
          { path: "comisiones", element: <Navigate to="/medicos?vista=pagos" replace /> },
          { path: "nomina", element: s(<Nomina />) },
          { path: "contabilidad", element: s(<Contabilidad />) },
          { path: "finanzas", element: s(<PaginaFinanzas />) },
          { path: "finanzas/cierres", element: s(<CierresDetalle />) },
          { path: "reportes", element: <Navigate to="/finanzas?vista=reportes" replace /> },
          { path: "inventario", element: s(<Inventario />) },
          { path: "laboratorio", element: s(<Laboratorio />) },
          { path: "farmacia", element: s(<Farmacia />) },
          { path: "internamiento", element: s(<Internamiento />) },
          { path: "personal", element: s(<Personal />) },
          { path: "precios", element: s(<PaginaPrecios />) },
          { path: "administracion", element: s(<PaginaAdministracion />) },
          { path: "ayuda", element: s(<Ayuda />) },
          // Rutas de antes del menú agrupado (enlaces guardados, accesos directos).
          { path: "servicios", element: <Navigate to="/precios?vista=servicios" replace /> },
          { path: "catalogos", element: <Navigate to="/precios?vista=servicios" replace /> },
          { path: "aseguradoras", element: <Navigate to="/precios?vista=aseguradoras" replace /> },
          { path: "configuracion", element: <Navigate to="/administracion?vista=sistema" replace /> },
          { path: "integraciones", element: <Navigate to="/administracion?vista=integraciones" replace /> },
          { path: "auditoria", element: <Navigate to="/administracion?vista=auditoria" replace /> },
          {
            path: "plataforma",
            element: (
              <Suspense fallback={<Cargando />}>
                <Plataforma />
              </Suspense>
            ),
          },
          {
            path: "perfil",
            element: (
              <Suspense fallback={<Cargando />}>
                <Perfil />
              </Suspense>
            ),
          },
          { path: "*", element: s(<Dashboard />) },
        ],
      },
    ],
  },
]);
