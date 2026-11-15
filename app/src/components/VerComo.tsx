import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/modal";
import { ETIQUETA_ROL } from "@/lib/permisos";
import type { Rol } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";

// Qué cambia al ver la app con cada rol (para elegir rápido qué probar).
const QUE_VE: Partial<Record<Rol, string>> = {
  admin: "Todo el hospital, sin las herramientas de soporte de MEDORA",
  gerencia: "Indicadores, finanzas y reportes",
  contabilidad: "Contabilidad, nómina, gastos y finanzas",
  medico: "Solo sus citas y sus pacientes (Mi agenda, Mi consulta)",
  enfermeria: "Enfermería: preconsulta, procedimientos y Kardex",
  recepcion: "Recepción, agenda, pacientes y turnos",
  caja: "Caja, cobros, cuadre y cuentas por cobrar",
  farmacia: "Farmacia, inventario y gastos",
  laboratorio: "Laboratorio: órdenes y resultados",
  auditor: "Solo lectura: auditoría, historias y finanzas",
  psicologia: "Sus pacientes y notas confidenciales de psicología",
  nutricion: "Sus pacientes y su consulta de nutrición",
  terapia: "Sus pacientes y su consulta de terapia",
};

/** Franja fija mientras se ve la app como otro rol: siempre se sabe y se vuelve con un clic. */
export function FranjaVerComo() {
  const { verComo, cambiarVerComo } = useSesion();
  const navegar = useNavigate();
  return (
    <AnimatePresence initial={false}>
      {verComo && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="no-imprimir flex items-center gap-3 bg-[#6941c6] px-6 py-1.5 text-[0.8125rem] text-white lg:px-8"
          role="status"
        >
          <Eye className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Viendo MEDORA como <b>{verComo.map((r) => ETIQUETA_ROL[r] ?? r).join(" + ")}</b>: los permisos de la base también son los de ese rol.
          </span>
          <button
            type="button"
            onClick={() => {
              cambiarVerComo(null);
              navegar("/");
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 font-medium transition-colors hover:bg-white/25"
          >
            <Undo2 className="size-3.5" /> Volver a mi vista
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Elegir con qué rol ver la app (solo superadmin; solo roles que tiene en este sistema). */
export function ModalVerComo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { rolesReales, verComo, cambiarVerComo, sistema } = useSesion();
  const navegar = useNavigate();
  const opciones = rolesReales.filter((r) => r !== "quiosco");

  const elegir = (r: Rol | null) => {
    cambiarVerComo(r ? [r] : null);
    onCerrar();
    // El Inicio se adapta al rol; la pantalla actual podría no existir para él.
    navegar("/");
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Ver como…"
      descripcion={`Prueba ${sistema?.nombre ?? "este sistema"} con los ojos de otro rol, sin cambiar de cuenta. Solo puedes elegir roles que tienes aquí.`}
    >
      {opciones.length <= 1 ? (
        <p className="py-4 text-sm text-texto-2">
          En este sistema solo tienes el rol {opciones[0] ? <b>{ETIQUETA_ROL[opciones[0]]}</b> : "—"}. Para probar otros, entra al sistema de pruebas (ahí tienes todos los roles).
        </p>
      ) : (
        <ul className="space-y-1.5">
          <li>
            <Opcion activa={!verComo} titulo="Mi vista" detalle="Con todos mis roles y permisos" onClick={() => elegir(null)} />
          </li>
          {opciones.map((r) => (
            <li key={r}>
              <Opcion activa={verComo?.length === 1 && verComo[0] === r} titulo={ETIQUETA_ROL[r] ?? r} detalle={QUE_VE[r] ?? ""} onClick={() => elegir(r)} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Opcion({ activa, titulo, detalle, onClick }: { activa: boolean; titulo: string; detalle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        activa ? "border-marca bg-marca-suave" : "border-borde bg-superficie hover:border-borde-fuerte",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{titulo}</span>
        {detalle && <span className="block truncate text-xs text-texto-3">{detalle}</span>}
      </span>
      {activa && <Check className="size-4 text-marca-texto" />}
    </button>
  );
}
