import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { FileImage, FilePlus2, FileText, Lock, NotebookPen, Paperclip, Reply, ShieldAlert, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Esqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { puedeEscribir } from "@/lib/permisos";
import type { Json } from "@/lib/database.types";
import { datos, mensajeError, supabase, type TipoEntradaClinica } from "@/lib/supabase";
import { cn, fechaHora, relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const TIPOS: Record<TipoEntradaClinica, { etiqueta: string; tono: Tono }> = {
  consulta: { etiqueta: "Consulta", tono: "marca" },
  evolucion: { etiqueta: "Evolución", tono: "info" },
  diagnostico: { etiqueta: "Diagnóstico", tono: "violeta" },
  receta: { etiqueta: "Receta", tono: "exito" },
  signos_vitales: { etiqueta: "Signos vitales", tono: "aviso" },
  triaje: { etiqueta: "Triaje", tono: "aviso" },
  laboratorio: { etiqueta: "Laboratorio", tono: "info" },
  imagen: { etiqueta: "Imagen", tono: "info" },
  procedimiento: { etiqueta: "Procedimiento", tono: "violeta" },
  nutricion: { etiqueta: "Nutrición", tono: "exito" },
  anestesia: { etiqueta: "Anestesia", tono: "peligro" },
  psicologia: { etiqueta: "Psicología", tono: "violeta" },
  anexo: { etiqueta: "Anexo", tono: "neutro" },
  adenda: { etiqueta: "Adenda", tono: "neutro" },
};

type Campo = { clave: string; etiqueta: string; placeholder?: string; opciones?: string[]; tipo?: "texto" | "numero" | "fecha" | "area" };

// Campos estructurados de cada tipo (se guardan en historial_clinico.datos).
const CAMPOS: Partial<Record<TipoEntradaClinica, Campo[]>> = {
  signos_vitales: [
    { clave: "pa", etiqueta: "Presión arterial", placeholder: "120/80" },
    { clave: "fc", etiqueta: "Frec. cardíaca (lpm)", placeholder: "72", tipo: "numero" },
    { clave: "fr", etiqueta: "Frec. respiratoria", placeholder: "16", tipo: "numero" },
    { clave: "temp", etiqueta: "Temperatura (°C)", placeholder: "36.5", tipo: "numero" },
    { clave: "sat", etiqueta: "SatO₂ (%)", placeholder: "98", tipo: "numero" },
    { clave: "peso", etiqueta: "Peso (kg)", tipo: "numero" },
    { clave: "talla", etiqueta: "Talla (cm)", tipo: "numero" },
    { clave: "glucosa", etiqueta: "Glucosa (mg/dL)", tipo: "numero" },
  ],
  nutricion: [
    { clave: "peso", etiqueta: "Peso (kg)", tipo: "numero" },
    { clave: "talla", etiqueta: "Talla (cm)", tipo: "numero" },
    { clave: "cintura", etiqueta: "Circ. abdominal (cm)", tipo: "numero" },
    { clave: "grasa", etiqueta: "Grasa corporal (%)", tipo: "numero" },
    { clave: "kcal", etiqueta: "Requerimiento (kcal/día)", tipo: "numero" },
    { clave: "dx_nutricional", etiqueta: "Diagnóstico nutricional", placeholder: "Sobrepeso grado I" },
    { clave: "plan", etiqueta: "Plan alimentario", tipo: "area" },
  ],
  anestesia: [
    { clave: "asa", etiqueta: "Clasificación ASA", opciones: ["I", "II", "III", "IV", "V", "VI", "I-E", "II-E", "III-E", "IV-E", "V-E"] },
    { clave: "tipo_anestesia", etiqueta: "Tipo de anestesia", opciones: ["General", "Regional (raquídea)", "Regional (epidural)", "Bloqueo periférico", "Sedación", "Local"] },
    { clave: "mallampati", etiqueta: "Mallampati", opciones: ["I", "II", "III", "IV"] },
    { clave: "ayuno", etiqueta: "Ayuno (horas)", tipo: "numero" },
    { clave: "via_aerea", etiqueta: "Vía aérea", placeholder: "Tubo orotraqueal 7.5" },
    { clave: "aldrete", etiqueta: "Aldrete al egreso (0–10)", tipo: "numero" },
    { clave: "farmacos", etiqueta: "Fármacos y dosis", tipo: "area" },
    { clave: "eventos", etiqueta: "Eventos / complicaciones", tipo: "area" },
  ],
  psicologia: [
    { clave: "motivo", etiqueta: "Motivo de consulta", tipo: "area" },
    { clave: "estado_mental", etiqueta: "Examen del estado mental", tipo: "area" },
    { clave: "impresion", etiqueta: "Impresión diagnóstica", placeholder: "CIE-10 / DSM-5" },
    { clave: "plan", etiqueta: "Plan terapéutico", tipo: "area" },
    { clave: "proxima_sesion", etiqueta: "Próxima sesión", tipo: "fecha" },
  ],
};
CAMPOS.triaje = CAMPOS.signos_vitales;

const ETIQUETAS_CAMPO = Object.fromEntries(
  Object.values(CAMPOS).flatMap((cs) => cs!.map((c) => [c.clave, c.etiqueta])),
) as Record<string, string>;
ETIQUETAS_CAMPO.imc = "IMC";

interface Archivo {
  ruta: string;
  nombre: string;
  tipo: string;
  tamano: number;
}

interface Entrada_ {
  id: string;
  tipo: TipoEntradaClinica;
  titulo: string | null;
  contenido: string;
  datos: Record<string, unknown>;
  corrige_a: string | null;
  creado_en: string;
  autor: { nombre_completo: string } | null;
}

function imc(peso?: unknown, talla?: unknown) {
  const p = Number(peso);
  const t = Number(talla) / 100;
  if (!p || !t) return null;
  const v = p / (t * t);
  const clase = v < 18.5 ? "Bajo peso" : v < 25 ? "Normal" : v < 30 ? "Sobrepeso" : "Obesidad";
  return { valor: v.toFixed(1), clase };
}

/**
 * Historia clínica append-only: nada se edita ni se borra (lo impide Postgres).
 * Una corrección es una "adenda" enlazada a la entrada original. Las notas de
 * psicología solo las ve psicología (política RLS).
 */
export function HistorialClinico({ pacienteId }: { pacienteId: string }) {
  const { sistemaId, roles } = useSistema();
  const [nueva, setNueva] = useState<{ corrige?: Entrada_ } | null>(null);
  const [filtro, setFiltro] = useState<TipoEntradaClinica | "todos">("todos");

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
  const presentes = useMemo(() => [...new Set(raiz.map((e) => e.tipo))], [raiz]);
  const visibles = raiz.filter((e) => filtro === "todos" || e.tipo === filtro);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {presentes.length > 1 &&
          (["todos", ...presentes] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFiltro(t)}
              className={cn(
                "relative h-7 rounded-full px-3 text-xs font-medium transition-colors",
                filtro === t ? "text-marca-texto" : "text-texto-2 hover:text-texto",
              )}
            >
              {filtro === t && (
                <motion.span layoutId="filtro-historial" className="absolute inset-0 rounded-full bg-marca-suave" transition={{ type: "spring", duration: 0.3, bounce: 0.15 }} />
              )}
              <span className="relative">{t === "todos" ? "Todo" : TIPOS[t].etiqueta}</span>
            </button>
          ))}
        <p className="ml-auto flex items-center gap-1.5 text-xs text-texto-3">
          <Lock className="size-3.5" /> Entradas permanentes; las correcciones se agregan como adendas.
        </p>
        {escribir && (
          <Boton icono={<FilePlus2 className="size-4" />} onClick={() => setNueva({})}>
            Nueva entrada
          </Boton>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Esqueleto key={i} className="h-32 rounded-2xl" />)}</div>
      ) : visibles.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<NotebookPen />} titulo="Historia clínica vacía" descripcion="Consultas, evoluciones, nutrición, anestesia, psicología y anexos aparecerán aquí en orden cronológico." />
        </Tarjeta>
      ) : (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-borde">
          <AnimatePresence initial={false}>
            {visibles.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
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
                  {escribir && (e.tipo !== "psicologia" || puedeEscribir.psicologia(roles)) && (
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

      <NuevaEntrada abierto={!!nueva} corrige={nueva?.corrige} pacienteId={pacienteId} onCerrar={() => setNueva(null)} />
    </>
  );
}

function EntradaVista({ e }: { e: Entrada_ }) {
  const archivos = (e.datos?.archivos as Archivo[] | undefined) ?? [];
  const valores = Object.entries(e.datos ?? {}).filter(([k, v]) => k !== "archivos" && v !== "" && v !== null && v !== undefined);
  const cortos = valores.filter(([k]) => !CAMPOS[e.tipo]?.find((c) => c.clave === k && c.tipo === "area"));
  const largos = valores.filter(([k]) => CAMPOS[e.tipo]?.find((c) => c.clave === k && c.tipo === "area"));
  const indice = e.tipo === "nutricion" || e.tipo === "signos_vitales" || e.tipo === "triaje" ? imc(e.datos.peso, e.datos.talla) : null;

  const abrir = async (a: Archivo) => {
    const { data, error } = await supabase.storage.from("anexos-clinicos").createSignedUrl(a.ruta, 120);
    if (error || !data) return toast.error("No se pudo abrir el archivo.");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={TIPOS[e.tipo].tono}>{TIPOS[e.tipo].etiqueta}</Insignia>
        {e.tipo === "psicologia" && (
          <Insignia tono="peligro">
            <ShieldAlert className="size-3" /> Confidencial
          </Insignia>
        )}
        {e.titulo && <span className="text-sm font-semibold">{e.titulo}</span>}
        <span className="ml-auto text-xs text-texto-3" title={fechaHora(e.creado_en)}>
          {e.autor?.nombre_completo} · {relativo(e.creado_en)}
        </span>
      </div>
      {(cortos.length > 0 || indice) && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cortos.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-superficie-2 px-3 py-2">
              <div className="text-[11px] text-texto-3">{ETIQUETAS_CAMPO[k] ?? k}</div>
              <div className="text-sm font-semibold tabular">{String(v)}</div>
            </div>
          ))}
          {indice && (
            <div className="rounded-lg bg-marca-suave px-3 py-2">
              <div className="text-[11px] text-marca-texto">IMC</div>
              <div className="text-sm font-semibold text-marca-texto tabular">
                {indice.valor} · {indice.clase}
              </div>
            </div>
          )}
        </div>
      )}
      {largos.map(([k, v]) => (
        <div key={k} className="mt-3">
          <p className="text-[11px] font-medium text-texto-3">{ETIQUETAS_CAMPO[k] ?? k}</p>
          <p className="text-sm whitespace-pre-wrap">{String(v)}</p>
        </div>
      ))}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-texto">{e.contenido}</p>
      {archivos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {archivos.map((a) => (
            <button
              key={a.ruta}
              onClick={() => void abrir(a)}
              className="inline-flex items-center gap-2 rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-left text-xs transition-colors hover:border-borde-fuerte"
            >
              {a.tipo.startsWith("image/") ? <FileImage className="size-4 text-texto-3" /> : <FileText className="size-4 text-texto-3" />}
              <span className="max-w-48 truncate font-medium">{a.nombre}</span>
              <span className="text-texto-3">{(a.tamano / 1024 / 1024).toFixed(1)} MB</span>
            </button>
          ))}
        </div>
      )}
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
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoEntradaClinica>("consulta");
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [archivos, setArchivos] = useState<File[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const tipoEfectivo = corrige ? "adenda" : tipo;
  const definicion = CAMPOS[tipoEfectivo] ?? [];
  const indice = imc(campos.peso, campos.talla);
  const tiposDisponibles = (Object.keys(TIPOS) as TipoEntradaClinica[]).filter(
    (k) => k !== "adenda" && (k !== "psicologia" || puedeEscribir.psicologia(roles)),
  );

  const reiniciar = () => {
    setTitulo("");
    setContenido("");
    setCampos({});
    setArchivos([]);
    setProgreso(null);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const subidos: Archivo[] = [];
      for (const [i, f] of archivos.entries()) {
        setProgreso(`Subiendo ${i + 1} de ${archivos.length}…`);
        const ruta = `${sistemaId}/${pacienteId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error } = await supabase.storage.from("anexos-clinicos").upload(ruta, f, { contentType: f.type });
        if (error) throw new Error(`No se pudo subir ${f.name}: ${error.message}`);
        subidos.push({ ruta, nombre: f.name, tipo: f.type, tamano: f.size });
      }
      setProgreso(null);
      const valores = Object.fromEntries(Object.entries(campos).filter(([, v]) => v.trim() !== ""));
      if (indice && tipoEfectivo === "nutricion") valores.imc = indice.valor;
      const texto = contenido.trim() || (subidos.length ? `Anexo: ${subidos.map((s) => s.nombre).join(", ")}` : "");
      const { error } = await supabase.from("historial_clinico").insert({
        sistema_id: sistemaId,
        paciente_id: pacienteId,
        autor_id: u.user!.id,
        tipo: tipoEfectivo,
        titulo: titulo.trim() || null,
        contenido: texto,
        datos: { ...valores, ...(subidos.length ? { archivos: subidos } : {}) } as unknown as Json,
        corrige_a: corrige?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada registrada");
      void qc.invalidateQueries({ queryKey: ["historial", sistemaId, pacienteId] });
      reiniciar();
      onCerrar();
    },
    onError: (e) => {
      setProgreso(null);
      toast.error(mensajeError(e));
    },
  });

  const valido = contenido.trim() || archivos.length > 0 || Object.values(campos).some((v) => v.trim());

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo={corrige ? "Adenda" : "Nueva entrada clínica"}
      descripcion={corrige ? "Se agregará debajo de la entrada original, sin modificarla." : "Quedará firmada con tu nombre y la hora actual."}
      pie={
        <>
          {progreso && <span className="mr-auto text-xs text-texto-3">{progreso}</span>}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            Firmar y guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {!corrige && (
          <div className="grid grid-cols-2 gap-4">
            <Selector
              etiqueta="Tipo"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoEntradaClinica);
                setCampos({});
              }}
            >
              {tiposDisponibles.map((k) => (
                <option key={k} value={k}>
                  {TIPOS[k].etiqueta}
                </option>
              ))}
            </Selector>
            <Entrada etiqueta="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
        )}

        {tipoEfectivo === "psicologia" && (
          <p className="flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,#7a5af8_10%,var(--superficie))] px-3 py-2 text-xs text-[#6941c6] dark:text-[#bdb4fe]">
            <ShieldAlert className="size-4" /> Nota confidencial: solo la verán psicología y tú.
          </p>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {definicion.length > 0 && (
            <motion.div
              key={tipoEfectivo}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="grid grid-cols-4 gap-3"
            >
              {definicion.map((c) =>
                c.opciones ? (
                  <Selector
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    contenedor="col-span-2"
                    value={campos[c.clave] ?? ""}
                    onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {c.opciones.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Selector>
                ) : c.tipo === "area" ? (
                  <AreaTexto
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    contenedor="col-span-4"
                    className="min-h-16"
                    value={campos[c.clave] ?? ""}
                    onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                  />
                ) : (
                  <Entrada
                    key={c.clave}
                    etiqueta={c.etiqueta}
                    placeholder={c.placeholder}
                    type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"}
                    step="any"
                    contenedor={c.placeholder && c.placeholder.length > 12 ? "col-span-2" : undefined}
                    value={campos[c.clave] ?? ""}
                    onChange={(e) => setCampos((s) => ({ ...s, [c.clave]: e.target.value }))}
                  />
                ),
              )}
              {indice && (
                <div className="col-span-4 flex items-center gap-2 rounded-xl bg-marca-suave px-3 py-2 text-sm text-marca-texto">
                  IMC calculado: <b className="tabular">{indice.valor}</b> · {indice.clase}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {(tipoEfectivo === "anexo" || tipoEfectivo === "laboratorio" || tipoEfectivo === "imagen") && (
          <div>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
              onChange={(e) => {
                const nuevos = [...(e.target.files ?? [])].filter((f) => {
                  if (f.size > 20 * 1024 * 1024) toast.error(`${f.name} supera 20 MB`);
                  return f.size <= 20 * 1024 * 1024;
                });
                setArchivos((a) => [...a, ...nuevos]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-borde-fuerte px-4 py-6 text-sm text-texto-2 transition-colors hover:border-marca hover:bg-marca-suave/40"
            >
              <Upload className="size-5 text-texto-3" />
              Adjuntar PDF o imágenes (máx. 20 MB c/u)
            </button>
            <AnimatePresence initial={false}>
              {archivos.map((f, i) => (
                <motion.div
                  key={f.name + i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                    <Paperclip className="size-4 text-texto-3" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-texto-3">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} className="text-texto-3 hover:text-peligro">
                      <X className="size-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <AreaTexto
          etiqueta={corrige ? "Corrección o ampliación" : tipoEfectivo === "psicologia" ? "Notas de la sesión" : "Contenido"}
          className="min-h-32"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={
            tipoEfectivo === "receta"
              ? "Medicamento, dosis, frecuencia y duración…"
              : tipoEfectivo === "anexo"
                ? "Descripción del documento (opcional)"
                : "Hallazgos, evolución, plan…"
          }
        />
      </div>
    </Modal>
  );
}
