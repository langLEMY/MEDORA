import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { BarChart3, CalendarClock, FileText, ShoppingCart, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Documento, EncabezadoDocumento, TablaDocumento } from "@/components/Documento";
import { EstadoCuenta, type ContactoCuenta } from "@/components/EstadoCuenta";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Tarjeta } from "@/components/ui/superficies";
import { CATEGORIAS_SERVICIO, METODOS_PAGO, useAseguradoras } from "@/lib/consultas";
import { datos, supabase } from "@/lib/supabase";
import { fecha, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

type Reporte = "estado" | "ventas" | "compras" | "antiguedad";

const REPORTES: { id: Reporte; titulo: string; descripcion: string; icono: LucideIcon }[] = [
  { id: "estado", titulo: "Estado de cuenta", descripcion: "Cargos, abonos y saldo de un paciente o aseguradora.", icono: FileText },
  { id: "ventas", titulo: "Ventas por período", descripcion: "Facturación por categoría de servicio y por método de pago.", icono: BarChart3 },
  { id: "antiguedad", titulo: "Antigüedad de cuentas por cobrar", descripcion: "Saldos pendientes de pacientes y ARS por tramos de días.", icono: CalendarClock },
  { id: "compras", titulo: "Compras por proveedor", descripcion: "Compras del período con ITBIS, agrupadas por proveedor.", icono: ShoppingCart },
];

export default function Reportes() {
  const [abierto, setAbierto] = useState<Reporte | null>(null);
  return (
    <>
      <EncabezadoPagina titulo="Reportes" descripcion="Todos se pueden imprimir o exportar a PDF. Comisiones, nómina y balanza están en sus módulos." />
      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 md:grid-cols-2">
        {REPORTES.map((r) => (
          <motion.button
            key={r.id}
            variants={itemEscalonado}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
            onClick={() => setAbierto(r.id)}
            className="text-left"
          >
            <Tarjeta className="flex items-start gap-4 p-5 transition-shadow hover:shadow-md">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca">
                <r.icono className="size-5" />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{r.titulo}</span>
                <span className="mt-0.5 block text-sm text-texto-2">{r.descripcion}</span>
              </span>
            </Tarjeta>
          </motion.button>
        ))}
      </motion.div>
      <ElegirEstadoCuenta abierto={abierto === "estado"} onCerrar={() => setAbierto(null)} />
      <Ventas abierto={abierto === "ventas"} onCerrar={() => setAbierto(null)} />
      <Antiguedad abierto={abierto === "antiguedad"} onCerrar={() => setAbierto(null)} />
      <ComprasReporte abierto={abierto === "compras"} onCerrar={() => setAbierto(null)} />
    </>
  );
}

function ElegirEstadoCuenta({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const aseguradoras = useAseguradoras(sistemaId);
  const [tipo, setTipo] = useState<"paciente" | "aseguradora">("paciente");
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [aseg, setAseg] = useState("");
  const [contacto, setContacto] = useState<ContactoCuenta | null>(null);

  const ver = () => {
    if (tipo === "paciente" && paciente) setContacto({ tipo, id: paciente.id, nombre: `${paciente.nombres} ${paciente.apellidos}`, detalle: paciente.expediente });
    if (tipo === "aseguradora" && aseg) setContacto({ tipo, id: aseg, nombre: aseguradoras.data?.find((a) => a.id === aseg)?.nombre ?? "" });
  };

  return (
    <>
      <Modal
        abierto={abierto && !contacto}
        onCerrar={onCerrar}
        ancho="sm"
        titulo="Estado de cuenta"
        pie={
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton disabled={tipo === "paciente" ? !paciente : !aseg} onClick={ver}>
              Generar
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <Segmentado
            id="tipo-estado"
            valor={tipo}
            onChange={setTipo}
            opciones={[
              { valor: "paciente", etiqueta: "Paciente" },
              { valor: "aseguradora", etiqueta: "Aseguradora" },
            ]}
          />
          {tipo === "paciente" ? (
            <SelectorPaciente valor={paciente} onChange={setPaciente} />
          ) : (
            <Selector etiqueta="Aseguradora" value={aseg} onChange={(e) => setAseg(e.target.value)}>
              <option value="">Seleccionar…</option>
              {aseguradoras.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Selector>
          )}
        </div>
      </Modal>
      <EstadoCuenta
        contacto={contacto}
        onCerrar={() => {
          setContacto(null);
          onCerrar();
        }}
      />
    </>
  );
}

function Rango({ desde, hasta, setDesde, setHasta }: { desde: string; hasta: string; setDesde: (v: string) => void; setHasta: (v: string) => void }) {
  return (
    <div className="no-imprimir mb-4 flex gap-3">
      <Entrada etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} contenedor="w-40" />
      <Entrada etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} contenedor="w-40" />
    </div>
  );
}

function useRango() {
  const hoy = new Date();
  const [desde, setDesde] = useState(isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoDia());
  return { desde, hasta, setDesde, setHasta };
}

function Ventas({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const r = useRango();
  const q = useQuery({
    queryKey: ["reporte-ventas", sistemaId, r.desde, r.hasta],
    enabled: abierto,
    queryFn: async () => {
      const cobros = datos(
        await supabase
          .from("cobros")
          .select("id, subtotal, cobertura_seguro, descuento, total, monto_credito, anulacion:anulaciones_cobro(id), detalles:cobro_detalles(categoria, cantidad, precio_unitario), pagos:cobro_pagos(metodo, monto)")
          .eq("sistema_id", sistemaId)
          .gte("creado_en", r.desde)
          .lte("creado_en", r.hasta + "T23:59:59"),
      ) as unknown as {
        subtotal: number;
        cobertura_seguro: number;
        descuento: number;
        total: number;
        monto_credito: number;
        anulacion: unknown[];
        detalles: { categoria: string; cantidad: number; precio_unitario: number }[];
        pagos: { metodo: string; monto: number }[];
      }[];
      const validos = cobros.filter((c) => !c.anulacion?.length);
      const porCat = new Map<string, number>();
      const porMetodo = new Map<string, number>();
      validos.forEach((c) => {
        c.detalles.forEach((d) => porCat.set(d.categoria, (porCat.get(d.categoria) ?? 0) + Number(d.cantidad) * Number(d.precio_unitario)));
        c.pagos.forEach((p) => porMetodo.set(p.metodo, (porMetodo.get(p.metodo) ?? 0) + Number(p.monto)));
      });
      const s = (k: "subtotal" | "cobertura_seguro" | "descuento" | "total" | "monto_credito") => validos.reduce((a, c) => a + Number(c[k]), 0);
      return {
        cantidad: validos.length,
        anulados: cobros.length - validos.length,
        porCat: [...porCat.entries()].sort((a, b) => b[1] - a[1]),
        porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]),
        bruto: s("subtotal"),
        seguro: s("cobertura_seguro"),
        descuento: s("descuento"),
        credito: s("monto_credito"),
        total: s("total"),
      };
    },
  });
  const $ = (v: number) => moneda(v, sistema.moneda);
  return (
    <Documento abierto={abierto} onCerrar={onCerrar} titulo="Ventas por período" nombreArchivo={`Ventas ${r.desde} a ${r.hasta}`}>
      <Rango {...r} />
      <EncabezadoDocumento titulo="Ventas por período" subtitulo={`${fecha(r.desde + "T00:00:00")} – ${fecha(r.hasta + "T00:00:00")}`} />
      {q.isLoading || !q.data ? (
        <Esqueleto className="h-40" />
      ) : (
        <div className="space-y-6">
          <TablaDocumento
            encabezados={["Categoría de servicio", "Monto bruto"]}
            filas={q.data.porCat.map(([k, v]) => [CATEGORIAS_SERVICIO[k] ?? k, $(v)])}
            pie={["Total bruto", $(q.data.bruto)]}
          />
          <TablaDocumento
            encabezados={["Método de pago", "Monto"]}
            filas={[...q.data.porMetodo.map(([k, v]) => [METODOS_PAGO[k] ?? k, $(v)]), ["A crédito (CxC pacientes)", $(q.data.credito)], ["Cobertura ARS (CxC aseguradoras)", $(q.data.seguro)]]}
          />
          <TablaDocumento
            encabezados={["Resumen", "Monto"]}
            filas={[
              ["Facturas emitidas", String(q.data.cantidad)],
              ["Anuladas en el período", String(q.data.anulados)],
              ["Venta bruta", $(q.data.bruto)],
              ["Cobertura de seguros", $(-q.data.seguro)],
              ["Descuentos", $(-q.data.descuento)],
            ]}
            pie={["Total a cargo de pacientes", $(q.data.total)]}
          />
        </div>
      )}
    </Documento>
  );
}

function Antiguedad({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const aseguradoras = useAseguradoras(sistemaId);
  const [deudor, setDeudor] = useState<"paciente" | "aseguradora">("aseguradora");
  const q = useQuery({
    queryKey: ["antiguedad", sistemaId],
    enabled: abierto,
    queryFn: async () => {
      const filas = (datos(await supabase.from("cuentas_por_cobrar").select("*").eq("sistema_id", sistemaId)) ?? []) as unknown as {
        creado_en: string;
        paciente_id: string;
        aseguradora_id: string | null;
        pendiente_paciente: number;
        pendiente_aseguradora: number;
      }[];
      const ids = [...new Set(filas.map((f) => f.paciente_id))];
      const pacientes = ids.length ? (datos(await supabase.from("pacientes").select("id, nombres, apellidos").in("id", ids)) ?? []) : [];
      return { filas, pacientes: new Map(pacientes.map((p) => [p.id, `${p.nombres} ${p.apellidos}`])) };
    },
  });
  const tramos = ["0–30", "31–60", "61–90", "+90"];
  const grupos = new Map<string, number[]>();
  (q.data?.filas ?? []).forEach((f) => {
    const monto = Number(deudor === "paciente" ? f.pendiente_paciente : f.pendiente_aseguradora);
    if (monto <= 0.004) return;
    const k = deudor === "paciente" ? (q.data?.pacientes.get(f.paciente_id) ?? "Paciente") : (aseguradoras.data?.find((a) => a.id === f.aseguradora_id)?.nombre ?? "ARS");
    const dias = (Date.now() - new Date(f.creado_en).getTime()) / 86_400_000;
    const i = dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3;
    const v = grupos.get(k) ?? [0, 0, 0, 0];
    v[i] += monto;
    grupos.set(k, v);
  });
  const $ = (v: number) => (v ? moneda(v, sistema.moneda) : "");
  const tot = [0, 1, 2, 3].map((i) => [...grupos.values()].reduce((s, v) => s + v[i], 0));
  return (
    <Documento abierto={abierto} onCerrar={onCerrar} titulo="Antigüedad de CxC" nombreArchivo={`Antigüedad CxC ${deudor} ${isoDia()}`}>
      <div className="no-imprimir mb-4">
        <Segmentado
          id="antig"
          valor={deudor}
          onChange={setDeudor}
          opciones={[
            { valor: "aseguradora", etiqueta: "Aseguradoras" },
            { valor: "paciente", etiqueta: "Pacientes" },
          ]}
        />
      </div>
      <EncabezadoDocumento titulo="Antigüedad de cuentas por cobrar" subtitulo={deudor === "paciente" ? "Pacientes" : "Aseguradoras (ARS)"} />
      {q.isLoading ? (
        <Esqueleto className="h-40" />
      ) : (
        <TablaDocumento
          encabezados={[deudor === "paciente" ? "Paciente" : "Aseguradora", ...tramos.map((t) => `${t} días`), "Total"]}
          filas={[...grupos.entries()].map(([k, v]) => [k, ...v.map($), moneda(v.reduce((a, b) => a + b, 0), sistema.moneda)])}
          pie={["Total", ...tot.map((v) => moneda(v, sistema.moneda)), moneda(tot.reduce((a, b) => a + b, 0), sistema.moneda)]}
        />
      )}
    </Documento>
  );
}

function ComprasReporte({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistema, sistemaId } = useSistema();
  const r = useRango();
  const q = useQuery({
    queryKey: ["reporte-compras", sistemaId, r.desde, r.hasta],
    enabled: abierto,
    queryFn: async () =>
      datos(
        await supabase
          .from("compras")
          .select("numero, fecha, ncf_proveedor, forma_pago, subtotal, itbis, total, proveedor:proveedores!compras_sistema_id_proveedor_id_fkey(nombre, rnc), anulacion:anulaciones_compra(id)")
          .eq("sistema_id", sistemaId)
          .gte("fecha", r.desde)
          .lte("fecha", r.hasta)
          .order("fecha"),
      ) as unknown as { numero: string; fecha: string; ncf_proveedor: string | null; forma_pago: string; subtotal: number; itbis: number; total: number; proveedor: { nombre: string; rnc: string | null } | null; anulacion: unknown[] }[],
  });
  const validas = (q.data ?? []).filter((c) => !c.anulacion?.length);
  const $ = (v: number) => moneda(v, sistema.moneda);
  return (
    <Documento abierto={abierto} onCerrar={onCerrar} titulo="Compras por período" nombreArchivo={`Compras ${r.desde} a ${r.hasta}`}>
      <Rango {...r} />
      <EncabezadoDocumento titulo="Compras" subtitulo={`${fecha(r.desde + "T00:00:00")} – ${fecha(r.hasta + "T00:00:00")}`} />
      {q.isLoading ? (
        <Esqueleto className="h-40" />
      ) : (
        <TablaDocumento
          encabezados={["Fecha", "Número", "Proveedor", "RNC", "NCF", "Subtotal", "ITBIS", "Total"]}
          filas={validas.map((c) => [
            fecha(c.fecha + "T00:00:00"),
            c.numero,
            c.proveedor?.nombre ?? "—",
            c.proveedor?.rnc ?? "",
            c.ncf_proveedor ?? "",
            $(c.subtotal),
            $(c.itbis),
            $(c.total),
          ])}
          pie={["", "", "", "", "Totales", $(validas.reduce((s, c) => s + Number(c.subtotal), 0)), $(validas.reduce((s, c) => s + Number(c.itbis), 0)), $(validas.reduce((s, c) => s + Number(c.total), 0))]}
        />
      )}
    </Documento>
  );
}
