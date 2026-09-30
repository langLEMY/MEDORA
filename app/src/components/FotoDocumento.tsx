import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Camera, IdCard, ImageUp, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { claves } from "@/lib/consultas";
import { mensajeError, supabase } from "@/lib/supabase";
import { useSistema } from "@/sesion/SesionProvider";
import { Boton } from "./ui/boton";
import { Modal } from "./ui/modal";

/**
 * Foto de la cédula del paciente (bucket privado documentos-pacientes).
 * Se toma con la cámara del equipo o se sube una imagen; se reduce a 1600 px y
 * JPEG antes de subirla para que pese poco.
 */
export function FotoDocumento({ pacienteId, ruta, editable }: { pacienteId: string; ruta: string | null; editable: boolean }) {
  const { sistemaId } = useSistema();
  const [abierto, setAbierto] = useState(false);
  const url = useQuery({
    queryKey: ["foto-documento", ruta],
    enabled: !!ruta,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("documentos-pacientes").createSignedUrl(ruta!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!ruta && !editable) return null;
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setAbierto(true)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
        className="group relative grid h-[4.5rem] w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-borde-fuerte bg-superficie-2 text-texto-3 transition-colors hover:border-marca hover:text-marca"
        title={ruta ? "Ver la cédula" : "Agregar la foto de la cédula"}
      >
        {ruta && url.data ? (
          <img src={url.data} alt="Cédula" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-[0.6875rem] font-medium">
            <IdCard className="size-5" />
            {ruta ? "Cargando…" : "Foto de cédula"}
          </span>
        )}
      </motion.button>
      <ModalFoto abierto={abierto} onCerrar={() => setAbierto(false)} url={url.data ?? null} editable={editable} pacienteId={pacienteId} sistemaId={sistemaId} />
    </>
  );
}

function ModalFoto({
  abierto,
  onCerrar,
  url,
  editable,
  pacienteId,
  sistemaId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  url: string | null;
  editable: boolean;
  pacienteId: string;
  sistemaId: string;
}) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<"ver" | "camara">("ver");
  const [vista, setVista] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const flujoRef = useRef<MediaStream | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const apagarCamara = () => {
    flujoRef.current?.getTracks().forEach((t) => t.stop());
    flujoRef.current = null;
  };
  useEffect(() => {
    if (!abierto) {
      apagarCamara();
      setModo("ver");
      setVista(null);
    }
  }, [abierto]);
  useEffect(() => () => apagarCamara(), []);

  const encenderCamara = async () => {
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" } });
      flujoRef.current = flujo;
      setModo("camara");
      setVista(null);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = flujo;
      });
    } catch {
      toast.error("No se pudo usar la cámara", { description: "Revisa que el equipo tenga cámara y que MEDORA tenga permiso." });
    }
  };

  const capturar = async () => {
    const v = videoRef.current;
    if (!v) return;
    setVista(await reducir(v, v.videoWidth, v.videoHeight));
    apagarCamara();
  };

  const elegirArchivo = async (f: File | undefined) => {
    if (!f) return;
    const img = await createImageBitmap(f);
    setVista(await reducir(img, img.width, img.height));
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const ruta = `${sistemaId}/${pacienteId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("documentos-pacientes").upload(ruta, vista!, { contentType: "image/jpeg" });
      if (error) throw error;
      const { error: e2 } = await supabase.from("pacientes").update({ foto_documento: ruta }).eq("id", pacienteId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Foto de la cédula guardada");
      void qc.invalidateQueries({ queryKey: claves.paciente(sistemaId, pacienteId) });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const vistaUrl = vista ? URL.createObjectURL(vista) : null;
  useEffect(() => () => (vistaUrl ? URL.revokeObjectURL(vistaUrl) : undefined), [vistaUrl]);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cédula del paciente"
      ancho="lg"
      pie={
        editable ? (
          <>
            <input ref={archivoRef} type="file" accept="image/*" className="hidden" onChange={(e) => void elegirArchivo(e.target.files?.[0])} />
            <Boton variante="secundario" icono={<ImageUp className="size-4" />} onClick={() => archivoRef.current?.click()}>
              Subir imagen
            </Boton>
            {modo === "camara" && !vista ? (
              <Boton icono={<Camera className="size-4" />} onClick={() => void capturar()}>
                Tomar foto
              </Boton>
            ) : vista ? (
              <>
                <Boton variante="secundario" icono={<RefreshCw className="size-4" />} onClick={() => void encenderCamara()}>
                  Repetir
                </Boton>
                <Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>
                  Guardar foto
                </Boton>
              </>
            ) : (
              <Boton icono={<Camera className="size-4" />} onClick={() => void encenderCamara()}>
                Usar la cámara
              </Boton>
            )}
          </>
        ) : undefined
      }
    >
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-xl bg-superficie-2">
        <AnimatePresence mode="wait" initial={false}>
          {vistaUrl ? (
            <motion.img key="vista" src={vistaUrl} alt="" className="size-full object-contain" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} />
          ) : modo === "camara" ? (
            <motion.div key="camara" className="relative size-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
              {/* Guía: encuadrar la cédula dentro del marco. */}
              <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
            </motion.div>
          ) : url ? (
            <motion.img key="actual" src={url} alt="Cédula" className="size-full object-contain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          ) : (
            <motion.div key="vacio" className="flex flex-col items-center gap-2 text-center text-sm text-texto-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IdCard className="size-8" />
              Aún no hay foto de la cédula.
              {editable && <span className="text-xs">Tómala con la cámara o sube una imagen.</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

/** Reduce la imagen a 1600 px como máximo y la pasa a JPEG. */
async function reducir(fuente: CanvasImageSource, ancho: number, alto: number): Promise<Blob> {
  const escala = Math.min(1, 1600 / Math.max(ancho, alto));
  const c = document.createElement("canvas");
  c.width = Math.round(ancho * escala);
  c.height = Math.round(alto * escala);
  c.getContext("2d")!.drawImage(fuente, 0, 0, c.width, c.height);
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la imagen."))), "image/jpeg", 0.85));
}
