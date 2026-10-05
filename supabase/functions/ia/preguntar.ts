// "Pregúntale a MEDORA": la IA solo traduce la pregunta a una consulta del catálogo
// cerrado (con fechas y filtros). La consulta corre con la sesión de quien pregunta
// (cliente con su JWT), así el RLS decide qué ve. A la IA no llega ningún dato:
// solo la pregunta y la fecha de hoy. Todo es de solo lectura.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Herramienta } from "../_shared/claude.ts";

export const CONSULTAS = [
  "facturacion",
  "pagos_por_metodo",
  "anulaciones",
  "citas",
  "atendidos",
  "cxc_ars",
  "cxc_pacientes",
  "inventario_bajo",
  "gastos",
  "ninguna",
] as const;
type Consulta = (typeof CONSULTAS)[number];

export interface Interpretacion {
  consulta: Consulta;
  titulo: string;
  desde?: string;
  hasta?: string;
  agrupar?: "ninguno" | "especialidad" | "medico" | "aseguradora" | "dia" | "proveedor" | "forma_pago";
  estados?: string[];
  especialidad?: string;
  medico?: string;
  aseguradora?: string;
  antiguedad_min_dias?: number;
  motivo_ninguna?: string;
}

export const HERRAMIENTA_CONSULTA: Herramienta = {
  name: "elegir_consulta",
  description: "Elige la consulta de MEDORA que responde la pregunta y sus parámetros.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      consulta: {
        type: "string",
        enum: [...CONSULTAS],
        description: [
          "facturacion: cuánto se facturó (servicios cobrados), opcionalmente agrupado o filtrado por especialidad/área, médico o aseguradora.",
          "pagos_por_metodo: cuánto entró por efectivo, tarjeta, transferencia, cheque, etc.",
          "anulaciones: cobros anulados y su motivo.",
          "citas: lista de citas en un rango (p. ej. mañana), filtrable por estado, médico o especialidad.",
          "atendidos: cuántos pacientes se atendieron (citas completadas), agrupable por médico, especialidad o día.",
          "cxc_ars: cuánto deben las ARS/aseguradoras (cuentas por cobrar), con antigüedad mínima opcional.",
          "cxc_pacientes: cuánto deben los pacientes a crédito.",
          "inventario_bajo: productos en o por debajo del stock mínimo.",
          "gastos: gastos/compras del hospital, agrupables por proveedor o forma de pago.",
          "ninguna: la pregunta no se puede responder con estas consultas (o pide modificar datos, o pide historia clínica).",
        ].join(" "),
      },
      titulo: { type: "string", description: "Título corto en español de lo que se mostrará, con el período en palabras (p. ej. 'Facturación de Odontología esta semana')." },
      desde: { type: "string", description: "Fecha inicial YYYY-MM-DD (incluida). Omitir si no aplica." },
      hasta: { type: "string", description: "Fecha final YYYY-MM-DD (incluida). Omitir si no aplica." },
      agrupar: { type: "string", enum: ["ninguno", "especialidad", "medico", "aseguradora", "dia", "proveedor", "forma_pago"] },
      estados: {
        type: "array",
        items: { type: "string", enum: ["programada", "confirmada", "por_cobrar", "en_espera", "llamado", "en_consulta", "completada", "cancelada", "no_asistio"] },
        description: "Para citas: estados a incluir. 'sin confirmar' = programada.",
      },
      especialidad: { type: "string", description: "Texto de la especialidad o área mencionada (p. ej. 'odontología')." },
      medico: { type: "string", description: "Nombre o apellido del médico mencionado." },
      aseguradora: { type: "string", description: "Nombre de la ARS mencionada (p. ej. 'SENASA')." },
      antiguedad_min_dias: { type: "integer", description: "Para cxc_ars: solo deudas con al menos estos días." },
      motivo_ninguna: { type: "string", description: "Si consulta = ninguna: explicación breve y amable en español." },
    },
    required: ["consulta", "titulo"],
  },
};

export function instrucciones(hoy: string, diaSemana: string): string {
  return [
    "Eres el intérprete de preguntas de MEDORA, un sistema hospitalario de República Dominicana (pesos dominicanos, hora de Santo Domingo).",
    "Tu único trabajo es elegir UNA consulta del catálogo y sus parámetros llamando a la herramienta elegir_consulta. No respondas la pregunta tú mismo.",
    `Hoy es ${diaSemana} ${hoy}. Interpreta 'hoy', 'ayer', 'mañana', 'esta semana' (lunes a hoy), 'este mes', 'el mes pasado', 'octubre', etc. en fechas YYYY-MM-DD.`,
    "Si no se menciona período en facturación, pagos, anulaciones, atendidos o gastos, usa este mes. Para citas sin período, usa hoy.",
    "Si la pregunta pide crear, cambiar, cobrar, anular o borrar algo, o pide diagnósticos o historia clínica, usa consulta = ninguna.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Ejecución (con el cliente del usuario: RLS)
// ---------------------------------------------------------------------------
type Tipo = "texto" | "moneda" | "numero" | "fecha" | "fechaHora";
export interface Respuesta {
  titulo: string;
  resumen: string;
  columnas: { titulo: string; tipo: Tipo }[];
  filas: (string | number | null)[][];
  enlace?: string;
  aviso?: string;
}

const norm = (t: string | null | undefined) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const contiene = (valor: string | null | undefined, filtro?: string) => !filtro || norm(valor).includes(norm(filtro));
const rd = (n: number) => `RD$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaValida = (f?: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : undefined);
// Santo Domingo es UTC−4 todo el año.
const inicioDia = (f: string) => `${f}T00:00:00-04:00`;
const finDia = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T00:00:00-04:00`;
};
const MAX_FILAS = 200;

/** Lee hasta 20,000 filas en páginas de 1,000 (límite de PostgREST). */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const salida: T[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await consulta(i * 1000, i * 1000 + 999);
    if (error) throw new Error(error.message);
    salida.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return salida;
}

function agruparSuma<T>(filas: T[], clave: (f: T) => string, valores: ((f: T) => number)[]) {
  const m = new Map<string, number[]>();
  for (const f of filas) {
    const k = clave(f) || "—";
    const acc = m.get(k) ?? valores.map(() => 0);
    valores.forEach((v, i) => (acc[i] += v(f)));
    m.set(k, acc);
  }
  return [...m.entries()];
}

export async function ejecutar(db: SupabaseClient, sistemaId: string, q: Interpretacion, hoy: string): Promise<Respuesta> {
  const desde = fechaValida(q.desde) ?? hoy.slice(0, 8) + "01";
  const hasta = fechaValida(q.hasta) ?? hoy;
  const rango = desde === hasta ? desde.split("-").reverse().join("/") : `${desde.split("-").reverse().join("/")} al ${hasta.split("-").reverse().join("/")}`;

  switch (q.consulta) {
    case "facturacion": {
      type F = {
        total: number;
        cobertura: number;
        cantidad: number;
        servicio: { especialidad: string | null } | null;
        cobro: { creado_en: string; profesional: { nombre_completo: string } | null; aseguradora: { nombre: string } | null; anulacion: { id: string }[] };
      };
      const filas = (
        await todas<F>((a, b) =>
          db
            .from("cobro_detalles")
            .select(
              "total, cobertura, cantidad, servicio:servicios!cobro_detalles_sistema_id_servicio_id_fkey(especialidad), cobro:cobros!cobro_detalles_sistema_id_cobro_id_fkey!inner(creado_en, profesional:perfiles!cobros_profesional_perfil_fk(nombre_completo), aseguradora:aseguradoras!cobros_sistema_id_aseguradora_id_fkey(nombre), anulacion:anulaciones_cobro(id))",
            )
            .eq("sistema_id", sistemaId)
            .gte("cobro.creado_en", inicioDia(desde))
            .lt("cobro.creado_en", finDia(hasta))
            .order("id")
            .range(a, b) as unknown as PromiseLike<{ data: F[] | null; error: { message: string } | null }>,
        )
      ).filter(
        (f) =>
          !f.cobro.anulacion?.length &&
          contiene(f.servicio?.especialidad ?? "Otros servicios", q.especialidad) &&
          contiene(f.cobro.profesional?.nombre_completo, q.medico) &&
          contiene(f.cobro.aseguradora?.nombre ?? "Privado", q.aseguradora),
      );
      const bruto = (f: F) => Number(f.total) + Number(f.cobertura);
      const totalBruto = filas.reduce((s, f) => s + bruto(f), 0);
      const ars = filas.reduce((s, f) => s + Number(f.cobertura), 0);
      const resumen = `${rd(totalBruto)} facturado del ${rango}${ars > 0 ? ` (${rd(ars)} a cargo de ARS)` : ""}.`;
      const agrupar = q.agrupar && q.agrupar !== "ninguno" ? q.agrupar : null;
      if (!agrupar) {
        return {
          titulo: q.titulo,
          resumen,
          columnas: [
            { titulo: "Concepto", tipo: "texto" },
            { titulo: "Monto", tipo: "moneda" },
          ],
          filas: [
            ["Facturado (servicios)", totalBruto],
            ["A cargo de ARS", ars],
            ["A cargo de pacientes", totalBruto - ars],
          ],
          aviso: "Montos antes de descuentos; no incluye cobros anulados.",
          enlace: "/finanzas?vista=reportes",
        };
      }
      const clave = (f: F) =>
        agrupar === "especialidad"
          ? (f.servicio?.especialidad ?? "Otros servicios")
          : agrupar === "medico"
            ? (f.cobro.profesional?.nombre_completo ?? "Sin médico")
            : agrupar === "aseguradora"
              ? (f.cobro.aseguradora?.nombre ?? "Privado")
              : f.cobro.creado_en.slice(0, 10);
      const grupos = agruparSuma(filas, clave, [bruto, (f) => Number(f.cobertura)]).sort((a, b) => (agrupar === "dia" ? a[0].localeCompare(b[0]) : b[1][0] - a[1][0]));
      const nombre = { especialidad: "Especialidad", medico: "Médico", aseguradora: "Aseguradora", dia: "Día" }[agrupar as string] ?? "Grupo";
      return {
        titulo: q.titulo,
        resumen,
        columnas: [
          { titulo: nombre, tipo: agrupar === "dia" ? "fecha" : "texto" },
          { titulo: "Facturado", tipo: "moneda" },
          { titulo: "ARS", tipo: "moneda" },
        ],
        filas: grupos.slice(0, MAX_FILAS).map(([k, [t, a]]) => [k, t, a]),
        aviso: "Montos antes de descuentos; no incluye cobros anulados.",
        enlace: "/finanzas?vista=reportes",
      };
    }

    case "pagos_por_metodo": {
      type P = { metodo: string; monto: number; cobro: { creado_en: string; anulacion: { id: string }[] } };
      const filas = (
        await todas<P>((a, b) =>
          db
            .from("cobro_pagos")
            .select("metodo, monto, cobro:cobros!inner(creado_en, anulacion:anulaciones_cobro(id))")
            .eq("sistema_id", sistemaId)
            .gte("cobro.creado_en", inicioDia(desde))
            .lt("cobro.creado_en", finDia(hasta))
            .order("id")
            .range(a, b) as unknown as PromiseLike<{ data: P[] | null; error: { message: string } | null }>,
        )
      ).filter((p) => !p.cobro.anulacion?.length);
      const NOMBRES: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", cheque: "Cheque", anticipo: "Anticipo", otro: "Otro" };
      const grupos = agruparSuma(filas, (p) => NOMBRES[p.metodo] ?? p.metodo, [(p) => Number(p.monto), () => 1]).sort((a, b) => b[1][0] - a[1][0]);
      const total = filas.reduce((s, p) => s + Number(p.monto), 0);
      return {
        titulo: q.titulo,
        resumen: `${rd(total)} recibido del ${rango}.`,
        columnas: [
          { titulo: "Método", tipo: "texto" },
          { titulo: "Monto", tipo: "moneda" },
          { titulo: "Pagos", tipo: "numero" },
        ],
        filas: grupos.map(([k, [m, n]]) => [k, m, n]),
        enlace: "/caja",
      };
    }

    case "anulaciones": {
      const { data, error } = await db
        .from("anulaciones_cobro")
        .select("creado_en, motivo, cobro:cobros!inner(numero, total)")
        .eq("sistema_id", sistemaId)
        .gte("creado_en", inicioDia(desde))
        .lt("creado_en", finDia(hasta))
        .order("creado_en", { ascending: false })
        .limit(MAX_FILAS);
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as unknown as { creado_en: string; motivo: string; cobro: { numero: string; total: number } }[];
      return {
        titulo: q.titulo,
        resumen: `${filas.length} ${filas.length === 1 ? "cobro anulado" : "cobros anulados"} por ${rd(filas.reduce((s, f) => s + Number(f.cobro.total), 0))} del ${rango}.`,
        columnas: [
          { titulo: "Fecha", tipo: "fechaHora" },
          { titulo: "Recibo", tipo: "texto" },
          { titulo: "Monto", tipo: "moneda" },
          { titulo: "Motivo", tipo: "texto" },
        ],
        filas: filas.map((f) => [f.creado_en, f.cobro.numero, Number(f.cobro.total), f.motivo]),
        enlace: "/caja",
      };
    }

    case "citas": {
      const d = fechaValida(q.desde) ?? hoy;
      const h = fechaValida(q.hasta) ?? d;
      let consulta = db
        .from("citas")
        .select("inicio, estado, especialidad, paciente:pacientes!citas_sistema_id_paciente_id_fkey(nombres, apellidos, telefono), medico:perfiles!citas_medico_perfil_fk(nombre_completo)")
        .eq("sistema_id", sistemaId)
        .gte("inicio", inicioDia(d))
        .lt("inicio", finDia(h))
        .order("inicio")
        .limit(1000);
      if (q.estados?.length) consulta = consulta.in("estado", q.estados);
      const { data, error } = await consulta;
      if (error) throw new Error(error.message);
      const ESTADOS: Record<string, string> = {
        programada: "Sin confirmar", confirmada: "Confirmada", por_cobrar: "Por cobrar", en_espera: "En espera", llamado: "Llamado",
        en_consulta: "En consulta", completada: "Completada", cancelada: "Cancelada", no_asistio: "No asistió",
      };
      const filas = ((data ?? []) as unknown as { inicio: string; estado: string; especialidad: string | null; paciente: { nombres: string; apellidos: string; telefono: string | null } | null; medico: { nombre_completo: string } | null }[])
        .filter((c) => contiene(c.medico?.nombre_completo, q.medico) && contiene(c.especialidad, q.especialidad));
      const r = d === h ? d.split("-").reverse().join("/") : `${d.split("-").reverse().join("/")} al ${h.split("-").reverse().join("/")}`;
      return {
        titulo: q.titulo,
        resumen: `${filas.length} ${filas.length === 1 ? "cita" : "citas"} del ${r}.`,
        columnas: [
          { titulo: "Hora", tipo: d === h ? "texto" : "fechaHora" },
          { titulo: "Paciente", tipo: "texto" },
          { titulo: "Teléfono", tipo: "texto" },
          { titulo: "Médico", tipo: "texto" },
          { titulo: "Estado", tipo: "texto" },
        ],
        filas: filas.slice(0, MAX_FILAS).map((c) => [
          d === h ? new Date(c.inicio).toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "numeric", minute: "2-digit" }) : c.inicio,
          c.paciente ? `${c.paciente.nombres} ${c.paciente.apellidos}` : "Por identificar",
          c.paciente?.telefono ?? "",
          c.medico?.nombre_completo ?? "",
          ESTADOS[c.estado] ?? c.estado,
        ]),
        enlace: `/agenda?fecha=${d}`,
      };
    }

    case "atendidos": {
      const { data, error } = await db
        .from("citas")
        .select("inicio, especialidad, medico:perfiles!citas_medico_perfil_fk(nombre_completo)")
        .eq("sistema_id", sistemaId)
        .eq("estado", "completada")
        .gte("inicio", inicioDia(desde))
        .lt("inicio", finDia(hasta))
        .limit(20000);
      if (error) throw new Error(error.message);
      const filas = ((data ?? []) as unknown as { inicio: string; especialidad: string | null; medico: { nombre_completo: string } | null }[]).filter(
        (c) => contiene(c.medico?.nombre_completo, q.medico) && contiene(c.especialidad, q.especialidad),
      );
      const agrupar = q.agrupar === "especialidad" || q.agrupar === "dia" ? q.agrupar : "medico";
      const grupos = agruparSuma(
        filas,
        (c) => (agrupar === "especialidad" ? (c.especialidad ?? "Sin especialidad") : agrupar === "dia" ? c.inicio.slice(0, 10) : (c.medico?.nombre_completo ?? "Sin médico")),
        [() => 1],
      ).sort((a, b) => (agrupar === "dia" ? a[0].localeCompare(b[0]) : b[1][0] - a[1][0]));
      return {
        titulo: q.titulo,
        resumen: `${filas.length} ${filas.length === 1 ? "paciente atendido" : "pacientes atendidos"} del ${rango}.`,
        columnas: [
          { titulo: agrupar === "especialidad" ? "Especialidad" : agrupar === "dia" ? "Día" : "Médico", tipo: agrupar === "dia" ? "fecha" : "texto" },
          { titulo: "Atendidos", tipo: "numero" },
        ],
        filas: grupos.map(([k, [n]]) => [k, n]),
        enlace: "/estadisticas",
      };
    }

    case "cxc_ars": {
      const { data, error } = await db
        .from("cuentas_por_cobrar")
        .select("creado_en, pendiente_aseguradora, aseguradora:aseguradoras!cobros_sistema_id_aseguradora_id_fkey(nombre)")
        .eq("sistema_id", sistemaId)
        .gt("pendiente_aseguradora", 0)
        .limit(20000);
      if (error) throw new Error(error.message);
      const limite = q.antiguedad_min_dias ? Date.now() - q.antiguedad_min_dias * 86_400_000 : Infinity;
      const filas = ((data ?? []) as unknown as { creado_en: string; pendiente_aseguradora: number; aseguradora: { nombre: string } | null }[]).filter(
        (f) => contiene(f.aseguradora?.nombre, q.aseguradora) && new Date(f.creado_en).getTime() <= limite,
      );
      const grupos = new Map<string, { monto: number; n: number; viejo: string }>();
      for (const f of filas) {
        const k = f.aseguradora?.nombre ?? "—";
        const g = grupos.get(k) ?? { monto: 0, n: 0, viejo: f.creado_en };
        g.monto += Number(f.pendiente_aseguradora);
        g.n += 1;
        if (f.creado_en < g.viejo) g.viejo = f.creado_en;
        grupos.set(k, g);
      }
      const total = filas.reduce((s, f) => s + Number(f.pendiente_aseguradora), 0);
      return {
        titulo: q.titulo,
        resumen: `Las ARS deben ${rd(total)} en ${filas.length} ${filas.length === 1 ? "autorización" : "autorizaciones"}${q.antiguedad_min_dias ? ` con más de ${q.antiguedad_min_dias} días` : ""}.`,
        columnas: [
          { titulo: "Aseguradora", tipo: "texto" },
          { titulo: "Pendiente", tipo: "moneda" },
          { titulo: "Autorizaciones", tipo: "numero" },
          { titulo: "La más vieja", tipo: "fecha" },
        ],
        filas: [...grupos.entries()].sort((a, b) => b[1].monto - a[1].monto).map(([k, g]) => [k, g.monto, g.n, g.viejo]),
        enlace: "/caja",
      };
    }

    case "cxc_pacientes": {
      const { data, error } = await db
        .from("cuentas_por_cobrar")
        .select("pendiente_paciente, paciente:pacientes!cobros_sistema_id_paciente_id_fkey(nombres, apellidos, expediente)")
        .eq("sistema_id", sistemaId)
        .gt("pendiente_paciente", 0)
        .limit(20000);
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as unknown as { pendiente_paciente: number; paciente: { nombres: string; apellidos: string; expediente: string } | null }[];
      const grupos = agruparSuma(filas, (f) => (f.paciente ? `${f.paciente.nombres} ${f.paciente.apellidos} (${f.paciente.expediente})` : "—"), [(f) => Number(f.pendiente_paciente), () => 1]).sort(
        (a, b) => b[1][0] - a[1][0],
      );
      const total = filas.reduce((s, f) => s + Number(f.pendiente_paciente), 0);
      return {
        titulo: q.titulo,
        resumen: `${grupos.length} ${grupos.length === 1 ? "paciente debe" : "pacientes deben"} ${rd(total)} en total.`,
        columnas: [
          { titulo: "Paciente", tipo: "texto" },
          { titulo: "Debe", tipo: "moneda" },
          { titulo: "Cobros", tipo: "numero" },
        ],
        filas: grupos.slice(0, MAX_FILAS).map(([k, [m, n]]) => [k, m, n]),
        enlace: "/caja",
      };
    }

    case "inventario_bajo": {
      const { data, error } = await db.from("inventario_items").select("nombre, unidad, stock_actual, stock_minimo").eq("sistema_id", sistemaId).eq("activo", true).gt("stock_minimo", 0).limit(5000);
      if (error) throw new Error(error.message);
      const filas = ((data ?? []) as { nombre: string; unidad: string; stock_actual: number; stock_minimo: number }[])
        .filter((i) => Number(i.stock_actual) <= Number(i.stock_minimo))
        .sort((a, b) => Number(a.stock_actual) - Number(a.stock_minimo) - (Number(b.stock_actual) - Number(b.stock_minimo)));
      return {
        titulo: q.titulo,
        resumen: filas.length ? `${filas.length} ${filas.length === 1 ? "producto está" : "productos están"} en o bajo el mínimo.` : "Ningún producto está bajo el mínimo.",
        columnas: [
          { titulo: "Producto", tipo: "texto" },
          { titulo: "Existencia", tipo: "numero" },
          { titulo: "Mínimo", tipo: "numero" },
          { titulo: "Unidad", tipo: "texto" },
        ],
        filas: filas.slice(0, MAX_FILAS).map((i) => [i.nombre, Number(i.stock_actual), Number(i.stock_minimo), i.unidad]),
        enlace: "/inventario",
      };
    }

    case "gastos": {
      const { data, error } = await db
        .from("compras")
        .select("fecha, total, forma_pago, proveedor:proveedores!compras_sistema_id_proveedor_id_fkey(nombre), anulacion:anulaciones_compra(id)")
        .eq("sistema_id", sistemaId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .limit(20000);
      if (error) throw new Error(error.message);
      const FORMAS: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque", credito: "A crédito" };
      const filas = ((data ?? []) as unknown as { fecha: string; total: number; forma_pago: string; proveedor: { nombre: string } | null; anulacion: { id: string }[] }[]).filter(
        (c) => !c.anulacion?.length,
      );
      const total = filas.reduce((s, c) => s + Number(c.total), 0);
      const agrupar = q.agrupar === "forma_pago" ? "forma_pago" : "proveedor";
      const grupos = agruparSuma(filas, (c) => (agrupar === "forma_pago" ? (FORMAS[c.forma_pago] ?? c.forma_pago) : (c.proveedor?.nombre ?? "Sin proveedor")), [(c) => Number(c.total), () => 1]).sort(
        (a, b) => b[1][0] - a[1][0],
      );
      return {
        titulo: q.titulo,
        resumen: `${rd(total)} en gastos del ${rango}.`,
        columnas: [
          { titulo: agrupar === "forma_pago" ? "Forma de pago" : "Proveedor", tipo: "texto" },
          { titulo: "Monto", tipo: "moneda" },
          { titulo: "Gastos", tipo: "numero" },
        ],
        filas: grupos.slice(0, MAX_FILAS).map(([k, [m, n]]) => [k, m, n]),
        enlace: "/gastos",
      };
    }

    default:
      return {
        titulo: "No puedo responder eso todavía",
        resumen: q.motivo_ninguna || "Puedo responder sobre facturación, pagos, anulaciones, citas, pacientes atendidos, lo que deben las ARS o los pacientes, inventario bajo y gastos.",
        columnas: [],
        filas: [],
      };
  }
}
