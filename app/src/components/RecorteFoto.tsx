import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Boton } from "@/components/ui/boton";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * Recorte de la foto de perfil: se arrastra para encuadrar dentro del círculo, se acerca con el
 * deslizador (o la rueda del ratón) y se gira de 90 en 90. El resultado es un JPEG cuadrado de
 * 256×256 (≈15-25 KB) que se guarda en el perfil; el avatar lo muestra redondo.
 */

const MARCO = 224;
const SALIDA = 256;
const ZOOM_MAX = 3;

export function RecorteFoto({ archivo, guardando, onCancelar, onListo }: {
  archivo: File | null;
  guardando?: boolean;
  onCancelar: () => void;
  onListo: (fotoDataUrl: string) => void;
}) {
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

  // La imagen siempre cubre el círculo: el lado corto mide lo que el marco.
  const escala = natural.ancho && natural.alto ? MARCO / Math.min(natural.ancho, natural.alto) : 1;
  const ancho = natural.ancho * escala * zoom;
  const alto = natural.alto * escala * zoom;
  const girada = giro % 180 !== 0;

  // Límite del arrastre para que no quede espacio vacío dentro del círculo.
  const limitar = useMemo(() => {
    const w = girada ? alto : ancho;
    const h = girada ? ancho : alto;
    const mx = Math.max(0, (w - MARCO) / 2);
    const my = Math.max(0, (h - MARCO) / 2);
    return (p: { x: number; y: number }) => ({ x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) });
  }, [ancho, alto, girada]);

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
    lienzo.width = lienzo.height = SALIDA;
    const ctx = lienzo.getContext("2d")!;
    const k = SALIDA / MARCO;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SALIDA, SALIDA);
    // Mismo orden que la vista previa: desplazar en pantalla, luego girar sobre el centro y escalar.
    ctx.translate(SALIDA / 2 + desplazo.x * k, SALIDA / 2 + desplazo.y * k);
    ctx.rotate((giro * Math.PI) / 180);
    ctx.scale(escala * zoom * k, escala * zoom * k);
    ctx.drawImage(img, -natural.ancho / 2, -natural.alto / 2);
    onListo(lienzo.toDataURL("image/jpeg", 0.85));
  };

  return (
    <Modal
      abierto={!!archivo}
      onCerrar={onCancelar}
      ancho="sm"
      titulo="Recortar foto"
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
            Usar foto
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
            "relative touch-none overflow-hidden rounded-full bg-superficie-2 ring-2 ring-[color-mix(in_oklab,var(--marca)_45%,transparent)] select-none",
            arrastrando ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ width: MARCO, height: MARCO }}
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
          <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/40 ring-inset" />
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
