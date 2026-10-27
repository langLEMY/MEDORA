import { useMutation, useQuery } from "@tanstack/react-query";
import { HandCoins, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Documento } from "@/components/Documento";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, METODOS_PAGO } from "@/lib/consultas";
import { datos, mensajeError, supabase, type MetodoPago } from "@/lib/supabase";
import { fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { METODOS_DINERO } from "./comun";

// ---------------------------------------------------------------------------
// Anticipos
// ---------------------------------------------------------------------------
export interface Comprobante {
  titulo: string;
  numero: string;
  fecha: string;
  lineas: [string, string][];
  monto: number;
}

export function Anticipos({ onComprobante }: { onComprobante: (c: Comprobante) => void }) {
  const { sistemaId } = useSistema();
  const q = useQuery({
    queryKey: [...claves.caja(sistemaId), "anticipos"],
    queryFn: async () =>
      datos(
        await supabase
          .from("anticipos")
          .select("id, numero, monto, metodo, referencia, fecha, notas, creado_en, paciente:pacientes!anticipos_sistema_id_paciente_id_fkey(nombres, apellidos, expediente)")
          .eq("sistema_id", sistemaId)
          .order("creado_en", { ascending: false })
          .limit(100),
      ),
  });
  return (
    <Tarjeta className="overflow-hidden">
      {q.isLoading ? (
        <Esqueleto className="m-5 h-40" />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<HandCoins />} titulo="Sin anticipos" descripcion="Los pagos adelantados de pacientes se aplican luego como método de pago en sus cobros." />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((a) => (
            <li key={a.id} className="group flex items-center gap-4 px-5 py-3 text-sm">
              <span className="w-28 font-medium tabular">{a.numero}</span>
              <span className="w-28 text-texto-2">{fecha(a.fecha + "T00:00:00")}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.paciente?.nombres} {a.paciente?.apellidos}
              </span>
              <Insignia>{METODOS_PAGO[a.metodo]}</Insignia>
              <span className="w-32 text-right font-semibold tabular">{moneda(a.monto)}</span>
              <button
                title="Comprobante"
                onClick={() =>
                  onComprobante({
                    titulo: "Comprobante de anticipo",
                    numero: a.numero,
                    fecha: a.fecha,
                    monto: Number(a.monto),
                    lineas: [
                      ["Paciente", `${a.paciente?.nombres} ${a.paciente?.apellidos}`],
                      ["Expediente", a.paciente?.expediente ?? ""],
                      ["Método", METODOS_PAGO[a.metodo]],
                      ...(a.referencia ? ([["Referencia", a.referencia]] as [string, string][]) : []),
                      ...(a.notas ? ([["Notas", a.notas]] as [string, string][]) : []),
                    ],
                  })
                }
                className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2 hover:text-texto"
              >
                <Printer className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

export function NuevoAnticipo({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: (c: Comprobante) => void }) {
  const { sistemaId } = useSistema();
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [referencia, setReferencia] = useState("");
  const [fechaAnt, setFechaAnt] = useState(isoDia());
  const [notas, setNotas] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setPaciente(null);
    setMonto("");
    setMetodo("efectivo");
    setReferencia("");
    setFechaAnt(isoDia());
    setNotas("");
  }, [abierto]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("registrar_anticipo", {
          p_sistema: sistemaId,
          p_paciente: paciente!.id,
          p_monto: Number(monto),
          p_metodo: metodo,
          p_referencia: referencia || undefined,
          p_fecha: fechaAnt,
          p_notas: notas || undefined,
        }),
      ) as { numero: string },
    onSuccess: (r) => {
      toast.success(`Anticipo ${r.numero} registrado`);
      onCerrar();
      onListo({
        titulo: "Comprobante de anticipo",
        numero: r.numero,
        fecha: fechaAnt,
        monto: Number(monto),
        lineas: [
          ["Paciente", `${paciente!.nombres} ${paciente!.apellidos}`],
          ["Expediente", paciente!.expediente],
          ["Método", METODOS_PAGO[metodo]],
          ...(referencia ? ([["Referencia", referencia]] as [string, string][]) : []),
        ],
      });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const atrasado = fechaAnt < isoDia();

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar anticipo"
      descripcion="Queda como saldo a favor del paciente y se aplica en sus próximos cobros."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!paciente || !(Number(monto) > 0)} onClick={() => m.mutate()}>
            Registrar anticipo
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorPaciente valor={paciente} onChange={setPaciente} />
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Monto" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Selector etiqueta="Método" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
            {METODOS_DINERO.map((x) => (
              <option key={x} value={x}>
                {METODOS_PAGO[x]}
              </option>
            ))}
          </Selector>
          <Entrada
            etiqueta="Fecha del pago"
            type="date"
            max={isoDia()}
            value={fechaAnt}
            onChange={(e) => setFechaAnt(e.target.value)}
            ayuda={atrasado ? "Registro con fecha anterior (queda en la bitácora)." : undefined}
          />
          <Entrada etiqueta="Referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} disabled={metodo === "efectivo"} />
        </div>
        <AreaTexto etiqueta="Notas" className="min-h-16" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Depósito para cirugía programada" />
      </div>
    </Modal>
  );
}

export function ComprobanteTicket({ comprobante: c, onCerrar }: { comprobante: Comprobante | null; onCerrar: () => void }) {
  const { sistema } = useSistema();
  const [ultimo, setUltimo] = useState(c);
  useEffect(() => {
    if (c) setUltimo(c);
  }, [c]);
  const x = c ?? ultimo;
  if (!x) return null;
  return (
    <Documento abierto={!!c} onCerrar={onCerrar} titulo={`${x.titulo} ${x.numero}`} nombreArchivo={`${x.titulo} ${x.numero}`} formato="ticket">
      <p className="text-center text-[0.875rem] font-bold">{sistema.nombre}</p>
      <p className="text-center font-bold">{x.titulo.toUpperCase()}</p>
      <p className="text-center">
        {x.numero} · {fecha(x.fecha + "T00:00:00")}
      </p>
      <hr className="my-2 border-dashed border-black/40" />
      {x.lineas.map(([k, v]) => (
        <p key={k}>
          {k}: {v}
        </p>
      ))}
      <hr className="my-2 border-dashed border-black/40" />
      <div className="flex justify-between text-[0.875rem] font-bold">
        <span>MONTO</span>
        <span>{moneda(x.monto)}</span>
      </div>
      <p className="mt-6 text-center">______________________</p>
      <p className="text-center">Firma</p>
    </Documento>
  );
}
