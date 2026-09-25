import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { Entrada, Selector } from "@/components/ui/campos";
import { Avatar, EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { datos, supabase } from "@/lib/supabase";
import { cn, fechaHora, isoDia } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

const POR_PAGINA = 50;

const ACCIONES: Record<string, { etiqueta: string; tono: Tono }> = {
  INSERT: { etiqueta: "Creó", tono: "exito" },
  UPDATE: { etiqueta: "Modificó", tono: "info" },
  DELETE: { etiqueta: "Eliminó", tono: "peligro" },
  LOGIN: { etiqueta: "Inició sesión", tono: "neutro" },
  LOGOUT: { etiqueta: "Cerró sesión", tono: "neutro" },
  CAMBIO_SISTEMA: { etiqueta: "Cambió de sistema", tono: "neutro" },
  CAMBIO_PASSWORD: { etiqueta: "Cambió su contraseña", tono: "aviso" },
  EXPORTAR: { etiqueta: "Exportó", tono: "violeta" },
  IMPRIMIR: { etiqueta: "Imprimió", tono: "neutro" },
};

const TABLAS: Record<string, string> = {
  pacientes: "Paciente",
  citas: "Cita",
  historial_clinico: "Historia clínica",
  cobros: "Cobro",
  anulaciones_cobro: "Anulación",
  movimientos_financieros: "Movimiento financiero",
  turnos_caja: "Turno de caja",
  inventario_items: "Artículo de inventario",
  movimientos_inventario: "Movimiento de inventario",
  membresias: "Membresía",
  perfiles: "Perfil",
  sistemas: "Sistema",
  sedes: "Sede",
  servicios: "Servicio",
  aseguradoras: "Aseguradora",
  coberturas: "Cobertura",
};

interface Registro {
  id: number;
  usuario_id: string | null;
  accion: string;
  tabla: string | null;
  registro_id: string | null;
  cambios: Record<string, unknown> | null;
  creado_en: string;
}

export default function Auditoria() {
  const { sistemaId } = useSistema();
  const hace7 = new Date();
  hace7.setDate(hace7.getDate() - 7);
  const [desde, setDesde] = useState(isoDia(hace7));
  const [hasta, setHasta] = useState(isoDia());
  const [accion, setAccion] = useState("");
  const [tabla, setTabla] = useState("");
  const [usuario, setUsuario] = useState("");
  const [pagina, setPagina] = useState(0);
  const [abierto, setAbierto] = useState<number | null>(null);

  const perfiles = useQuery({
    queryKey: ["perfiles-visibles"],
    queryFn: async () => datos(await supabase.from("perfiles").select("id, nombre_completo, email")),
  });
  const nombres = useMemo(() => new Map(perfiles.data?.map((p) => [p.id, p.nombre_completo || p.email])), [perfiles.data]);

  const q = useQuery({
    queryKey: ["auditoria", sistemaId, desde, hasta, accion, tabla, usuario, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const fin = new Date(hasta + "T00:00:00");
      fin.setDate(fin.getDate() + 1);
      let c = supabase
        .from("auditoria")
        .select("id, usuario_id, accion, tabla, registro_id, cambios, creado_en", { count: "estimated" })
        .eq("sistema_id", sistemaId)
        .gte("creado_en", new Date(desde + "T00:00:00").toISOString())
        .lt("creado_en", fin.toISOString())
        .order("id", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (accion) c = c.eq("accion", accion);
      if (tabla) c = c.eq("tabla", tabla);
      if (usuario) c = c.eq("usuario_id", usuario);
      const { data, error, count } = await c;
      if (error) throw error;
      return { filas: data as Registro[], total: count ?? 0 };
    },
  });

  const exportar = () => {
    const filas = q.data?.filas ?? [];
    const csv = [
      ["fecha", "usuario", "accion", "tabla", "registro", "cambios"].join(","),
      ...filas.map((r) =>
        [r.creado_en, nombres.get(r.usuario_id ?? "") ?? "", r.accion, r.tabla ?? "", r.registro_id ?? "", JSON.stringify(r.cambios ?? {})]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `auditoria-${desde}-${hasta}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    void supabase.rpc("registrar_evento", { p_accion: "EXPORTAR", p_sistema: sistemaId, p_detalle: { modulo: "auditoria", desde, hasta } });
  };

  const paginas = Math.max(1, Math.ceil((q.data?.total ?? 0) / POR_PAGINA));

  return (
    <>
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Bitácora inalterable de cada cambio. Ni la administración puede editarla o borrarla."
        acciones={
          <Boton variante="secundario" icono={<Download className="size-4" />} onClick={exportar} disabled={!q.data?.filas.length}>
            Exportar CSV
          </Boton>
        }
      />

      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-3">
          <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => (setDesde(e.target.value), setPagina(0))} contenedor="w-40" />
          <Entrada etiqueta="Hasta" type="date" value={hasta} onChange={(e) => (setHasta(e.target.value), setPagina(0))} contenedor="w-40" />
          <Selector etiqueta="Acción" value={accion} onChange={(e) => (setAccion(e.target.value), setPagina(0))} contenedor="w-44">
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.etiqueta}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Módulo" value={tabla} onChange={(e) => (setTabla(e.target.value), setPagina(0))} contenedor="w-52">
            <option value="">Todos</option>
            {Object.entries(TABLAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Persona" value={usuario} onChange={(e) => (setUsuario(e.target.value), setPagina(0))} contenedor="w-52">
            <option value="">Todas</option>
            {perfiles.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_completo || p.email}
              </option>
            ))}
          </Selector>
        </div>

        {q.isLoading ? (
          <FilasEsqueleto />
        ) : (q.data?.filas.length ?? 0) === 0 ? (
          <Vacio icono={<ScrollText />} titulo="Sin registros en este rango" />
        ) : (
          <ul className={cn("divide-y divide-borde transition-opacity", q.isPlaceholderData && "opacity-60")}>
            {q.data!.filas.map((r) => {
              const a = ACCIONES[r.accion] ?? { etiqueta: r.accion, tono: "neutro" as Tono };
              const expandido = abierto === r.id;
              const tieneDetalle = !!r.cambios && Object.keys(r.cambios).length > 0;
              return (
                <li key={r.id}>
                  <button
                    disabled={!tieneDetalle}
                    onClick={() => setAbierto(expandido ? null : r.id)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition-colors enabled:hover:bg-superficie-2/60"
                  >
                    <Avatar nombre={nombres.get(r.usuario_id ?? "") ?? "Sistema"} tamano={28} />
                    <span className="w-44 truncate font-medium">{nombres.get(r.usuario_id ?? "") ?? "Sistema"}</span>
                    <Insignia tono={a.tono}>{a.etiqueta}</Insignia>
                    <span className="min-w-0 flex-1 truncate text-texto-2">{r.tabla ? (TABLAS[r.tabla] ?? r.tabla) : ""}</span>
                    <span className="text-xs text-texto-3 tabular">{fechaHora(r.creado_en)}</span>
                    <ChevronDown className={cn("size-4 text-texto-3 transition-transform duration-200", expandido && "rotate-180", !tieneDetalle && "invisible")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {expandido && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden"
                      >
                        <Detalle registro={r} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}

        {(q.data?.total ?? 0) > POR_PAGINA && (
          <div className="flex items-center justify-between border-t border-borde px-5 py-3 text-sm text-texto-2">
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <div className="flex gap-1.5">
              <Boton variante="secundario" tamano="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Boton>
              <Boton variante="secundario" tamano="sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>
    </>
  );
}

function valorLegible(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Detalle({ registro }: { registro: Registro }) {
  const c = registro.cambios ?? {};
  const esDiff = registro.accion === "UPDATE";
  const ocultas = new Set(["id", "sistema_id", "creado_en", "creado_por", "actualizado_en", "actualizado_por"]);
  const filas = Object.entries(c).filter(([k]) => !ocultas.has(k));
  return (
    <div className="mx-5 mb-4 overflow-hidden rounded-xl border border-borde bg-superficie-2/50 text-[13px]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-borde text-left text-xs text-texto-3">
            <th className="px-4 py-2 font-medium">Campo</th>
            {esDiff && <th className="px-4 py-2 font-medium">Antes</th>}
            <th className="px-4 py-2 font-medium">{esDiff ? "Después" : "Valor"}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([k, v]) => {
            const d = v as { antes?: unknown; despues?: unknown };
            return (
              <tr key={k} className="border-b border-borde last:border-0">
                <td className="px-4 py-2 font-medium text-texto-2">{k}</td>
                {esDiff && <td className="px-4 py-2 text-peligro/80 line-through decoration-peligro/40">{valorLegible(d?.antes)}</td>}
                <td className={cn("px-4 py-2 break-all", esDiff && "text-exito")}>{valorLegible(esDiff ? d?.despues : v)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
