import { useEffect, useState } from "react";
import { Documento } from "@/components/Documento";
import { nombrePaciente, type CitaConRelaciones } from "@/lib/consultas";
import { fechaHora } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/** Bloque del turno: va en el ticket suelto y dentro de la factura del cobro. */
export function BloqueTurno({ turno, destino, delante }: { turno: string; destino: string; delante?: number }) {
  return (
    <div className="my-2 rounded-md border-2 border-black py-2 text-center">
      <p className="text-[0.6875rem] tracking-widest">SU TURNO</p>
      <p className="text-[2.125rem] leading-none font-black tracking-wide">{turno}</p>
      <p className="mt-1">{destino}</p>
      {delante !== undefined && <p className="text-[0.6875rem]">{delante === 0 ? "Es el próximo" : `${delante} antes que usted`}</p>}
    </div>
  );
}

/** Ticket de turno para la térmica (exoneraciones o sistemas que no cobran antes). */
export function TicketTurno({ cita, delante, onCerrar }: { cita: CitaConRelaciones | null; delante?: number; onCerrar: () => void }) {
  const { sistema } = useSistema();
  const [ultima, setUltima] = useState(cita);
  useEffect(() => {
    if (cita) setUltima(cita);
  }, [cita]);
  const c = cita ?? ultima;
  if (!c?.turno) return null;
  return (
    <Documento abierto={!!cita} onCerrar={onCerrar} titulo={`Turno ${c.turno}`} nombreArchivo={`Turno ${c.turno}`} formato="ticket">
      {(sistema.logo_factura ?? sistema.logo_url) && <img src={(sistema.logo_factura ?? sistema.logo_url)!} alt="" className="mx-auto mb-1.5 max-h-16 w-auto" />}
      <p className="text-center font-bold">{sistema.nombre}</p>
      <BloqueTurno turno={c.turno} destino={destinoTurno(c)} delante={delante} />
      <p className="text-center">
        {nombrePaciente(c)}
      </p>
      <p className="text-center text-[0.6875rem]">{fechaHora(c.turno_en ?? new Date().toISOString())}</p>
      {c.motivo_exoneracion && <p className="mt-1 text-center text-[0.6875rem]">Exonerado de pago</p>}
      <p className="mt-2 text-center text-[0.6875rem]">Espere a ser llamado en la pantalla.</p>
    </Documento>
  );
}

export const destinoTurno = (c: Pick<CitaConRelaciones, "medico" | "especialidad" | "medico_id">) =>
  c.medico_id && c.medico ? c.medico.nombre_completo : `${c.especialidad ?? "Consulta"} · próximo médico disponible`;
