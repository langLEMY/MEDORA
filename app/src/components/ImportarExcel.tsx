import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { exportarExcel, leerExcel } from "@/lib/excel";
import { detectarColumnas, prepararFilas, type CampoImportacion, type DefinicionImportacion, type FilaPreparada } from "@/lib/importaciones";
import { invocar, mensajeError, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Boton, Spinner } from "./ui/boton";
import { Modal } from "./ui/modal";
import { Insignia } from "./ui/superficies";

interface Resultado {
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: string[];
  credenciales?: { nombre: string; email: string; password: string | null; estado: string }[];
}

type Paso = "archivo" | "revision" | "importando" | "resultado";

/**
 * Asistente de importación desde Excel. Lee el archivo en la PC, reconoce las
 * columnas por sinónimos, muestra una vista previa y envía las filas por lotes
 * a la RPC correspondiente (que valida permisos y reconcilia duplicados).
 */
export function ImportarExcel({
  definicion: def,
  abierto,
  onCerrar,
  onListo,
  extra,
}: {
  definicion: DefinicionImportacion;
  abierto: boolean;
  onCerrar: () => void;
  onListo?: () => void;
  /** Parámetros adicionales para la RPC (p. ej. p_aseguradora). */
  extra?: Record<string, unknown>;
}) {
  const { sistema, sistemaId } = useSistema();
  const input = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>("archivo");
  const [archivo, setArchivo] = useState<string>("");
  const [columnas, setColumnas] = useState<Map<string, CampoImportacion>>(new Map());
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaPreparada[]>([]);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const reiniciar = () => {
    setPaso("archivo");
    setArchivo("");
    setFilas([]);
    setResultado(null);
    setProgreso(0);
  };

  const cerrar = () => {
    if (paso === "importando") return;
    onCerrar();
    setTimeout(reiniciar, 250);
  };

  const cargarArchivo = async (f: File) => {
    setLeyendo(true);
    try {
      const hoja = await leerExcel(f);
      if (!hoja.filas.length) throw new Error("El archivo no tiene filas con datos.");
      const cols = detectarColumnas(def, hoja.encabezados);
      if (!cols.size) throw new Error("No se reconoció ninguna columna. Descarga la plantilla para ver los encabezados esperados.");
      setArchivo(f.name);
      setColumnas(cols);
      setIgnoradas(hoja.encabezados.filter((h) => h && !cols.has(h)));
      setFilas(prepararFilas(def, hoja.filas, cols));
      setPaso("revision");
    } catch (e) {
      toast.error((e as Error).message || "No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  };

  const plantilla = () =>
    exportarExcel(`Plantilla ${def.titulo}`, [
      {
        nombre: def.titulo,
        columnas: def.campos.map((c) => ({ titulo: c.titulo + (c.requerido ? " *" : ""), valor: () => c.ejemplo ?? "" })),
        filas: [{}],
      },
    ]);

  const validas = filas.filter((f) => !f.avisos.some((a) => a.startsWith("Falta ")));
  const conFalta = filas.length - validas.length;

  const importar = async () => {
    setPaso("importando");
    setProgreso(0);
    const total: Resultado = { creados: 0, actualizados: 0, omitidos: conFalta, errores: [], credenciales: [] };
    filas
      .filter((f) => f.avisos.some((a) => a.startsWith("Falta ")))
      .forEach((f) => total.errores.push(`Fila ${f._fila}: ${f.avisos.filter((a) => a.startsWith("Falta ")).join(", ")}.`));
    const lote = def.tamanoLote ?? 250;
    try {
      for (let i = 0; i < validas.length; i += lote) {
        const parte = validas.slice(i, i + lote).map((f) => ({ _fila: f._fila, ...f.datos }));
        if (def.destino.startsWith("edge:")) {
          const r = await invocar<{ resultados: { fila: number; email: string; nombre: string; error?: string; password_temporal?: string | null; ya_existia?: boolean }[] }>(
            def.destino.slice(5),
            { accion: "importar", sistema_id: sistemaId, filas: parte },
          );
          r.resultados.forEach((x) => {
            if (x.error) {
              total.omitidos++;
              total.errores.push(`Fila ${x.fila} (${x.email}): ${x.error}`);
            } else {
              if (x.ya_existia) total.actualizados++;
              else total.creados++;
              total.credenciales!.push({
                nombre: x.nombre,
                email: x.email,
                password: x.password_temporal ?? null,
                estado: x.ya_existia ? "Ya tenía cuenta: se le dio acceso" : "Cuenta creada",
              });
            }
          });
        } else {
          const { data, error } = await supabase.rpc(def.destino as never, { p_sistema: sistemaId, p_filas: parte, ...extra } as never);
          if (error) throw error;
          const r = data as unknown as Resultado;
          total.creados += r.creados;
          total.actualizados += r.actualizados;
          total.omitidos += r.omitidos;
          total.errores.push(...r.errores);
        }
        setProgreso(Math.min(100, Math.round(((i + lote) / validas.length) * 100)));
      }
      setResultado(total);
      setPaso("resultado");
      onListo?.();
    } catch (e) {
      toast.error(mensajeError(e));
      setResultado(total);
      setPaso("resultado");
      onListo?.();
    }
  };

  const descargarErrores = () =>
    exportarExcel(`Errores importación ${def.titulo}`, [{ nombre: "Errores", columnas: [{ titulo: "Detalle", valor: (x: string) => x, ancho: 100 }], filas: resultado?.errores ?? [] }]);

  const descargarCredenciales = () =>
    exportarExcel(`Credenciales MEDORA ${sistema.nombre}`, [
      {
        nombre: "Credenciales",
        columnas: [
          { titulo: "Nombre", valor: (x: NonNullable<Resultado["credenciales"]>[number]) => x.nombre },
          { titulo: "Usuario (correo)", valor: (x) => x.email },
          { titulo: "Contraseña temporal", valor: (x) => x.password ?? "(usa su contraseña actual)" },
          { titulo: "Estado", valor: (x) => x.estado },
        ],
        filas: resultado?.credenciales ?? [],
      },
    ]);

  const muestra = filas.slice(0, 8);
  // Campos detectados más los derivados (p. ej. apellidos a partir de "Nombre completo").
  const camposMostrados = def.campos.map((c) => c.clave).filter((k) => [...columnas.values()].some((c) => c.clave === k) || filas.some((f) => f.datos[k]));

  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      ancho="xl"
      titulo={`Importar ${def.titulo.toLowerCase()} desde Excel`}
      descripcion={def.descripcion}
      pie={
        paso === "revision" ? (
          <>
            <Boton variante="fantasma" className="mr-auto" icono={<RotateCcw className="size-4" />} onClick={reiniciar}>
              Otro archivo
            </Boton>
            <Boton variante="secundario" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton icono={<Upload className="size-4" />} disabled={!validas.length} onClick={() => void importar()}>
              Importar {validas.length.toLocaleString("es-DO")} filas
            </Boton>
          </>
        ) : paso === "resultado" ? (
          <>
            {!!resultado?.credenciales?.length && (
              <Boton variante="secundario" className="mr-auto" icono={<Download className="size-4" />} onClick={() => void descargarCredenciales()}>
                Descargar credenciales
              </Boton>
            )}
            <Boton onClick={cerrar}>Listo</Boton>
          </>
        ) : paso === "archivo" ? (
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={paso}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          {paso === "archivo" && (
            <div className="space-y-4">
              <input
                ref={input}
                type="file"
                hidden
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void cargarArchivo(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastrando(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void cargarArchivo(f);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                  arrastrando ? "border-marca bg-marca-suave" : "border-borde-fuerte hover:border-marca hover:bg-marca-suave/40",
                )}
              >
                {leyendo ? <Spinner className="size-6 text-marca" /> : <FileSpreadsheet className="size-8 text-marca" />}
                <span className="text-sm font-medium">{leyendo ? "Leyendo archivo…" : "Arrastra aquí tu Excel o haz clic para elegirlo"}</span>
                <span className="text-xs text-texto-3">.xlsx, .xls o .csv · la primera fila debe tener los encabezados</span>
              </button>
              <div className="flex items-start justify-between gap-4 rounded-xl bg-superficie-2 p-4">
                <div className="text-sm">
                  <p className="font-medium">Columnas que se reconocen</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {def.campos.map((c) => (
                      <Insignia key={c.clave} tono={c.requerido ? "marca" : "neutro"}>
                        {c.titulo}
                        {c.requerido ? " *" : ""}
                      </Insignia>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-texto-3">Se aceptan variantes (con o sin tildes, "Cédula"/"Identificación", "Nombre completo"…). * obligatorio.</p>
                </div>
                <Boton variante="secundario" tamano="sm" icono={<Download className="size-3.5" />} onClick={() => void plantilla()}>
                  Plantilla
                </Boton>
              </div>
            </div>
          )}

          {paso === "revision" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <FileSpreadsheet className="size-4 text-marca" />
                <span className="font-medium">{archivo}</span>
                <Insignia tono="exito">{validas.length} listas</Insignia>
                {conFalta > 0 && <Insignia tono="peligro">{conFalta} con datos obligatorios faltantes</Insignia>}
              </div>
              <div className="rounded-xl bg-superficie-2 p-3 text-xs">
                <p className="mb-2 font-medium text-texto-2">Columnas del archivo</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...columnas.entries()].map(([h, c]) => (
                    <Insignia key={h} tono="exito">
                      {h} → {c.titulo}
                    </Insignia>
                  ))}
                  {ignoradas.map((h) => (
                    <Insignia key={h}>{h} (se ignora)</Insignia>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-borde">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-borde bg-superficie-2/60 text-left text-texto-3">
                      <th className="px-3 py-2 font-medium">Fila</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      {camposMostrados.map((k) => (
                        <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">
                          {def.campos.find((c) => c.clave === k)?.titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {muestra.map((f) => (
                      <tr key={f._fila} className="border-b border-borde/60 last:border-0">
                        <td className="px-3 py-1.5 text-texto-3 tabular">{f._fila}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {f.avisos.length > 0 ? (
                            <span
                              className={cn("inline-flex items-center gap-1", f.avisos.some((a) => a.startsWith("Falta ")) ? "text-peligro" : "text-aviso")}
                              title={f.avisos.join("\n")}
                            >
                              <AlertTriangle className="size-3.5" /> {f.avisos[0]}
                            </span>
                          ) : (
                            <CheckCircle2 className="size-3.5 text-exito" />
                          )}
                        </td>
                        {camposMostrados.map((k) => (
                          <td key={k} className="max-w-48 truncate px-3 py-1.5">
                            {Array.isArray(f.datos[k]) ? (f.datos[k] as string[]).join(", ") : String(f.datos[k] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filas.length > muestra.length && <p className="text-xs text-texto-3">…y {filas.length - muestra.length} filas más.</p>}
            </div>
          )}

          {paso === "importando" && (
            <div className="py-12 text-center">
              <p className="mb-4 text-sm font-medium">Importando {validas.length.toLocaleString("es-DO")} filas…</p>
              <div className="mx-auto h-2 max-w-md overflow-hidden rounded-full bg-superficie-2">
                <motion.div className="h-full rounded-full bg-marca" animate={{ width: `${progreso}%` }} transition={{ type: "spring", duration: 0.5, bounce: 0 }} />
              </div>
              <p className="mt-2 text-xs text-texto-3 tabular">{progreso}%</p>
            </div>
          )}

          {paso === "resultado" && resultado && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["Creados", resultado.creados, "text-exito"],
                    ["Actualizados", resultado.actualizados, "text-marca-texto"],
                    ["Omitidos", resultado.omitidos, resultado.omitidos ? "text-aviso" : "text-texto-3"],
                  ] as const
                ).map(([k, v, color], i) => (
                  <motion.div
                    key={k}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="rounded-xl bg-superficie-2 p-4 text-center"
                  >
                    <p className={cn("text-2xl font-semibold tabular", color)}>{v.toLocaleString("es-DO")}</p>
                    <p className="text-xs text-texto-3">{k}</p>
                  </motion.div>
                ))}
              </div>
              {resultado.errores.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-exito">
                  <CheckCircle2 className="size-4" /> Importación completa sin observaciones.
                </p>
              ) : (
                <div className="rounded-xl border border-borde">
                  <div className="flex items-center justify-between border-b border-borde px-4 py-2">
                    <p className="text-sm font-medium">Observaciones ({resultado.errores.length})</p>
                    <Boton variante="fantasma" tamano="sm" icono={<Download className="size-3.5" />} onClick={() => void descargarErrores()}>
                      Descargar
                    </Boton>
                  </div>
                  <ul className="max-h-56 space-y-1 overflow-y-auto p-3 text-xs text-texto-2">
                    {resultado.errores.slice(0, 100).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!resultado.credenciales?.some((c) => c.password) && (
                <p className="rounded-xl bg-[color-mix(in_oklab,var(--aviso)_10%,var(--superficie))] px-4 py-3 text-sm text-aviso">
                  Descarga las credenciales ahora: las contraseñas temporales no se volverán a mostrar.
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
