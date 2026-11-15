import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SelectorCie10 } from "@/components/SelectorCie10";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Insignia } from "@/components/ui/superficies";
import { claves } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { hora } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";
import { CAMPOS_CHECKOUT, FORMULARIO_POR_CLAVE } from "./catalogoClinico";

/**
 * La consulta que este profesional atiende ahora con el paciente (llamado o en
 * consulta). Las órdenes y el checkout se ligan a ella.
 */
export function useConsultaActiva(pacienteId: string) {
  const { sistemaId, roles } = useSistema();
  const { sesion } = useSesion();
  const yo = sesion?.user.id;
  return useQuery({
    queryKey: ["consulta-activa", sistemaId, pacienteId, yo],
    enabled: !!yo && puedeEscribir.checkout(roles),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("citas")
        .select("id, estado, inicio, atendida_en, turno, medico_id")
        .eq("sistema_id", sistemaId)
        .eq("paciente_id", pacienteId)
        .in("estado", ["llamado", "en_consulta"])
        .or(`medico_id.eq.${yo},medico_id.is.null`)
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

interface EntradaHoy {
  id: string;
  tipo: string;
  titulo: string | null;
  datos: Record<string, unknown> | null;
  creado_en: string;
}

/** Botón "Checkout" del expediente: solo aparece con una consulta en curso. */
export function BotonCheckout({ pacienteId, pacienteNombre }: { pacienteId: string; pacienteNombre: string }) {
  const consulta = useConsultaActiva(pacienteId);
  const [abierto, setAbierto] = useState(false);
  if (!consulta.data) return null;
  return (
    <>
      <Boton icono={<LogOut className="size-3.5" />} onClick={() => setAbierto(true)}>
        Checkout
      </Boton>
      <ModalCheckout abierto={abierto} onCerrar={() => setAbierto(false)} citaId={consulta.data.id} turno={consulta.data.turno} pacienteId={pacienteId} pacienteNombre={pacienteNombre} />
    </>
  );
}

function ModalCheckout({
  abierto,
  onCerrar,
  citaId,
  turno,
  pacienteId,
  pacienteNombre,
}: {
  abierto: boolean;
  onCerrar: () => void;
  citaId: string;
  turno: string | null;
  pacienteId: string;
  pacienteNombre: string;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [nota, setNota] = useState("");
  const [listo, setListo] = useState<{ proxima?: string } | null>(null);

  // Lo que se registró en esta consulta (para revisar antes de cerrar).
  const hoy = useQuery({
    queryKey: ["historial-consulta", sistemaId, citaId],
    enabled: abierto,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      return datos(
        await supabase
          .from("historial_clinico")
          .select("id, tipo, titulo, datos, creado_en")
          .eq("sistema_id", sistemaId)
          .eq("paciente_id", pacienteId)
          .is("corrige_a", null)
          .or(`cita_id.eq.${citaId},creado_en.gte.${inicio.toISOString()}`)
          .order("creado_en"),
      ) as unknown as EntradaHoy[];
    },
  });

  const cerrar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("checkout_consulta", { p_cita: citaId, p_datos: campos, p_nota: nota.trim() || undefined });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Consulta cerrada");
      setListo({ proxima: campos.proxima_cita });
      void qc.invalidateQueries({ queryKey: ["consulta-activa", sistemaId, pacienteId] });
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, pacienteId] });
      void qc.invalidateQueries({ queryKey: claves.citas(sistemaId) });
      void qc.invalidateQueries({ queryKey: ["dashboard", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const salir = () => {
    setCampos({});
    setNota("");
    setListo(null);
    onCerrar();
  };

  const nombreEntrada = (e: EntradaHoy) =>
    e.tipo === "formulario" ? (FORMULARIO_POR_CLAVE[String(e.datos?.formulario ?? "")]?.nombre ?? e.titulo ?? "Formulario") : (e.titulo ?? e.tipo.replace("_", " "));

  return (
    <Modal
      abierto={abierto}
      onCerrar={salir}
      ancho="lg"
      titulo={listo ? "Consulta cerrada" : "Checkout de la consulta"}
      descripcion={listo ? pacienteNombre : `${pacienteNombre}${turno ? ` · turno ${turno}` : ""}. La cita pasa a completada y queda una nota de egreso firmada.`}
      pie={
        listo ? (
          <>
            {listo.proxima && (
              <Boton
                variante="secundario"
                icono={<CalendarPlus className="size-4" />}
                onClick={() => {
                  salir();
                  navegar("/agenda?accion=nueva");
                }}
              >
                Programar la próxima cita
              </Boton>
            )}
            <Boton onClick={salir}>Listo</Boton>
          </>
        ) : (
          <>
            <Boton variante="secundario" onClick={salir}>
              Cancelar
            </Boton>
            <Boton cargando={cerrar.isPending} onClick={() => cerrar.mutate()}>
              Firmar y cerrar consulta
            </Boton>
          </>
        )
      }
    >
      {listo ? (
        <p className="text-sm text-texto-2">
          La consulta quedó completada.
          {listo.proxima && " Sugeriste una próxima cita: puedes programarla ahora."}
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[0.8125rem] font-medium text-texto-2">Registrado en esta consulta</p>
            {(hoy.data?.length ?? 0) === 0 ? (
              <p className="rounded-xl bg-superficie-2 px-3 py-2.5 text-xs text-texto-3">Todavía no hay entradas de hoy. Puedes cerrar igual con la nota de egreso.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {hoy.data!.map((e) => (
                  <li key={e.id}>
                    <Insignia tono="marca">
                      {nombreEntrada(e)} · {hora(e.creado_en)}
                    </Insignia>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS_CHECKOUT.map((c) =>
              c.tipo === "cie10" ? (
                <SelectorCie10 key={c.clave} etiqueta={c.etiqueta} contenedor="sm:col-span-2" valor={campos[c.clave] ?? ""} onChange={(v) => setCampos((s) => ({ ...s, [c.clave]: v }))} />
              ) : c.tipo === "area" ? (
                <AreaTexto
                  key={c.clave}
                  etiqueta={c.etiqueta}
                  contenedor="sm:col-span-2"
                  className="min-h-16"
                  value={campos[c.clave] ?? ""}
                  onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                />
              ) : (
                <Entrada
                  key={c.clave}
                  etiqueta={c.etiqueta}
                  type={c.tipo === "fecha" ? "date" : "text"}
                  value={campos[c.clave] ?? ""}
                  onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                />
              ),
            )}
          </div>
          <AreaTexto etiqueta="Nota de egreso (opcional)" className="min-h-20" placeholder="Paciente estable, se retira por sus propios medios…" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}
