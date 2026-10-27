import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, FileMinus2, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { FilasEsqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { puedeEscribir } from "@/lib/permisos";
import { datos, invocar, mensajeError, supabase } from "@/lib/supabase";
import { cn, fechaHora, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Facturación electrónica (e-CF) del sistema: conexión con la DGII, activar/pausar y
 * estado de cada comprobante enviado. El envío lo hace la Edge Function "ecf" (al
 * cobrar, con el botón o cada 10 minutos por pg_cron).
 */
type EstadoEcf = "pendiente" | "enviado" | "aceptado" | "aceptado_condicional" | "rechazado" | "error";

const ESTADO: Record<EstadoEcf, { etiqueta: string; tono: Tono }> = {
  pendiente: { etiqueta: "Pendiente", tono: "neutro" },
  enviado: { etiqueta: "En la DGII", tono: "info" },
  aceptado: { etiqueta: "Aceptado", tono: "exito" },
  aceptado_condicional: { etiqueta: "Aceptado condicional", tono: "aviso" },
  rechazado: { etiqueta: "Rechazado", tono: "peligro" },
  error: { etiqueta: "Error de envío", tono: "peligro" },
};

function mensajeDgii(m: unknown): string | null {
  if (!m || typeof m !== "object") return null;
  const o = m as { error?: string; mensajes?: { valor?: string }[] };
  if (o.error) return o.error;
  const lista = o.mensajes?.map((x) => x.valor).filter(Boolean);
  return lista?.length ? lista.join(" · ") : null;
}

export function FacturacionElectronica() {
  const { sistemaId, roles } = useSistema();
  const qc = useQueryClient();
  const escribir = puedeEscribir.contabilidad(roles);

  const estado = useQuery({
    queryKey: ["ecf-estado", sistemaId],
    queryFn: async () => {
      const [s, i] = await Promise.all([
        supabase.from("sistemas").select("ecf_activo, rnc").eq("id", sistemaId).single(),
        supabase.from("integraciones").select("estado, config").eq("sistema_id", sistemaId).eq("proveedor", "dgii_ecf").maybeSingle(),
      ]);
      return { activo: !!s.data?.ecf_activo, rnc: s.data?.rnc ?? null, conexion: i.data?.estado ?? null, ambiente: (i.data?.config as Record<string, string> | null)?.ambiente ?? null };
    },
  });

  const docs = useQuery({
    queryKey: ["ecf-documentos", sistemaId],
    queryFn: async () =>
      datos(
        await supabase
          .from("ecf_documentos")
          .select("id, cobro_id, encf, tipo, nota_de, motivo, monto_total, estado, resumen, codigo_seguridad, mensajes, intentos, creado_en, ultimo_intento")
          .eq("sistema_id", sistemaId)
          .order("creado_en", { ascending: false })
          .limit(60),
      ) ?? [],
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["ecf-estado", sistemaId] });
    void qc.invalidateQueries({ queryKey: ["ecf-documentos", sistemaId] });
  };

  const activar = useMutation({
    mutationFn: async (activo: boolean) => datos(await supabase.rpc("activar_facturacion_electronica", { p_sistema: sistemaId, p_activo: activo })),
    onSuccess: (_, activo) => {
      toast.success(activo ? "Facturación electrónica activada: los próximos comprobantes salen como e-CF" : "Facturación electrónica en pausa");
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const enviar = useMutation({
    mutationFn: async () =>
      invocar<{ procesados: number; aceptados: number; rechazados: number; enviados: number; errores: number; mensaje: string | null }>("ecf", {
        accion: "enviar",
        sistema_id: sistemaId,
      }),
    onSuccess: (r) => {
      if (r.mensaje) toast.error(r.mensaje);
      else if (r.procesados === 0) toast.success("No hay comprobantes pendientes");
      else toast.success(`${r.procesados} procesados · ${r.aceptados} aceptados${r.enviados ? ` · ${r.enviados} en la DGII` : ""}${r.rechazados + r.errores ? ` · ${r.rechazados + r.errores} con problemas` : ""}`);
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const descargar = useMutation({
    mutationFn: async (id: string) => invocar<{ encf: string; xml: string }>("ecf", { accion: "xml", documento_id: id }),
    onSuccess: (r) => {
      const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${estado.data?.rnc ?? ""}${r.encf}.xml` });
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const [nota, setNota] = useState<{ cobro_id: string; encf: string; monto_total: number } | null>(null);
  const [motivo, setMotivo] = useState("");
  const emitirNota = useMutation({
    mutationFn: async () => datos(await supabase.rpc("emitir_nota_credito", { p_cobro: nota!.cobro_id, p_motivo: motivo.trim() })) as { encf: string },
    onSuccess: (r) => {
      toast.success(`Nota de crédito ${r.encf} emitida`, { description: "El cobro quedó anulado. La E34 se envía a la DGII ahora." });
      setNota(null);
      setMotivo("");
      refrescar();
      enviar.mutate();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });
  // e-CF que ya tienen su nota de crédito (no se ofrece emitir otra).
  const conNota = new Set((docs.data ?? []).filter((d) => d.tipo === "E34").map((d) => d.nota_de));

  const e = estado.data;
  const conectado = e?.conexion === "conectado";
  const conteo = (docs.data ?? []).reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.estado]: (acc[d.estado] ?? 0) + 1 }), {});
  const pendientes = (conteo.pendiente ?? 0) + (conteo.error ?? 0) + (conteo.enviado ?? 0);

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 border-b border-borde p-5">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", e?.activo ? "bg-marca-suave text-marca" : "bg-superficie-2 text-texto-3")}>
          <FileCheck2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[0.9375rem] font-semibold">Facturación electrónica (e-CF)</h2>
            {e && (e.activo ? <Insignia tono="exito" punto>Activa</Insignia> : <Insignia>Inactiva</Insignia>)}
            {e?.ambiente && e.ambiente !== "produccion" && <Insignia tono="aviso">Ambiente de {e.ambiente === "pruebas" ? "pruebas" : "certificación"}</Insignia>}
          </div>
          <p className="mt-1 text-sm text-texto-2">
            {conectado
              ? "Con la facturación electrónica activa, los cobros con comprobante salen como e-CF (B02→E32, B01→E31…), firmados y enviados a la DGII."
              : "Primero conecta el certificado digital en Administración → Integraciones → Facturación electrónica (DGII)."}
          </p>
          {!conectado && (
            <Link to="/administracion?vista=integraciones" className="mt-1 inline-block text-sm font-medium text-marca-texto hover:underline">
              Ir a Integraciones
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {pendientes > 0 && (
            <Boton variante="secundario" icono={<Send className="size-4" />} cargando={enviar.isPending} onClick={() => enviar.mutate()}>
              Enviar pendientes ({pendientes})
            </Boton>
          )}
          {escribir && (
            <Interruptor
              activo={!!e?.activo}
              disabled={!conectado || activar.isPending}
              onChange={(v) => activar.mutate(v)}
              etiqueta={e?.activo ? "Activa" : "Inactiva"}
            />
          )}
        </div>
      </div>

      {docs.isLoading ? (
        <FilasEsqueleto />
      ) : (docs.data?.length ?? 0) === 0 ? (
        <Vacio icono={<FileCheck2 />} titulo="Sin comprobantes electrónicos todavía" descripcion="Aparecerán aquí al cobrar con comprobante fiscal una vez activa." />
      ) : (
        <ul className="max-h-[28rem] divide-y divide-borde overflow-y-auto">
          {docs.data!.map((d) => {
            const est = ESTADO[d.estado as EstadoEcf];
            const msg = d.estado === "aceptado" ? null : mensajeDgii(d.mensajes);
            return (
              <li key={d.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="w-36 shrink-0 font-mono text-xs">{d.encf}</span>
                <span className="w-28 shrink-0 tabular">{moneda(d.monto_total)}</span>
                <div className="min-w-0 flex-1">
                  <Insignia tono={est.tono} punto>
                    {est.etiqueta}
                  </Insignia>
                  {d.resumen && <span className="ml-2 text-xs text-texto-3">resumen de consumo</span>}
                  {d.tipo === "E34" && (
                    <span className="ml-2 text-xs text-texto-3">
                      nota de crédito de {docs.data!.find((o) => o.id === d.nota_de)?.encf ?? "otro e-CF"}
                      {d.motivo && ` · ${d.motivo}`}
                    </span>
                  )}
                  {conNota.has(d.id) && <span className="ml-2 text-xs text-texto-3">anulado con nota de crédito</span>}
                  {msg && <p className="mt-0.5 truncate text-xs text-peligro" title={msg}>{msg}</p>}
                </div>
                <span className="hidden shrink-0 text-xs text-texto-3 sm:block">{fechaHora(d.creado_en)}</span>
                {puedeEscribir.caja(roles) && d.tipo !== "E34" && !conNota.has(d.id) && (d.estado === "aceptado" || d.estado === "aceptado_condicional") && (
                  <Boton tamano="sm" variante="fantasma" icono={<FileMinus2 className="size-4" />} onClick={() => setNota(d)}>
                    Nota de crédito
                  </Boton>
                )}
                {d.codigo_seguridad && (
                  <button
                    title="Descargar XML firmado"
                    onClick={() => descargar.mutate(d.id)}
                    className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
                  >
                    <Download className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        abierto={!!nota}
        onCerrar={() => setNota(null)}
        titulo="Nota de crédito (E34)"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setNota(null)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" cargando={emitirNota.isPending} disabled={motivo.trim().length < 3} onClick={() => emitirNota.mutate()}>
              Emitir y anular el cobro
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-texto-2">
            Anula por completo el comprobante <span className="font-mono">{nota?.encf}</span> ({moneda(nota?.monto_total ?? 0)}): se emite una E34
            de la secuencia autorizada, se envía a la DGII y el cobro queda anulado (asientos, comisiones y caja).
          </p>
          <Entrada
            etiqueta="Motivo"
            placeholder="Ej. Servicio no realizado"
            value={motivo}
            maxLength={90}
            onChange={(x) => setMotivo(x.target.value)}
            ayuda="Va en el comprobante (máximo 90 caracteres)."
          />
        </div>
      </Modal>
    </Tarjeta>
  );
}
