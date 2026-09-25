import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { FilePlus2, Lock, NotebookPen, Reply } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Esqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { puedeEscribir } from "@/lib/permisos";
import { datos, mensajeError, supabase, type TipoEntradaClinica } from "@/lib/supabase";
import { fechaHora, relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const TIPOS: Record<TipoEntradaClinica, { etiqueta: string; tono: Tono }> = {
  consulta: { etiqueta: "Consulta", tono: "marca" },
  evolucion: { etiqueta: "Evolución", tono: "info" },
  diagnostico: { etiqueta: "Diagnóstico", tono: "violeta" },
  receta: { etiqueta: "Receta", tono: "exito" },
  signos_vitales: { etiqueta: "Signos vitales", tono: "aviso" },
  laboratorio: { etiqueta: "Laboratorio", tono: "info" },
  imagen: { etiqueta: "Imagen", tono: "info" },
  procedimiento: { etiqueta: "Procedimiento", tono: "violeta" },
  triaje: { etiqueta: "Triaje", tono: "aviso" },
  adenda: { etiqueta: "Adenda", tono: "neutro" },
};

const SIGNOS = [
  ["pa", "Presión arterial", "120/80"],
  ["fc", "Frec. cardíaca (lpm)", "72"],
  ["fr", "Frec. respiratoria", "16"],
  ["temp", "Temperatura (°C)", "36.5"],
  ["sat", "SatO₂ (%)", "98"],
  ["peso", "Peso (kg)", ""],
  ["talla", "Talla (cm)", ""],
  ["glucosa", "Glucosa (mg/dL)", ""],
] as const;

interface Entrada_ {
  id: string;
  tipo: TipoEntradaClinica;
  titulo: string | null;
  contenido: string;
  datos: Record<string, string>;
  corrige_a: string | null;
  creado_en: string;
  autor: { nombre_completo: string } | null;
}

/**
 * Historia clínica append-only: nada se edita ni se borra (lo impide Postgres).
 * Una corrección es una "adenda" enlazada a la entrada original.
 */
export function HistorialClinico({ pacienteId }: { pacienteId: string }) {
  const { sistemaId, roles } = useSistema();
  const [nueva, setNueva] = useState<{ corrige?: Entrada_ } | null>(null);

  const q = useQuery({
    queryKey: ["historial", sistemaId, pacienteId],
    queryFn: async () =>
      datos(
        await supabase
          .from("historial_clinico")
          .select("id, tipo, titulo, contenido, datos, corrige_a, creado_en, autor:perfiles!historial_autor_perfil_fk(nombre_completo)")
          .eq("paciente_id", pacienteId)
          .order("creado_en", { ascending: false }),
      ) as unknown as Entrada_[],
  });

  const escribir = puedeEscribir.historial(roles);
  const adendas = (id: string) => q.data?.filter((e) => e.corrige_a === id) ?? [];
  const raiz = q.data?.filter((e) => !e.corrige_a) ?? [];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-texto-3">
          <Lock className="size-3.5" /> Las entradas son permanentes; las correcciones se agregan como adendas.
        </p>
        {escribir && (
          <Boton icono={<FilePlus2 className="size-4" />} onClick={() => setNueva({})}>
            Nueva entrada
          </Boton>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Esqueleto key={i} className="h-32 rounded-2xl" />)}</div>
      ) : raiz.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<NotebookPen />} titulo="Historia clínica vacía" descripcion="Las consultas, diagnósticos y signos vitales aparecerán aquí en orden cronológico." />
        </Tarjeta>
      ) : (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-borde">
          <AnimatePresence initial={false}>
            {raiz.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
                className="relative pl-11"
              >
                <span className="absolute top-4 left-2 size-[15px] rounded-full border-[3px] border-superficie bg-marca shadow-sm" />
                <Tarjeta className="p-5">
                  <EntradaVista e={e} />
                  {adendas(e.id).map((a) => (
                    <div key={a.id} className="mt-4 rounded-xl border border-dashed border-borde-fuerte bg-superficie-2/50 p-4">
                      <EntradaVista e={a} />
                    </div>
                  ))}
                  {escribir && (
                    <button
                      onClick={() => setNueva({ corrige: e })}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-texto-3 transition-colors hover:text-texto"
                    >
                      <Reply className="size-3.5" /> Agregar adenda
                    </button>
                  )}
                </Tarjeta>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      <NuevaEntrada
        abierto={!!nueva}
        corrige={nueva?.corrige}
        pacienteId={pacienteId}
        onCerrar={() => setNueva(null)}
      />
    </>
  );
}

function EntradaVista({ e }: { e: Entrada_ }) {
  const signos = Object.entries(e.datos ?? {}).filter(([, v]) => v);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={TIPOS[e.tipo].tono}>{TIPOS[e.tipo].etiqueta}</Insignia>
        {e.titulo && <span className="text-sm font-semibold">{e.titulo}</span>}
        <span className="ml-auto text-xs text-texto-3" title={fechaHora(e.creado_en)}>
          {e.autor?.nombre_completo} · {relativo(e.creado_en)}
        </span>
      </div>
      {signos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {signos.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-superficie-2 px-3 py-2">
              <div className="text-[11px] text-texto-3">{SIGNOS.find((s) => s[0] === k)?.[1] ?? k}</div>
              <div className="text-sm font-semibold tabular">{v}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-texto">{e.contenido}</p>
    </>
  );
}

function NuevaEntrada({
  abierto,
  corrige,
  pacienteId,
  onCerrar,
}: {
  abierto: boolean;
  corrige?: Entrada_;
  pacienteId: string;
  onCerrar: () => void;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoEntradaClinica>("consulta");
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [signos, setSignos] = useState<Record<string, string>>({});

  const tipoEfectivo = corrige ? "adenda" : tipo;

  const guardar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("historial_clinico").insert({
        sistema_id: sistemaId,
        paciente_id: pacienteId,
        autor_id: u.user!.id,
        tipo: tipoEfectivo,
        titulo: titulo.trim() || null,
        contenido: contenido.trim(),
        datos: tipoEfectivo === "signos_vitales" || tipoEfectivo === "triaje" ? signos : {},
        corrige_a: corrige?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada registrada");
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, pacienteId] });
      setTitulo("");
      setContenido("");
      setSignos({});
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo={corrige ? "Adenda" : "Nueva entrada clínica"}
      descripcion={corrige ? "Se agregará debajo de la entrada original, sin modificarla." : "Quedará firmada con tu nombre y la hora actual."}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!contenido.trim()} onClick={() => guardar.mutate()}>
            Firmar y guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {!corrige && (
          <div className="grid grid-cols-2 gap-4">
            <Selector etiqueta="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEntradaClinica)}>
              {Object.entries(TIPOS)
                .filter(([k]) => k !== "adenda")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.etiqueta}
                  </option>
                ))}
            </Selector>
            <Entrada etiqueta="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
        )}
        <AnimatePresence initial={false}>
          {(tipoEfectivo === "signos_vitales" || tipoEfectivo === "triaje") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-4 gap-3 pb-1">
                {SIGNOS.map(([k, etiqueta, ph]) => (
                  <Entrada
                    key={k}
                    etiqueta={etiqueta}
                    placeholder={ph}
                    value={signos[k] ?? ""}
                    onChange={(e) => setSignos((s) => ({ ...s, [k]: e.target.value }))}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AreaTexto
          etiqueta={corrige ? "Corrección o ampliación" : "Contenido"}
          className="min-h-44"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={tipoEfectivo === "receta" ? "Medicamento, dosis, frecuencia y duración…" : "Motivo, hallazgos, plan…"}
        />
      </div>
    </Modal>
  );
}
