import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Esqueleto, Insignia, Tarjeta } from "@/components/ui/superficies";
import { claves, METODOS_PAGO } from "@/lib/consultas";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fechaHora, hora, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------
export function Turnos() {
  const { sistemaId } = useSistema();
  const [arqueo, setArqueo] = useState<{ id: string; cajero: string; abierto_en: string; cerrado_en: string | null; apertura: number; esperado: number | null; declarado: number | null; notas: string | null } | null>(null);
  const turnos = useQuery({
    queryKey: [...claves.caja(sistemaId), "turnos"],
    queryFn: async () =>
      datos(
        await supabase
          .from("turnos_caja")
          .select("*, cajero:perfiles!turnos_cajero_perfil_fk(nombre_completo)")
          .eq("sistema_id", sistemaId)
          .order("abierto_en", { ascending: false })
          .limit(30),
      ),
  });
  return (
    <Tarjeta className="overflow-hidden">
      {turnos.isLoading ? (
        <Esqueleto className="m-5 h-40" />
      ) : (
        <ul className="divide-y divide-borde">
          {turnos.data?.map((x) => {
            const dif = x.monto_declarado !== null && x.monto_esperado !== null ? Number(x.monto_declarado) - Number(x.monto_esperado) : null;
            return (
              <li key={x.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{x.cajero?.nombre_completo}</span>
                  <span className="block text-xs text-texto-3">
                    {fechaHora(x.abierto_en)} → {x.cerrado_en ? hora(x.cerrado_en) : "abierto"}
                  </span>
                </span>
                {x.estado === "abierto" ? (
                  <Insignia tono="exito" punto>
                    Abierto
                  </Insignia>
                ) : dif !== null && Math.abs(dif) >= 0.01 ? (
                  <Insignia tono={dif < 0 ? "peligro" : "aviso"}>
                    {dif < 0 ? "Faltante" : "Sobrante"} {moneda(Math.abs(dif))}
                  </Insignia>
                ) : (
                  <Insignia tono="neutro">Cuadrado</Insignia>
                )}
                <span className="w-32 text-right tabular">{x.monto_esperado !== null ? moneda(x.monto_esperado) : "—"}</span>
                <button
                  title="Reporte de arqueo"
                  onClick={() =>
                    setArqueo({
                      id: x.id,
                      cajero: x.cajero?.nombre_completo ?? "",
                      abierto_en: x.abierto_en,
                      cerrado_en: x.cerrado_en,
                      apertura: Number(x.monto_apertura),
                      esperado: x.monto_esperado === null ? null : Number(x.monto_esperado),
                      declarado: x.monto_declarado === null ? null : Number(x.monto_declarado),
                      notas: x.notas_cierre,
                    })
                  }
                  className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
                >
                  <Printer className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Arqueo turno={arqueo} onCerrar={() => setArqueo(null)} />
    </Tarjeta>
  );
}

/** Reporte de cierre de turno: movimientos por método y cuadre del efectivo. */
function Arqueo({
  turno,
  onCerrar,
}: {
  turno: { id: string; cajero: string; abierto_en: string; cerrado_en: string | null; apertura: number; esperado: number | null; declarado: number | null; notas: string | null } | null;
  onCerrar: () => void;
}) {
  const q = useQuery({
    queryKey: ["arqueo", turno?.id],
    enabled: !!turno,
    queryFn: async () =>
      datos(await supabase.from("movimientos_financieros").select("tipo, categoria, concepto, monto, metodo, creado_en").eq("turno_id", turno!.id).order("creado_en")) ?? [],
  });
  const $ = (v: number) => moneda(v);
  const movs = q.data ?? [];
  const metodos = [...new Set(movs.map((m) => m.metodo))];
  const suma = (tipo: string, metodo?: string) => movs.filter((m) => m.tipo === tipo && (!metodo || m.metodo === metodo)).reduce((s, m) => s + Number(m.monto), 0);
  const esperadoEfectivo = turno ? turno.apertura + suma("ingreso", "efectivo") - suma("egreso", "efectivo") : 0;
  const esperado = turno?.esperado ?? esperadoEfectivo;
  const dif = turno?.declarado !== null && turno?.declarado !== undefined ? turno.declarado - esperado : null;

  return (
    <Documento abierto={!!turno} onCerrar={onCerrar} titulo="Arqueo de caja" nombreArchivo={`Arqueo ${turno?.cajero ?? ""} ${turno?.abierto_en.slice(0, 10) ?? ""}`}>
      {turno && (
        <>
          <EncabezadoDocumento
            titulo="Arqueo de caja"
            subtitulo={
              <>
                {turno.cajero} · {fechaHora(turno.abierto_en)} → {turno.cerrado_en ? fechaHora(turno.cerrado_en) : "turno abierto"}
              </>
            }
          />
          <TablaDocumento
            encabezados={["Método", "Ingresos", "Egresos", "Neto"]}
            filas={metodos.map((m) => [METODOS_PAGO[m], $(suma("ingreso", m)), $(suma("egreso", m)), $(suma("ingreso", m) - suma("egreso", m))])}
            pie={["Total", $(suma("ingreso")), $(suma("egreso")), $(suma("ingreso") - suma("egreso"))]}
          />
          <div className="mt-6 grid grid-cols-2 gap-8">
            <TablaDocumento
              encabezados={["Cuadre de efectivo", "Monto"]}
              filas={[
                ["Fondo de apertura", $(turno.apertura)],
                ["Ingresos en efectivo", $(suma("ingreso", "efectivo"))],
                ["Egresos en efectivo", $(-suma("egreso", "efectivo"))],
                ["Efectivo esperado", $(esperado)],
                ["Efectivo contado", turno.declarado !== null ? $(turno.declarado) : "—"],
              ]}
              pie={["Diferencia", dif === null ? "—" : `${dif < 0 ? "Faltante " : dif > 0 ? "Sobrante " : ""}${$(Math.abs(dif))}`]}
            />
            <div className="text-[0.75rem]">
              {turno.notas && (
                <p>
                  <b>Notas de cierre:</b> {turno.notas}
                </p>
              )}
              <p className="mt-16 w-56 border-t border-[#101828] pt-1 text-center text-[0.6875rem]">Cajero</p>
              <p className="mt-12 w-56 border-t border-[#101828] pt-1 text-center text-[0.6875rem]">Supervisor</p>
            </div>
          </div>
          <div className="mt-6">
            <TablaDocumento
              encabezados={["Hora", "Concepto", "Método", "Ingreso", "Egreso"]}
              filas={movs.map((m) => [hora(m.creado_en), m.concepto, METODOS_PAGO[m.metodo], m.tipo === "ingreso" ? $(m.monto) : "", m.tipo === "egreso" ? $(m.monto) : ""])}
            />
          </div>
        </>
      )}
    </Documento>
  );
}

export function CerrarTurno({
  abierto,
  onCerrar,
  turnoId,
  esperado,
  onListo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  turnoId: string;
  esperado: number;
  onListo: () => void;
}) {
  const [declarado, setDeclarado] = useState("");
  const [notas, setNotas] = useState("");
  const dif = declarado === "" ? null : Number(declarado) - esperado;
  const m = useMutation({
    mutationFn: async () =>
      datos(await supabase.rpc("cerrar_turno_caja", { p_turno: turnoId, p_monto_declarado: Number(declarado), p_notas: notas || undefined })),
    onSuccess: () => {
      toast.success("Turno cerrado");
      onListo();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Cerrar turno"
      descripcion="Cuenta el efectivo en caja y regístralo. El sistema calcula la diferencia."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={declarado === ""} onClick={() => m.mutate()}>
            Cerrar turno
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-superficie-2 px-4 py-3 text-sm">
          <span className="text-texto-2">Efectivo esperado</span>
          <span className="font-semibold tabular">{moneda(esperado)}</span>
        </div>
        <Entrada etiqueta="Efectivo contado" type="number" step="0.01" value={declarado} onChange={(e) => setDeclarado(e.target.value)} />
        <AnimatePresence>
          {dif !== null && Math.abs(dif) >= 0.01 && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn("overflow-hidden text-sm font-medium", dif < 0 ? "text-peligro" : "text-aviso")}
            >
              {dif < 0 ? "Faltante" : "Sobrante"} de {moneda(Math.abs(dif))}
            </motion.p>
          )}
        </AnimatePresence>
        <AreaTexto etiqueta="Notas de cierre" className="min-h-16" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}
