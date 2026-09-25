import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { claves, useMedicos, useSedes, useServicios } from "@/lib/consultas";
import { mensajeError, supabase, type EstadoCita, type Tablas } from "@/lib/supabase";
import { isoDia } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { SelectorPaciente, type PacienteBreve } from "./SelectorPaciente";
import { Boton } from "./ui/boton";
import { AreaTexto, Entrada, Selector } from "./ui/campos";
import { Modal } from "./ui/modal";

/** Programar cita (o registrar un paciente sin cita: "llegada directa" → en_espera). */
export function FormCita({
  abierto,
  onCerrar,
  dia,
  medicoInicial,
  horaInicial,
  llegadaDirecta,
}: {
  abierto: boolean;
  onCerrar: () => void;
  dia?: string;
  medicoInicial?: string;
  horaInicial?: string;
  llegadaDirecta?: boolean;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const medicos = useMedicos(sistemaId);
  const servicios = useServicios(sistemaId);
  const sedes = useSedes(sistemaId);

  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [medico, setMedico] = useState("");
  const [servicio, setServicio] = useState("");
  const [sede, setSede] = useState("");
  const [fecha, setFecha] = useState(isoDia());
  const [horaTxt, setHoraTxt] = useState("08:00");
  const [duracion, setDuracion] = useState(30);
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setPaciente(null);
    setMedico(medicoInicial ?? "");
    setServicio("");
    setFecha(dia ?? isoDia());
    const ahora = new Date();
    const redondeo = `${String(ahora.getHours()).padStart(2, "0")}:${String(Math.floor(ahora.getMinutes() / 15) * 15).padStart(2, "0")}`;
    setHoraTxt(horaInicial ?? (llegadaDirecta ? redondeo : "08:00"));
    setDuracion(30);
    setMotivo("");
    setIntentado(false);
  }, [abierto, dia, medicoInicial, horaInicial, llegadaDirecta]);

  useEffect(() => {
    if (!sede && sedes.data?.length === 1) setSede(sedes.data[0].id);
  }, [sedes.data, sede]);

  const guardar = useMutation({
    mutationFn: async () => {
      const inicio = new Date(`${fecha}T${horaTxt}:00`);
      const fin = new Date(inicio.getTime() + duracion * 60_000);
      const estado: EstadoCita = llegadaDirecta ? "en_espera" : "programada";
      const { error } = await supabase.from("citas").insert({
        sistema_id: sistemaId,
        paciente_id: paciente!.id,
        medico_id: medico,
        servicio_id: servicio || null,
        sede_id: sede || null,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        motivo: motivo.trim() || null,
        estado,
        llegada_en: llegadaDirecta ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(llegadaDirecta ? "Paciente en sala de espera" : "Cita programada");
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      void qc.invalidateQueries({ queryKey: ["dashboard", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const enviar = () => {
    setIntentado(true);
    if (paciente && medico) guardar.mutate();
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={llegadaDirecta ? "Llegada sin cita" : "Programar cita"}
      descripcion={llegadaDirecta ? "El paciente pasa directo a la sala de espera." : undefined}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} onClick={enviar}>
            {llegadaDirecta ? "Enviar a sala de espera" : "Programar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorPaciente valor={paciente} onChange={setPaciente} error={intentado && !paciente ? "Selecciona un paciente" : undefined} />
        <div className="grid grid-cols-2 gap-4">
          <Selector
            etiqueta="Médico"
            value={medico}
            onChange={(e) => setMedico(e.target.value)}
            error={intentado && !medico ? "Selecciona un médico" : undefined}
          >
            <option value="">Seleccionar…</option>
            {medicos.data?.map((m) => (
              <option key={m.usuario_id} value={m.usuario_id}>
                {m.perfil?.nombre_completo}
                {m.especialidad ? ` · ${m.especialidad}` : ""}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta="Servicio"
            value={servicio}
            onChange={(e) => {
              setServicio(e.target.value);
              const s = servicios.data?.find((x) => x.id === e.target.value);
              if (s) setDuracion(s.duracion_min);
            }}
          >
            <option value="">Consulta general</option>
            {servicios.data
              ?.filter((s) => s.activo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
          </Selector>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Entrada etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={llegadaDirecta} />
          <Entrada etiqueta="Hora" type="time" step={300} value={horaTxt} onChange={(e) => setHoraTxt(e.target.value)} />
          <Selector etiqueta="Duración" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            {[10, 15, 20, 30, 45, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </Selector>
        </div>
        {(sedes.data?.length ?? 0) > 1 && (
          <Selector etiqueta="Sede" value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="">—</option>
            {sedes.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        )}
        <AreaTexto etiqueta="Motivo" className="min-h-16" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Cambia el estado de una cita, con los sellos de tiempo que correspondan. */
export function useCambiarEstadoCita() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado, motivo }: { id: string; estado: EstadoCita; motivo?: string }) => {
      const cambios: Tablas["citas"]["Update"] = { estado };
      if (estado === "en_espera") cambios.llegada_en = new Date().toISOString();
      if (estado === "en_consulta") cambios.atendida_en = new Date().toISOString();
      if (estado === "cancelada") cambios.motivo_cancelacion = motivo ?? null;
      const { error } = await supabase.from("citas").update(cambios).eq("id", id);
      if (error) throw error;
    },
    // Optimista: la tarjeta se mueve de columna al instante; si falla, se revierte.
    onMutate: async ({ id, estado }) => {
      await qc.cancelQueries({ queryKey: claves.citas(sistemaId) });
      const previas = qc.getQueriesData({ queryKey: claves.citas(sistemaId) });
      qc.setQueriesData({ queryKey: claves.citas(sistemaId) }, (d: unknown) =>
        Array.isArray(d) ? d.map((c) => (c.id === id ? { ...c, estado, llegada_en: estado === "en_espera" ? new Date().toISOString() : c.llegada_en } : c)) : d,
      );
      return { previas };
    },
    onError: (e, _v, ctx) => {
      ctx?.previas.forEach(([k, d]) => qc.setQueryData(k, d));
      toast.error(mensajeError(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      void qc.invalidateQueries({ queryKey: ["dashboard", sistemaId] });
    },
  });
}
