import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Boton } from "@/components/ui/boton";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * Recorte de imágenes del perfil: se arrastra para encuadrar, se acerca con el deslizador (o la
 * rueda del ratón) y se gira de 90 en 90.
 *   - «circulo» (foto): JPEG cuadrado de 256×256 (≈15-25 KB); el avatar lo muestra redondo.
 *   - «portada» (banner): JPEG 3:1 de 1200×400, comprimido hasta que quepa en el perfil.
 */

const FORMAS = {
  circulo: { marco: { w: 224, h: 224 }, salida: { w: 256, h: 256 }, titulo: "Recortar foto", boton: "Usar foto" },
  portada: { marco: { w: 360, h: 120 }, salida: { w: 1200, h: 400 }, titulo: "Recortar portada", boton: "Usar portada" },
} as const;
const ZOOM_MAX = 3;
/** Tope del data URL de la portada (perfiles.portada lo exige en la base). */
const MAX_PORTADA = 380_000;

export function RecorteFoto({ archivo, guardando, onCancelar, onListo, forma = "circulo" }: {
  archivo: File | null;
  guardando?: boolean;
  onCancelar: () => void;
  onListo: (fotoDataUrl: string) => void;
  forma?: keyof typeof FORMAS;
}) {
  const { marco: MARCO, salida: SALIDA, titulo, boton } = FORMAS[forma];
  const redonda = forma === "circulo";
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState({ ancho: 0, alto: 0 });
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  const [desplazo, setDesplazo] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imagen = useRef<HTMLImageElement | null>(null);

  // Cada archivo nuevo empieza centrado y sin zoom.
  useEffect(() => {
    if (!archivo) return;
    const u = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      imagen.current = img;
      setNatural({ ancho: img.naturalWidth, alto: img.naturalHeight });
      setUrl(u);
    };
    img.src = u;
    setZoom(1);
    setGiro(0);
    setDesplazo({ x: 0, y: 0 });
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [archivo]);

  // La imagen siempre cubre el marco por completo.
  const escala = natural.ancho && natural.alto ? Math.max(MARCO.w / natural.ancho, MARCO.h / natural.alto) : 1;
  const ancho = natural.ancho * escala * zoom;
  const alto = natural.alto * escala * zoom;
  const girada = giro % 180 !== 0;

  // Límite del arrastre para que no quede espacio vacío dentro del marco.
  const limitar = useMemo(() => {
    const w = girada ? alto : ancho;
    const h = girada ? ancho : alto;
    const mx = Math.max(0, (w - MARCO.w) / 2);
    const my = Math.max(0, (h - MARCO.h) / 2);
    return (p: { x: number; y: number }) => ({ x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) });
  }, [ancho, alto, girada, MARCO]);

  useEffect(() => setDesplazo((d) => limitar(d)), [limitar]);

  const bajar = (e: PointerEvent<HTMLDivElement>) => {
    inicio.current = { x: e.clientX, y: e.clientY, ox: desplazo.x, oy: desplazo.y };
    setArrastrando(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (!inicio.current) return;
    setDesplazo(limitar({ x: inicio.current.ox + e.clientX - inicio.current.x, y: inicio.current.oy + e.clientY - inicio.current.y }));
  };
  const soltar = () => {
    inicio.current = null;
    setArrastrando(false);
  };
  const rueda = (e: WheelEvent<HTMLDivElement>) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(1, z - e.deltaY * 0.0015)));

  const usar = () => {
    const img = imagen.current;
    if (!img) return;
    const lienzo = document.createElement("canvas");
    lienzo.width = SALIDA.w;
    lienzo.height = SALIDA.h;
    const ctx = lienzo.getContext("2d")!;
    const k = SALIDA.w / MARCO.w;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SALIDA.w, SALIDA.h);
    // Mismo orden que la vista previa: desplazar en pantalla, luego girar sobre el centro y escalar.
    ctx.translate(SALIDA.w / 2 + desplazo.x * k, SALIDA.h / 2 + desplazo.y * k);
    ctx.rotate((giro * Math.PI) / 180);
    ctx.scale(escala * zoom * k, escala * zoom * k);
    ctx.drawImage(img, -natural.ancho / 2, -natural.alto / 2);
    if (redonda) return onListo(lienzo.toDataURL("image/jpeg", 0.85));
    // La portada baja de calidad hasta caber (una foto con mucho detalle pesa más).
    let calidad = 0.82;
    let datos = lienzo.toDataURL("image/jpeg", calidad);
    while (datos.length > MAX_PORTADA && calidad > 0.4) {
      calidad -= 0.08;
      datos = lienzo.toDataURL("image/jpeg", calidad);
    }
    onListo(datos);
  };

  return (
    <Modal
      abierto={!!archivo}
      onCerrar={onCancelar}
      ancho={redonda ? "sm" : "md"}
      titulo={titulo}
      descripcion="Arrastra para encuadrar y acerca con el deslizador."
      pie={
        <>
          <Boton variante="secundario" icono={<RotateCw className="size-4" />} onClick={() => setGiro((g) => (g + 90) % 360)} className="mr-auto">
            Girar
          </Boton>
          <Boton variante="fantasma" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={usar} cargando={guardando} disabled={!url}>
            {boton}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-5">
        <div
          onPointerDown={bajar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onWheel={rueda}
          className={cn(
            "relative max-w-full touch-none overflow-hidden bg-superficie-2 ring-2 ring-[color-mix(in_oklab,var(--marca)_45%,transparent)] select-none",
            redonda ? "rounded-full" : "rounded-2xl",
            arrastrando ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ width: MARCO.w, height: MARCO.h }}
          aria-label="Área de recorte: arrastra para encuadrar"
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: ancho,
                height: alto,
                transform: `translate(-50%, -50%) translate(${desplazo.x}px, ${desplazo.y}px) rotate(${giro}deg)`,
                transition: arrastrando ? "none" : "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          )}
          <div className={cn("pointer-events-none absolute inset-0 ring-1 ring-white/40 ring-inset", redonda ? "rounded-full" : "rounded-2xl")} />
        </div>

        <label className="flex w-full max-w-64 items-center gap-3">
          <ZoomOut className="size-4 shrink-0 text-texto-3" />
          <input
            type="range"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Acercar"
            className="h-1.5 w-full cursor-pointer accent-[var(--marca)]"
          />
          <ZoomIn className="size-4 shrink-0 text-texto-3" />
        </label>
      </div>
    </Modal>
  );
}
