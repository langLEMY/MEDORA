import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { AccionesDatos, type ColumnaDatos } from "@/components/AccionesDatos";
import { Entrada } from "@/components/ui/campos";
import { Esqueleto, Tarjeta, Vacio } from "@/components/ui/superficies";
import { datos, supabase } from "@/lib/supabase";
import { cn, isoDia, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Cuadre del día con el mismo formato que el Excel de caja: por médico, una columna por ARS (sin el
 * fondo interno, que va aparte), efectivo, tarjeta, transferencia y la comisión con su 10 % de retención.
 * Todo lo calcula el servidor (cuadre_dia): así el cuadre sale de MEDORA y no se digita dos veces.
 */

type GrupoArs = "SENASA" | "RENACER" | "APS" | "OTRA";
interface LineaCuadre {
  numero: string;
  hora: string;
  grupo: string;
  especialidad: string;
  paciente: string | null;
  documento: string | null;
  procedimiento: string | null;
  autorizacion: string | null;
  aseguradora: string | null;
  ars_grupo: GrupoArs | null;
  ars: number;
  fondo: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  otros: number;
  credito: number;
  descuento: number;
  total: number;
  comision: number;
  retencion: number;
}
interface Cuadre {
  fecha: string;
  lineas: LineaCuadre[];
  egresos: { concepto: string; monto: number; metodo: string; categoria: string }[];
  turnos: { cajero: string | null; estado: string; apertura: number; esperado: number | null; declarado: number | null; notas: string | null }[];
}

const GRUPOS_ARS: GrupoArs[] = ["SENASA", "RENACER", "APS", "OTRA"];
const deArs = (l: LineaCuadre, g: GrupoArs) => (l.ars_grupo === g ? Number(l.ars) : 0);
const suma = (ls: LineaCuadre[], f: (l: LineaCuadre) => number) => ls.reduce((s, l) => s + f(l), 0);
// Médicos en orden alfabético; lo que no tiene médico, al final (como en el Excel).
const ordenGrupo = (g: string) => (g === "FARMACIA" ? "~2" : g === "SIN MÉDICO" ? "~1" : g);

const COLUMNAS: ColumnaDatos<LineaCuadre>[] = [
  { titulo: "Médico", valor: (l) => l.grupo },
  { titulo: "Hora", valor: (l) => l.hora },
  { titulo: "Recibo", valor: (l) => l.numero },
  { titulo: "Paciente", valor: (l) => l.paciente },
  { titulo: "Cédula / NSS", valor: (l) => l.documento },
  { titulo: "Procedimiento", valor: (l) => l.procedimiento },
  { titulo: "Autorización", valor: (l) => l.autorizacion },
  { titulo: "SENASA", valor: (l) => deArs(l, "SENASA"), tipo: "moneda" },
  { titulo: "RENACER", valor: (l) => deArs(l, "RENACER"), tipo: "moneda" },
  { titulo: "APS", valor: (l) => deArs(l, "APS"), tipo: "moneda" },
  { titulo: "Otra ARS", valor: (l) => deArs(l, "OTRA"), tipo: "moneda", soloExcel: true },
  { titulo: "Efectivo", valor: (l) => Number(l.efectivo), tipo: "moneda" },
  { titulo: "Tarjeta", valor: (l) => Number(l.tarjeta), tipo: "moneda" },
  { titulo: "Transferencia", valor: (l) => Number(l.transferencia), tipo: "moneda" },
  { titulo: "Crédito", valor: (l) => Number(l.credito), tipo: "moneda", soloExcel: true },
  { titulo: "Total", valor: (l) => Number(l.total), tipo: "moneda" },
  { titulo: "Fondo interno ARS", valor: (l) => Number(l.fondo), tipo: "moneda", soloExcel: true },
  { titulo: "Comisión", valor: (l) => Number(l.comision), tipo: "moneda", soloExcel: true },
  { titulo: "Retención 10 %", valor: (l) => Number(l.retencion), tipo: "moneda", soloExcel: true },
];

export function CuadreDia() {
  const { sistemaId } = useSistema();
  const [dia, setDia] = useState(() => isoDia(new Date()));
  const q = useQuery({
    queryKey: ["cuadre-dia", sistemaId, dia],
    enabled: !!dia,
    queryFn: async () => datos(await supabase.rpc("cuadre_dia", { p_sistema: sistemaId, p_fecha: dia })) as unknown as Cuadre,
  });
  const lineas = useMemo(() => q.data?.lineas ?? [], [q.data]);
  const grupos = useMemo(() => {
    const m = new Map<string, LineaCuadre[]>();
    for (const l of lineas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l]);
    return [...m.entries()].sort(([a], [b]) => ordenGrupo(a).localeCompare(ordenGrupo(b), "es"));
  }, [lineas]);
  const hayOtra = lineas.some((l) => l.ars_grupo === "OTRA");
  const arsVisibles = GRUPOS_ARS.filter((g) => g !== "OTRA" || hayOtra);

  const egresosEfectivo = (q.data?.egresos ?? []).filter((e) => e.metodo === "efectivo").reduce((s, e) => s + Number(e.monto), 0);
  const efectivo = suma(lineas, (l) => Number(l.efectivo));
  const resumen: [string, number, string?][] = [
    ["Total facturado", suma(lineas, (l) => Number(l.total))],
    ["Efectivo", efectivo],
    ...arsVisibles.map((g) => [g === "OTRA" ? "Otras ARS" : g, suma(lineas, (l) => deArs(l, g))] as [string, number]),
    ["Tarjetas", suma(lineas, (l) => Number(l.tarjeta))],
    ["Transferencias", suma(lineas, (l) => Number(l.transferencia))],
    ["Quedó a crédito", suma(lineas, (l) => Number(l.credito)), "Lo que los pacientes quedaron debiendo"],
    ["Fondo interno de las ARS", suma(lineas, (l) => Number(l.fondo)), "Parte de lo que pagan las ARS que es de la fundación (no va al médico)"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Entrada etiqueta="Día" type="date" value={dia} max={isoDia(new Date())} onChange={(e) => setDia(e.target.value)} contenedor="w-44" />
        <AccionesDatos titulo={`Cuadre del día ${dia}`} columnas={COLUMNAS} obtener={async () => lineas} />
      </div>

      {q.isLoading ? (
        <Esqueleto className="h-48" />
      ) : !lineas.length ? (
        <Tarjeta>
          <Vacio icono={<CalendarDays />} titulo="Sin cobros ese día" descripcion="Elige otro día para ver su cuadre." />
        </Tarjeta>
      ) : (
        <>
          {grupos.map(([grupo, ls]) => {
            const comision = suma(ls, (l) => Number(l.comision));
            const retencion = suma(ls, (l) => Number(l.retencion));
            return (
              <Tarjeta key={grupo} className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borde px-4 py-2.5">
                  <p className="text-sm font-semibold">
                    {grupo}
                    {ls[0].especialidad && <span className="font-normal text-texto-3"> · {ls[0].especialidad}</span>}
                  </p>
                  {comision !== 0 && (
                    <p className="text-xs text-texto-2 tabular">
                      Comisión <b className="text-texto">{moneda(comision)}</b> · Desc. 10 % {moneda(retencion)} · A pagar{" "}
                      <b className="text-texto">{moneda(comision - retencion)}</b>
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-xs">
                    <thead>
                      <tr className="text-left text-texto-3">
                        <th className="px-3 py-1.5 font-medium">Hora</th>
                        <th className="px-2 py-1.5 font-medium">Paciente</th>
                        <th className="px-2 py-1.5 font-medium">Procedimiento</th>
                        <th className="px-2 py-1.5 font-medium">Cédula / NSS</th>
                        <th className="px-2 py-1.5 font-medium">Autoriz.</th>
                        {arsVisibles.map((g) => (
                          <th key={g} className="px-2 py-1.5 text-right font-medium">
                            {g === "OTRA" ? "Otra" : g}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right font-medium">Efectivo</th>
                        <th className="px-2 py-1.5 text-right font-medium">Tarjeta</th>
                        <th className="px-2 py-1.5 text-right font-medium">Transf.</th>
                        <th className="px-3 py-1.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde">
                      {ls.map((l) => (
                        <tr key={l.numero}>
                          <td className="px-3 py-1.5 text-texto-3 tabular">{l.hora}</td>
                          <td className="max-w-48 truncate px-2 py-1.5">{l.paciente}</td>
                          <td className="max-w-56 truncate px-2 py-1.5 text-texto-2" title={l.procedimiento ?? ""}>
                            {l.procedimiento}
                          </td>
                          <td className="px-2 py-1.5 text-texto-2 tabular">{l.documento ?? "—"}</td>
                          <td className="px-2 py-1.5 text-texto-2 tabular">{l.autorizacion ?? "—"}</td>
                          {arsVisibles.map((g) => (
                            <td key={g} className="px-2 py-1.5 text-right tabular">
                              {deArs(l, g) ? moneda(deArs(l, g)) : "—"}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-right tabular">{Number(l.efectivo) ? moneda(l.efectivo) : "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular">{Number(l.tarjeta) ? moneda(l.tarjeta) : "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular">{Number(l.transferencia) ? moneda(l.transferencia) : "—"}</td>
                          <td className={cn("px-3 py-1.5 text-right font-medium tabular", Number(l.credito) > 0 && "text-aviso")} title={Number(l.credito) > 0 ? `Quedó a crédito: ${moneda(l.credito)}` : undefined}>
                            {moneda(l.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-borde bg-superficie-2/60 font-semibold">
                        <td className="px-3 py-1.5" colSpan={5}>
                          {ls.length} {ls.length === 1 ? "cobro" : "cobros"}
                        </td>
                        {arsVisibles.map((g) => (
                          <td key={g} className="px-2 py-1.5 text-right tabular">
                            {moneda(suma(ls, (l) => deArs(l, g)))}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right tabular">{moneda(suma(ls, (l) => Number(l.efectivo)))}</td>
                        <td className="px-2 py-1.5 text-right tabular">{moneda(suma(ls, (l) => Number(l.tarjeta)))}</td>
                        <td className="px-2 py-1.5 text-right tabular">{moneda(suma(ls, (l) => Number(l.transferencia)))}</td>
                        <td className="px-3 py-1.5 text-right tabular">{moneda(suma(ls, (l) => Number(l.total)))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Tarjeta>
            );
          })}

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Cuadre del día</h3>
              <dl className="space-y-1.5 text-sm">
                {resumen.map(([t, v, ayuda]) => (
                  <div key={t} className="flex justify-between gap-3" title={ayuda}>
                    <dt className="text-texto-2">{t}</dt>
                    <dd className="font-medium tabular">{moneda(v)}</dd>
                  </div>
                ))}
              </dl>
            </Tarjeta>
            <Tarjeta className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Efectivo y caja</h3>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-texto-2">Efectivo cobrado</dt>
                  <dd className="font-medium tabular">{moneda(efectivo)}</dd>
                </div>
                {(q.data?.egresos ?? []).map((e, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <dt className="truncate text-texto-2">− {e.concepto}</dt>
                    <dd className="tabular text-peligro">{e.metodo === "efectivo" ? moneda(-Number(e.monto)) : `${moneda(e.monto)} (${e.metodo})`}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-borde pt-1.5 font-semibold">
                  <dt>Debe haber en efectivo</dt>
                  <dd className="tabular">{moneda(efectivo - egresosEfectivo)}</dd>
                </div>
                {(q.data?.turnos ?? []).map((t, i) => {
                  const contado = t.declarado === null ? null : Number(t.declarado) - Number(t.apertura);
                  const diferencia = t.declarado === null || t.esperado === null ? null : Number(t.declarado) - Number(t.esperado);
                  return (
                    <div key={i} className="flex justify-between gap-3 text-xs text-texto-3">
                      <dt className="truncate">
                        Turno de {t.cajero ?? "caja"} · {t.estado === "abierto" ? "abierto" : `contó ${contado === null ? "—" : moneda(contado)} (sin el fondo)`}
                      </dt>
                      <dd className={cn("tabular", diferencia && Math.abs(diferencia) > 0.004 ? (diferencia > 0 ? "text-aviso" : "text-peligro") : "")}>
                        {diferencia === null ? "" : diferencia === 0 ? "cuadra" : `${diferencia > 0 ? "sobrante" : "faltante"} ${moneda(Math.abs(diferencia))}`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Tarjeta>
          </div>
        </>
      )}
    </div>
  );
}
