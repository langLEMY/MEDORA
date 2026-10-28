import { AnimatePresence, motion } from "motion/react";
import { type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Segmentado } from "@/components/ui/campos";
import { puede } from "@/lib/permisos";
import { soloLoPropio, useSesion } from "@/sesion/SesionProvider";
import { pantalla } from "@/lib/precarga";

/**
 * Entradas del menú que agrupan varias pantallas relacionadas (ver
 * components/layout/navegacion.ts). La pestaña activa vive en ?vista= para que
 * los enlaces, el buscador y el botón «atrás» funcionen; cada persona solo ve
 * las pestañas que su rol y sus permisos permiten.
 */

const Medicos = pantalla(() => import("./Medicos"));
const Comisiones = pantalla(() => import("./Comisiones"));
const Servicios = pantalla(() => import("./Catalogos"));
const Aseguradoras = pantalla(() => import("./Catalogos").then((m) => ({ default: m.PaginaAseguradoras })));
const Configuracion = pantalla(() => import("./Configuracion"));
const Integraciones = pantalla(() => import("./Integraciones"));
const Auditoria = pantalla(() => import("./Auditoria"));
const Reportes = pantalla(() => import("./Reportes"));
const ResumenFinanciero = pantalla(() => import("./Finanzas").then((m) => ({ default: m.ResumenFinanciero })));
const MovimientosImportantes = pantalla(() => import("./Finanzas").then((m) => ({ default: m.MovimientosImportantes })));
const CierresDiarios = pantalla(() => import("./Finanzas").then((m) => ({ default: m.CierresDiarios })));
const Donaciones = pantalla(() => import("./Finanzas").then((m) => ({ default: m.Donaciones })));
const ConciliacionBancaria = pantalla(() => import("@/components/ConciliacionBancaria").then((m) => ({ default: m.ConciliacionBancaria })));

interface Seccion {
  clave: string;
  etiqueta: string;
  visible: boolean;
  contenido: ReactNode;
}

function Secciones({ id, secciones }: { id: string; secciones: Seccion[] }) {
  const [params, setParams] = useSearchParams();
  const visibles = secciones.filter((s) => s.visible);
  const actual = visibles.find((s) => s.clave === params.get("vista")) ?? visibles[0];
  if (!actual) return <Navigate to="/" replace />;

  return (
    <>
      {visibles.length > 1 && (
        <div className="mb-5">
          <Segmentado
            id={id}
            valor={actual.clave}
            onChange={(v) => setParams(new URLSearchParams({ vista: v }), { replace: true })}
            opciones={visibles.map((s) => ({ valor: s.clave, etiqueta: s.etiqueta }))}
          />
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={actual.clave}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          {actual.contenido}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function usePuede() {
  const { roles, esSuperadmin, permisos } = useSesion();
  return { ver: (m: Parameters<typeof puede>[1]) => puede(roles, m, esSuperadmin, permisos), esSuperadmin, propio: soloLoPropio(roles) };
}

/** Médicos: directorio y cola de colegas · pago de médicos (comisiones). */
export function PaginaMedicos() {
  const { ver, propio } = usePuede();
  return (
    <Secciones
      id="medicos"
      secciones={[
        { clave: "directorio", etiqueta: "Directorio", visible: ver("recepcion") && !propio, contenido: <Medicos /> },
        { clave: "pagos", etiqueta: "Pago de médicos", visible: ver("comisiones"), contenido: <Comisiones /> },
      ]}
    />
  );
}

/** Precios y seguros: lista de precios · aseguradoras y sus tarifarios. */
export function PaginaPrecios() {
  const { ver } = usePuede();
  return (
    <Secciones
      id="precios"
      secciones={[
        { clave: "servicios", etiqueta: "Servicios y precios", visible: ver("catalogos"), contenido: <Servicios /> },
        { clave: "aseguradoras", etiqueta: "Aseguradoras", visible: ver("aseguradoras"), contenido: <Aseguradoras /> },
      ]}
    />
  );
}

/** Finanzas: resumen con gráficos · movimientos importantes · cierres diarios · donaciones · banco · reportes. */
export function PaginaFinanzas() {
  const { ver } = usePuede();
  return (
    <Secciones
      id="finanzas"
      secciones={[
        { clave: "resumen", etiqueta: "Resumen", visible: ver("contabilidad"), contenido: <ResumenFinanciero /> },
        { clave: "movimientos", etiqueta: "Movimientos", visible: ver("contabilidad"), contenido: <MovimientosImportantes /> },
        { clave: "cierres", etiqueta: "Cierres diarios", visible: ver("contabilidad"), contenido: <CierresDiarios /> },
        { clave: "donaciones", etiqueta: "Donaciones", visible: ver("caja") || ver("contabilidad"), contenido: <Donaciones /> },
        { clave: "banco", etiqueta: "Banco", visible: ver("contabilidad"), contenido: <ConciliacionBancaria /> },
        { clave: "reportes", etiqueta: "Reportes", visible: ver("reportes"), contenido: <Reportes /> },
      ]}
    />
  );
}

/** Administración: datos del sistema y sedes · integraciones · auditoría. */
export function PaginaAdministracion() {
  const { ver, esSuperadmin } = usePuede();
  return (
    <Secciones
      id="administracion"
      secciones={[
        { clave: "sistema", etiqueta: "Sistema y sedes", visible: esSuperadmin, contenido: <Configuracion /> },
        { clave: "integraciones", etiqueta: "Integraciones", visible: ver("integraciones"), contenido: <Integraciones /> },
        { clave: "auditoria", etiqueta: "Auditoría", visible: ver("auditoria"), contenido: <Auditoria /> },
      ]}
    />
  );
}
