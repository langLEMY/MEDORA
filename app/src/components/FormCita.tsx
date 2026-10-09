import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Forward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { claves, ESTADO_CITA, mismaEspecialidad, useMedicos, useSedes, useServicios } from "@/lib/consultas";
import { OpcionesMedicos } from "./OpcionesMedicos";
import { mensajeError, supabase, type EstadoCita, type Tablas } from "@/lib/supabase";
import { isoDia } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
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
  const yo = useSesion().sesion?.user.id;

  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [medico, setMedico] = useState("");
  const [servicio, setServicio] = useState("");
  const [sede, setSede] = useState("");
  const [fecha, setFecha] = useState(isoDia());
  const [horaTxt, setHoraTxt] = useState("08:00");
  const [duracion, setDuracion] = useState(30);
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  // Un médico que agenda con otro profesional está refiriendo: se confirma antes.
  const [confirmarReferir, setConfirmarReferir] = useState(false);

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
    setConfirmarReferir(false);
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
      toast.success(refiere ? `Referido a ${nombreMedico}` : llegadaDirecta ? "Paciente en sala de espera" : "Cita programada");
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      void qc.invalidateQueries({ queryKey: ["dashboard", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const soyProfesional = !!yo && (medicos.data ?? []).some((m) => m.usuario_id === yo);
  const refiere = soyProfesional && !!medico && medico !== yo;
  const nombreMedico = medicos.data?.find((m) => m.usuario_id === medico)?.perfil?.nombre_completo ?? "otro profesional";
  const nombrePac = paciente ? `${paciente.nombres} ${paciente.apellidos}`.trim() : "";

  const enviar = () => {
    setIntentado(true);
    if (!paciente || !medico) return;
    if (refiere && !confirmarReferir) {
      setConfirmarReferir(true);
      return;
    }
    guardar.mutate();
  };

  // Solo lo que se agenda con ese médico: las consultas de su especialidad (o, si su
  // especialidad no tiene consultas, sus estudios, como en Sonografía). Nunca análisis
  // de laboratorio ni medicamentos. Sin médico elegido: las consultas por especialidad.
  const especialidad = medicos.data?.find((m) => m.usuario_id === medico)?.especialidad?.trim() || null;
  const opciones = useMemo(() => {
    const activos = (servicios.data ?? []).filter((s) => s.activo && !["laboratorio", "farmacia"].includes(s.categoria));
    const delArea = especialidad ? activos.filter((s) => mismaEspecialidad(s.especialidad, especialidad)) : [];
    const consultasArea = delArea.filter((s) => s.categoria === "consulta");
    if (consultasArea.length) return consultasArea;
    if (delArea.length) return delArea;
    return activos.filter((s) => s.categoria === "consulta" && s.especialidad);
  }, [servicios.data, especialidad]);

  // Al cambiar de médico: si el servicio ya no aplica se quita; si hay una sola consulta, se elige sola.
  useEffect(() => {
    if (servicio && !opciones.some((s) => s.id === servicio)) setServicio("");
    if (!servicio && medico && opciones.length === 1) {
      setServicio(opciones[0].id);
      setDuracion(opciones[0].duracion_min);
    }
  }, [opciones, medico, servicio]);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={llegadaDirecta ? "Llegada sin cita" : "Programar cita"}
      descripcion={llegadaDirecta ? "El paciente pasa directo a la sala de espera." : undefined}
      pie={
        confirmarReferir ? (
          <>
            <Boton variante="secundario" onClick={() => setConfirmarReferir(false)} disabled={guardar.isPending}>
              No, volver
            </Boton>
            <Boton cargando={guardar.isPending} onClick={enviar}>
              Sí, referir
            </Boton>
          </>
        ) : (
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton cargando={guardar.isPending} onClick={enviar}>
              {refiere ? "Referir" : llegadaDirecta ? "Enviar a sala de espera" : "Programar"}
            </Boton>
          </>
        )
      }
    >
      {confirmarReferir ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-marca-suave text-marca">
            <Forward className="size-6" />
          </span>
          <p className="text-[0.9375rem] leading-relaxed">
            ¿Desea referir a <strong className="font-semibold">{nombrePac}</strong> a{" "}
            <strong className="font-semibold">{nombreMedico}</strong>?
          </p>
          <p className="text-xs text-texto-3">
            La cita queda en la agenda de {nombreMedico}
            {llegadaDirecta ? " y el paciente pasa a su sala de espera." : "."}
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        <SelectorPaciente valor={paciente} onChange={setPaciente} error={intentado && !paciente ? "Selecciona un paciente" : undefined} />
        <div className="grid grid-cols-2 gap-4">
          <Selector
            etiqueta="Profesional"
            value={medico}
            onChange={(e) => setMedico(e.target.value)}
            error={intentado && !medico ? "Selecciona un profesional" : undefined}
          >
            <option value="">Seleccionar…</option>
            <OpcionesMedicos medicos={medicos.data ?? []} />
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
            <option value="">Sin especificar</option>
            {especialidad && opciones.every((s) => mismaEspecialidad(s.especialidad, especialidad))
              ? opciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))
              : [...new Set(opciones.map((s) => s.especialidad ?? ""))].sort((a, b) => a.localeCompare(b, "es")).map((esp) => (
                  <optgroup key={esp} label={esp || "Otras"}>
                    {opciones
                      .filter((s) => (s.especialidad ?? "") === esp)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                  </optgroup>
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
      )}
    </Modal>
  );
}

/**
 * Cambios de estado que se pueden deshacer desde el aviso: no tocan dinero, turnos ni
 * la historia clínica (llegar a sala numera el turno; esos no se deshacen así).
 */
const DESHACIBLES: Partial<Record<EstadoCita, EstadoCita[]>> = {
  confirmada: ["programada"],
  cancelada: ["programada", "confirmada"],
  no_asistio: ["programada", "confirmada"],
  completada: ["en_consulta"],
};

/** Cambia el estado de una cita, con los sellos de tiempo que correspondan. */
export function useCambiarEstadoCita() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async ({ id, estado, motivo, deshaciendo }: { id: string; estado: EstadoCita; motivo?: string; deshaciendo?: boolean }) => {
      const cambios: Tablas["citas"]["Update"] = { estado };
      if (deshaciendo) cambios.motivo_cancelacion = null;
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
      let anterior: EstadoCita | undefined;
      previas.forEach(([, d]) => {
        if (Array.isArray(d)) anterior ??= (d as { id: string; estado: EstadoCita }[]).find((c) => c.id === id)?.estado;
      });
      qc.setQueriesData({ queryKey: claves.citas(sistemaId) }, (d: unknown) =>
        Array.isArray(d) ? d.map((c) => (c.id === id ? { ...c, estado, llegada_en: estado === "en_espera" ? new Date().toISOString() : c.llegada_en } : c)) : d,
      );
      return { previas, anterior };
    },
    onSuccess: (_r, { id, estado, deshaciendo }, ctx) => {
      if (deshaciendo) return void toast.success("Cambio deshecho");
      const anterior = ctx?.anterior;
      if (!anterior || !DESHACIBLES[estado]?.includes(anterior)) return;
      toast.success(`Cita: ${ESTADO_CITA[estado].etiqueta.toLowerCase()}`, {
        duration: 6000,
        action: { label: "Deshacer", onClick: () => m.mutate({ id, estado: anterior, deshaciendo: true }) },
      });
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
  return m;
}
