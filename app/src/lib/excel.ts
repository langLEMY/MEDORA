/**
 * Lectura y escritura de Excel (SheetJS, cargado bajo demanda para no pesar en
 * el arranque). Acepta .xlsx, .xls y .csv.
 *
 * Las columnas se reconocen por sinónimos sin importar mayúsculas, tildes ni
 * espacios ("Cédula", "cedula", "No. Identificación"…), igual que el importador
 * de FUNBIDE, para poder cargar archivos de sistemas anteriores sin retocarlos.
 */
type XLSX = typeof import("xlsx");
let xlsx: Promise<XLSX> | null = null;
const cargar = () => (xlsx ??= import("xlsx"));

export type Celda = string | number | boolean | Date | null | undefined;

export interface ColumnaExport<T> {
  titulo: string;
  valor: (fila: T) => Celda;
  ancho?: number;
}

export interface HojaExport<T> {
  nombre: string;
  columnas: ColumnaExport<T>[];
  filas: T[];
}

/** Descarga un .xlsx con una o varias hojas. */
export async function exportarExcel<T>(nombreArchivo: string, hojas: HojaExport<T>[]) {
  const X = await cargar();
  const libro = X.utils.book_new();
  for (const h of hojas) {
    const datos = [h.columnas.map((c) => c.titulo), ...h.filas.map((f) => h.columnas.map((c) => normalizarSalida(c.valor(f))))];
    const hoja = X.utils.aoa_to_sheet(datos, { cellDates: true, dateNF: "dd/mm/yyyy" });
    hoja["!cols"] = h.columnas.map((c, i) => ({
      wch: c.ancho ?? Math.min(48, Math.max(c.titulo.length + 2, ...datos.slice(1, 200).map((r) => String(r[i] ?? "").length + 1))),
    }));
    if (h.filas.length) hoja["!autofilter"] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: h.filas.length, c: h.columnas.length - 1 } }) };
    X.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"));
  }
  X.writeFile(libro, `${nombreArchivo.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`, { compression: true });
}

function normalizarSalida(v: Celda): Celda {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00");
  return v;
}

/** Normaliza un encabezado: minúsculas, sin tildes, solo letras y números. */
export const normalizarClave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export interface HojaLeida {
  encabezados: string[];
  filas: { _fila: number; valores: Record<string, unknown> }[];
}

/** Lee la primera hoja con datos. La primera fila no vacía se toma como encabezado. */
export async function leerExcel(archivo: File): Promise<HojaLeida> {
  const X = await cargar();
  const libro = X.read(await archivo.arrayBuffer(), { cellDates: true, dense: true });
  const nombre = libro.SheetNames.find((n) => (X.utils.sheet_to_json(libro.Sheets[n], { header: 1 }) as unknown[][]).length > 0) ?? libro.SheetNames[0];
  const matriz = X.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: null, raw: true }) as unknown[][];
  const inicio = matriz.findIndex((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  if (inicio < 0) return { encabezados: [], filas: [] };
  const encabezados = matriz[inicio].map((c) => String(c ?? "").trim());
  const filas = matriz
    .slice(inicio + 1)
    .map((r, i) => ({ _fila: inicio + i + 2, valores: Object.fromEntries(encabezados.map((h, j) => [h, r[j]])) }))
    .filter((f) => Object.values(f.valores).some((v) => v !== null && String(v).trim() !== ""));
  return { encabezados, filas };
}

// ---------------------------------------------------------------------------
// Conversión de valores
// ---------------------------------------------------------------------------
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

function fechaIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const p = (n: number) => String(n).padStart(2, "0");
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  if (typeof v === "number" && v > 1000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${p(+m[2])}-${p(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? (+m[3] > 30 ? 1900 : 2000) + +m[3] : +m[3];
    return `${anio}-${p(+m[2])}-${p(+m[1])}`; // formato dominicano: día/mes/año
  }
  return null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/RD\$|US\$|\$|\s/g, "");
  // "1.234,56" (coma decimal) vs "1,234.56" (punto decimal)
  const n = /,\d{1,2}$/.test(s) && s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : /^\d+,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const r = Number(n);
  return isNaN(r) ? null : r;
}

const mapa = (opciones: Record<string, string[]>) => (v: unknown) => {
  const k = normalizarClave(String(v ?? ""));
  if (!k) return null;
  for (const [valor, sinonimos] of Object.entries(opciones)) if (sinonimos.some((s) => normalizarClave(s) === k || k.startsWith(normalizarClave(s)))) return valor;
  return undefined; // no reconocido
};

export const CONVERSORES = {
  texto,
  fecha: fechaIso,
  numero,
  booleano: (v: unknown) => {
    const k = normalizarClave(String(v ?? ""));
    if (!k) return null;
    return ["si", "s", "true", "1", "x", "yes"].includes(k) ? true : ["no", "n", "false", "0"].includes(k) ? false : null;
  },
  sexo: mapa({ F: ["f", "femenino", "mujer"], M: ["m", "masculino", "hombre"], X: ["x", "otro"] }),
  sangre: (v: unknown) => {
    const s = String(v ?? "").toUpperCase().replace(/\s|POSITIVO/g, "+").replace(/NEGATIVO/g, "-").replace(/0/g, "O");
    return ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(s) ? s : s ? undefined : null;
  },
  documentoTipo: mapa({ cedula: ["cedula", "cédula", "ced"], pasaporte: ["pasaporte", "passport"], menor: ["menor"], otro: ["otro"] }),
  categoriaInventario: (v: unknown) =>
    mapa({
      medicamento: ["medicamento", "medicina", "farmaco", "fármaco"],
      insumo: ["insumo", "material", "suministro", "desechable"],
      reactivo: ["reactivo", "laboratorio"],
      equipo: ["equipo", "instrumental"],
      otro: ["otro"],
    })(v) ?? (v ? "otro" : null),
  categoriaServicio: (v: unknown) =>
    mapa({
      consulta: ["consulta"],
      procedimiento: ["procedimiento", "cirugia"],
      laboratorio: ["laboratorio", "analisis", "lab"],
      imagen: ["imagen", "imagenes", "radiologia", "sonografia", "rayos"],
      emergencia: ["emergencia"],
      hospitalizacion: ["hospitalizacion", "internamiento"],
      farmacia: ["farmacia"],
      otro: ["otro"],
    })(v) ?? (v ? "otro" : null),
  tipoMovimiento: mapa({ entrada: ["entrada", "ingreso", "compra", "e"], salida: ["salida", "egreso", "consumo", "despacho", "s"], ajuste: ["ajuste", "conteo", "a"] }),
  frecuencia: mapa({ mensual: ["mensual", "mes"], quincenal: ["quincenal", "quincena"] }),
};

export type Conversor = keyof typeof CONVERSORES;
