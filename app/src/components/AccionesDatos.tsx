import { FileSpreadsheet, Printer, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { exportarExcel, type Celda } from "@/lib/excel";
import type { DefinicionImportacion } from "@/lib/importaciones";
import { supabase } from "@/lib/supabase";
import { fecha, fechaHora, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { Documento, EncabezadoDocumento, TablaDocumento } from "./Documento";
import { ImportarExcel } from "./ImportarExcel";
import { Boton, Spinner } from "./ui/boton";
import { ItemMenu, Menu, SeparadorMenu } from "./ui/menu";

export interface ColumnaDatos<T> {
  titulo: string;
  valor: (fila: T) => Celda;
  tipo?: "texto" | "moneda" | "numero" | "fecha" | "fechaHora";
  ancho?: number;
  /** Ocultar en la versión impresa (p. ej. columnas muy anchas). */
  soloExcel?: boolean;
}

/** Trae todas las filas de una consulta paginando de a 1000 (límite de PostgREST). */
export async function obtenerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const todas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw error;
    todas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return todas;
}

/**
 * Botones estándar de un listado: importar desde Excel (uno o varios tipos),
 * exportar a Excel e imprimir / exportar a PDF, con las mismas columnas.
 */
export function AccionesDatos<T>({
  titulo,
  columnas,
  obtener,
  importaciones,
  onImportado,
  subtitulo,
  extraImportacion,
}: {
  titulo: string;
  columnas: ColumnaDatos<T>[];
  obtener: () => Promise<T[]>;
  importaciones?: DefinicionImportacion[];
  onImportado?: () => void;
  subtitulo?: ReactNode;
  extraImportacion?: Record<string, unknown>;
}) {
  const { sistema, sistemaId } = useSistema();
  const [cargando, setCargando] = useState<"excel" | "imprimir" | null>(null);
  const [impresion, setImpresion] = useState<T[] | null>(null);
  const [importar, setImportar] = useState<DefinicionImportacion | null>(null);

  const formatear = (c: ColumnaDatos<T>, f: T): string => {
    const v = c.valor(f);
    if (v === null || v === undefined || v === "") return "";
    switch (c.tipo) {
      case "moneda":
        return moneda(Number(v), sistema.moneda);
      case "numero":
        return Number(v).toLocaleString("es-DO");
      case "fecha":
        return fecha(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T00:00:00" : (v as string));
      case "fechaHora":
        return fechaHora(v as string);
      default:
        return typeof v === "boolean" ? (v ? "Sí" : "No") : String(v);
    }
  };

  const aExcel = (c: ColumnaDatos<T>, f: T): Celda => {
    const v = c.valor(f);
    if (v === null || v === undefined) return "";
    if (c.tipo === "moneda" || c.tipo === "numero") return Number(v);
    if (c.tipo === "fechaHora" && typeof v === "string") return new Date(v);
    if (typeof v === "boolean") return v ? "Sí" : "No";
    return v;
  };

  const exportar = async () => {
    setCargando("excel");
    try {
      const filas = await obtener();
      await exportarExcel(`${titulo} - ${sistema.nombre} - ${isoDia()}`, [
        { nombre: titulo, columnas: columnas.map((c) => ({ titulo: c.titulo, valor: (f: T) => aExcel(c, f), ancho: c.ancho })), filas },
      ]);
      void supabase.rpc("registrar_evento", { p_accion: "EXPORTAR", p_sistema: sistemaId, p_detalle: { listado: titulo, filas: filas.length } });
    } catch (e) {
      toast.error((e as Error).message || "No se pudo exportar.");
    } finally {
      setCargando(null);
    }
  };

  const imprimir = async () => {
    setCargando("imprimir");
    try {
      setImpresion(await obtener());
      void supabase.rpc("registrar_evento", { p_accion: "IMPRIMIR", p_sistema: sistemaId, p_detalle: { listado: titulo } });
    } catch (e) {
      toast.error((e as Error).message || "No se pudo preparar el reporte.");
    } finally {
      setCargando(null);
    }
  };

  const impresas = columnas.filter((c) => !c.soloExcel);

  return (
    <>
      <Menu
        alinear="derecha"
        ancho={310}
        disparador={() => (
          <Boton variante="secundario" icono={cargando ? <Spinner /> : <FileSpreadsheet className="size-4" />}>
            Datos
          </Boton>
        )}
      >
        {(cerrar) => (
          <>
            {importaciones?.map((d) => (
              <ItemMenu key={d.id} icono={<Upload />} onClick={() => (setImportar(d), cerrar())}>
                Importar {d.titulo.toLowerCase()}
              </ItemMenu>
            ))}
            {!!importaciones?.length && <SeparadorMenu />}
            <ItemMenu icono={<FileSpreadsheet />} onClick={() => (void exportar(), cerrar())}>
              Exportar a Excel
            </ItemMenu>
            <ItemMenu icono={<Printer />} onClick={() => (void imprimir(), cerrar())}>
              Imprimir / PDF
            </ItemMenu>
          </>
        )}
      </Menu>

      <Documento abierto={!!impresion} onCerrar={() => setImpresion(null)} titulo={titulo} nombreArchivo={`${titulo} - ${sistema.nombre} - ${isoDia()}`}>
        <EncabezadoDocumento titulo={titulo} subtitulo={<>{subtitulo ?? null} {impresion ? `· ${impresion.length.toLocaleString("es-DO")} registros` : ""}</>} />
        <TablaDocumento encabezados={impresas.map((c) => c.titulo)} filas={(impresion ?? []).map((f) => impresas.map((c) => formatear(c, f)))} />
      </Documento>

      {importar && (
        <ImportarExcel
          definicion={importar}
          abierto={!!importar}
          onCerrar={() => setImportar(null)}
          onListo={onImportado}
          extra={extraImportacion}
        />
      )}
    </>
  );
}

