import { lazy, Suspense, type ReactNode } from "react";
import { createHashRouter, Navigate } from "react-router-dom";
import { Network } from "lucide-react";
import { ErrorRuta } from "./components/ErrorRuta";
import { AppShell } from "./components/layout/AppShell";
import { Boton } from "./components/ui/boton";
import { Esqueleto, Vacio } from "./components/ui/superficies";
import { Puerta } from "./paginas/acceso/Puerta";
import { useSesion } from "./sesion/SesionProvider";

// Hash router: el launcher sirve archivos estáticos desde disco, no hay
// servidor que reescriba rutas profundas a index.html.
const Dashboard = lazy(() => import("./paginas/Dashboard"));
const Recepcion = lazy(() => import("./paginas/Recepcion"));
const Medicos = lazy(() => import("./paginas/Medicos"));
const Agenda = lazy(() => import("./paginas/Agenda"));
const Pacientes = lazy(() => import("./paginas/pacientes/Pacientes"));
const PacienteDetalle = lazy(() => import("./paginas/pacientes/PacienteDetalle"));
const Caja = lazy(() => import("./paginas/Caja"));
const Compras = lazy(() => import("./paginas/Compras"));
const Comisiones = lazy(() => import("./paginas/Comisiones"));
const Nomina = lazy(() => import("./paginas/Nomina"));
const Contabilidad = lazy(() => import("./paginas/Contabilidad"));
const Reportes = lazy(() => import("./paginas/Reportes"));
const Inventario = lazy(() => import("./paginas/Inventario"));
const Personal = lazy(() => import("./paginas/Personal"));
const Servicios = lazy(() => import("./paginas/Catalogos"));
const Aseguradoras = lazy(() => import("./paginas/Catalogos").then((m) => ({ default: m.PaginaAseguradoras })));
const Auditoria = lazy(() => import("./paginas/Auditoria"));
const Integraciones = lazy(() => import("./paginas/Integraciones"));
const Configuracion = lazy(() => import("./paginas/Configuracion"));
const Plataforma = lazy(() => import("./paginas/Plataforma"));
const Perfil = lazy(() => import("./paginas/Perfil"));
const Quiosco = lazy(() => import("./paginas/Quiosco"));
const Pantalla = lazy(() => import("./paginas/Pantalla"));

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
          { path: "medicos", element: s(<Medicos />) },
          { path: "agenda", element: s(<Agenda />) },
          { path: "pacientes", element: s(<Pacientes />) },
          { path: "pacientes/:id", element: s(<PacienteDetalle />) },
          { path: "caja", element: s(<Caja />) },
          { path: "compras", element: s(<Compras />) },
          { path: "comisiones", element: s(<Comisiones />) },
          { path: "nomina", element: s(<Nomina />) },
          { path: "contabilidad", element: s(<Contabilidad />) },
          { path: "reportes", element: s(<Reportes />) },
          { path: "inventario", element: s(<Inventario />) },
          { path: "personal", element: s(<Personal />) },
          { path: "servicios", element: s(<Servicios />) },
          { path: "aseguradoras", element: s(<Aseguradoras />) },
          { path: "catalogos", element: <Navigate to="/servicios" replace /> },
          { path: "auditoria", element: s(<Auditoria />) },
          { path: "integraciones", element: s(<Integraciones />) },
          { path: "configuracion", element: s(<Configuracion />) },
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
