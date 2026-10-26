import { ImagePlus, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Campo, Entrada, Segmentado } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import {
  CATEGORIA_SOLICITUD,
  PRIORIDAD_SOLICITUD,
  contextoSolicitud,
  useAccionesSoporte,
  type CategoriaSolicitud,
  type PrioridadSolicitud,
} from "@/lib/soporte";
import { mensajeError } from "@/lib/supabase";
import { useSistema } from "@/sesion/SesionProvider";

/** Hoja para escribirle a Soporte MEDORA. Al enviar, abre la conversación. */
export function NuevaSolicitud({
  abierto,
  onCerrar,
  onCreada,
  pantalla,
  asuntoInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreada: (id: string) => void;
  /** Pantalla desde la que se pidió ayuda (va en el contexto). */
  pantalla: string;
  asuntoInicial?: string;
}) {
  const { sistemaId, roles } = useSistema();
  const { crear } = useAccionesSoporte();
  const [categoria, setCategoria] = useState<CategoriaSolicitud>("problema");
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>("normal");
  const [asunto, setAsunto] = useState("");
  const [texto, setTexto] = useState("");
  const [captura, setCaptura] = useState<File | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setAsunto(asuntoInicial ?? "");
    setTexto("");
    setCaptura(null);
    setCategoria(asuntoInicial ? "duda" : "problema");
    setPrioridad("normal");
  }, [abierto, asuntoInicial]);

  const vista = useMemo(() => (captura ? URL.createObjectURL(captura) : null), [captura]);
  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  const elegir = (f?: File | null) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast.error("Solo se pueden adjuntar imágenes PNG, JPG o WebP.");
    if (f.size > 10 * 1024 * 1024) return toast.error("La imagen pesa más de 10 MB.");
    setCaptura(f);
  };
  const alPegar = (e: ClipboardEvent) => {
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      elegir(img);
    }
  };

  const valido = asunto.trim().length >= 3 && texto.trim().length > 0;
  const enviar = () =>
    crear.mutate(
      { sistemaId, asunto: asunto.trim(), categoria, prioridad, texto, captura, contexto: contextoSolicitud(pantalla, roles) },
      {
        onSuccess: (id) => {
          toast.success("Enviado. Soporte MEDORA te responderá aquí mismo.");
          onCreada(id);
        },
        onError: (e) => toast.error(mensajeError(e)),
      },
    );

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Escribir a soporte"
      descripcion="Cuéntanos qué pasa y te respondemos en esta misma pantalla."
      pie={
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={enviar} disabled={!valido} cargando={crear.isPending}>
            Enviar
          </Boton>
        </div>
      }
    >
      <div className="space-y-4" onPaste={alPegar}>
        <Campo etiqueta="¿De qué se trata?">
          {() => (
            <Segmentado
              id="soporte-categoria"
              valor={categoria}
              onChange={setCategoria}
              opciones={(Object.keys(CATEGORIA_SOLICITUD) as CategoriaSolicitud[]).map((c) => ({ valor: c, etiqueta: CATEGORIA_SOLICITUD[c] }))}
            />
          )}
        </Campo>
        <Campo etiqueta="Asunto">
          {(id) => <Entrada id={id} value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={120} placeholder="Ej.: No imprime el recibo" />}
        </Campo>
        <Campo etiqueta="¿Qué pasó?" ayuda="Qué estabas haciendo, qué esperabas y qué salió. Puedes pegar una captura con Ctrl + V.">
          {(id) => <AreaTexto id={id} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={4000} />}
        </Campo>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Campo etiqueta="Prioridad">
            {() => (
              <Segmentado
                id="soporte-prioridad"
                valor={prioridad}
                onChange={setPrioridad}
                opciones={(Object.keys(PRIORIDAD_SOLICITUD) as PrioridadSolicitud[]).map((p) => ({ valor: p, etiqueta: PRIORIDAD_SOLICITUD[p] }))}
              />
            )}
          </Campo>
          {vista ? (
            <div className="relative">
              <img src={vista} alt="Captura por enviar" className="h-16 rounded-xl border border-borde object-cover" />
              <button
                type="button"
                onClick={() => setCaptura(null)}
                aria-label="Quitar captura"
                className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-texto text-superficie shadow-md"
              >
                <X className="size-3.5" strokeWidth={2.6} />
              </button>
            </div>
          ) : (
            <Boton variante="secundario" icono={<ImagePlus className="size-4" />} onClick={() => archivo.current?.click()}>
              Adjuntar captura
            </Boton>
          )}
          <input
            ref={archivo}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex gap-3 rounded-2xl bg-superficie-2 px-4 py-3 text-xs leading-relaxed text-texto-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" />
          <p>
            Para ayudarte más rápido se envía también la versión de MEDORA, la pantalla en la que estabas y tu rol. <b className="text-texto">No incluyas datos de pacientes</b>: las
            cédulas y teléfonos se ocultan solos.
          </p>
        </div>
      </div>
    </Modal>
  );
}
