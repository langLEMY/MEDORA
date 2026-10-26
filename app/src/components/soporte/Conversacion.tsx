import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Ellipsis,
  ImagePlus,
  Info,
  LayoutGrid,
  LifeBuoy,
  Link2,
  MailOpen,
  Pin,
  PinOff,
  Reply,
  RotateCcw,
  Search,
  SmilePlus,
  Undo2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as EventoPuntero,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { NAVEGACION, puedeVer } from "@/components/layout/navegacion";
import { Boton } from "@/components/ui/boton";
import { AreaTexto } from "@/components/ui/campos";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { EASE_SALIDA } from "@/components/ui/movimiento";
import { Avatar, Esqueleto, Insignia } from "@/components/ui/superficies";
import { GUIAS } from "@/lib/ayuda";
import { cambiarPreferencias, usePreferencias } from "@/lib/preferencias";
import {
  CATEGORIA_SOLICITUD,
  ESTADO_SOLICITUD,
  PRIORIDAD_SOLICITUD,
  RESPUESTAS_DE_FABRICA,
  TAPBACKS,
  enlaceA,
  extraerEnlaces,
  noLeida,
  useAccionesSoporte,
  useAdjuntos,
  useEscribiendo,
  useMensajes,
  useReacciones,
  type EstadoSolicitud,
  type Mensaje,
  type PrioridadSolicitud,
  type Reaccion,
  type Solicitud,
  type Tapback,
} from "@/lib/soporte";
import { mensajeError } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { soloLoPropio, useSesion, useSistema } from "@/sesion/SesionProvider";
import { Confeti } from "./Confeti";

/*
 * Conversación de soporte al estilo de Mensajes de iOS:
 *   - burbujas agrupadas por remitente, separadores de hora y «Entregado / Leído 10:42»;
 *   - «escribiendo…» con los tres puntos, en vivo (Realtime Broadcast);
 *   - tapbacks (doble clic o mantener presionado), responder a un mensaje (o deslizarlo
 *     a la derecha en pantallas táctiles) y «Deshacer envío» durante 2 minutos;
 *   - enlaces a pantallas de MEDORA que se abren con un toque, búsqueda en el hilo,
 *     respuestas rápidas para soporte (también escribiendo «/») y confeti al resolver.
 */

const AGRUPAR_MS = 3 * 60_000;
const SEPARAR_MS = 20 * 60_000;
const DESHACER_MS = 2 * 60_000;
const MAX_CAPTURA = 10 * 1024 * 1024;
const tactil = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

const horaCorta = (d: Date) => new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit" }).format(d);

/** «Hoy 10:42 a. m.», «Ayer 3:15 p. m.», «lun 20 oct 9:00 a. m.» */
function etiquetaHora(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${horaCorta(d)}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${horaCorta(d)}`;
  const dia = new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== hoy.getFullYear() && { year: "numeric" }) })
    .format(d)
    .replace(/\./g, "");
  return `${dia} ${horaCorta(d)}`;
}

/** «Leído 10:42 a. m.» (hoy) o «Leído ayer» / «Leído lun 20 oct». */
function etiquetaLeido(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return `Leído ${horaCorta(d)}`;
  return `Leído ${etiquetaHora(iso).replace(/ \d.*$/, "").toLowerCase()}`;
}

/** Avatar de Soporte MEDORA: el salvavidas sobre el color de marca. */
export function AvatarSoporte({ tamano = 28 }: { tamano?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full text-white"
      style={{ width: tamano, height: tamano, background: "linear-gradient(135deg, var(--marca), color-mix(in oklab, var(--marca) 65%, black))" }}
    >
      <LifeBuoy style={{ width: tamano * 0.55, height: tamano * 0.55 }} strokeWidth={2} />
    </span>
  );
}

/** Qué es un enlace interno: pantalla del menú, guía de Ayuda o, si no se reconoce, la ruta tal cual. */
function describirEnlace(ruta: string): { etiqueta: string; detalle: string; icono: LucideIcon } {
  const [camino, query = ""] = ruta.split("?");
  const guia = camino === "/ayuda" ? GUIAS.find((g) => g.id === new URLSearchParams(query).get("guia")) : undefined;
  if (guia) return { etiqueta: guia.titulo, detalle: "Guía de Ayuda", icono: BookOpen };
  const item = NAVEGACION.find((i) => i.ruta === ruta) ?? NAVEGACION.find((i) => i.ruta === camino);
  if (item) return { etiqueta: item.etiqueta, detalle: "Abrir en MEDORA", icono: item.icono };
  return { etiqueta: ruta, detalle: "Abrir en MEDORA", icono: LayoutGrid };
}

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Resalta lo buscado dentro del texto de una burbuja. */
function conResaltado(texto: string, consulta: string, mio: boolean): ReactNode {
  if (!consulta) return texto;
  const partes = texto.split(new RegExp(`(${escaparRe(consulta)})`, "gi"));
  return partes.map((p, i) =>
    i % 2 ? (
      <mark key={i} className={cn("rounded-[3px] px-px", mio ? "bg-white/35 text-white" : "bg-[color-mix(in_oklab,#ffd60a_55%,transparent)] text-texto")}>
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

export function Conversacion({
  solicitud,
  yo,
  agente,
  onVolver,
}: {
  solicitud: Solicitud;
  yo: string;
  agente: boolean;
  /** Volver a la lista (en pantallas angostas, y al marcar como no leída). */
  onVolver?: () => void;
}) {
  // Soporte = agente de soporte que no abrió la solicitud (puede ser también miembro del hospital).
  const comoSoporte = agente && solicitud.autor_id !== yo;
  const lado = comoSoporte ? "soporte" : "hospital";
  const navigate = useNavigate();
  const { perfil } = useSesion();
  const { roles, permisos, esSuperadmin } = useSistema();
  const { respuestasSoporte } = usePreferencias();
  const mensajes = useMensajes(solicitud.id);
  const reacciones = useReacciones(solicitud.id);
  const { responder, cambiarEstado, marcarVista, retirar, reaccionar, ajustarBandeja } = useAccionesSoporte();
  const { otroEscribe, avisar, dejoDeEscribir } = useEscribiendo(solicitud.id, lado);

  const [texto, setTexto] = useState("");
  const [captura, setCaptura] = useState<File | null>(null);
  const [respondiendo, setRespondiendo] = useState<Mensaje | null>(null);
  const [selector, setSelector] = useState<string | null>(null);
  const [destello, setDestello] = useState<string | null>(null);
  const [verInfo, setVerInfo] = useState(false);
  const [editarRespuestas, setEditarRespuestas] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [coincidencia, setCoincidencia] = useState(0);
  const [confeti, setConfeti] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const lista = useRef<HTMLDivElement>(null);
  const areaTexto = useRef<HTMLTextAreaElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const msjs = useMemo(() => mensajes.data ?? [], [mensajes.data]);
  const porId = useMemo(() => new Map(msjs.map((m) => [m.id, m])), [msjs]);
  const rutas = useMemo(() => msjs.map((m) => m.adjunto).filter((r): r is string => !!r), [msjs]);
  const adjuntos = useAdjuntos(rutas);
  const reaccionesPor = useMemo(() => {
    const mapa = new Map<string, Reaccion[]>();
    for (const r of reacciones.data ?? []) mapa.set(r.mensaje_id, [...(mapa.get(r.mensaje_id) ?? []), r]);
    return mapa;
  }, [reacciones.data]);
  const respuestas = respuestasSoporte.length ? respuestasSoporte : RESPUESTAS_DE_FABRICA;

  // El reloj de «Deshacer envío» (la opción desaparece a los 2 minutos).
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Lo que ya estaba al abrir no se anima; solo lo que llega después. (El padre monta una
  // Conversacion por solicitud con key, así que esto arranca de cero en cada una.)
  const iniciales = useRef<Set<string> | null>(null);
  if (iniciales.current === null && mensajes.data) iniciales.current = new Set(mensajes.data.map((m) => m.id));

  // Mío = de mi lado de la conversación.
  const esMio = (m: Mensaje) => (comoSoporte ? m.de_soporte : !m.de_soporte && m.autor_id === yo);
  const nombreDe = (m: Mensaje) => (esMio(m) ? "Tú" : m.de_soporte ? "Soporte MEDORA" : (m.autor?.nombre_completo ?? "Usuario"));

  // Lo que llega del otro lado: deja de «escribir» y, si resolvieron, confeti.
  const vistosEfectos = useRef(new Set<string>());
  useEffect(() => {
    const ultimo = msjs[msjs.length - 1];
    if (ultimo && !esMio(ultimo)) dejoDeEscribir();
    for (const m of msjs) {
      if (vistosEfectos.current.has(m.id)) continue;
      vistosEfectos.current.add(m.id);
      if (iniciales.current && !iniciales.current.has(m.id) && m.evento === "resuelta") setConfeti((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msjs]);

  // Al abrir o al llegar algo nuevo: marcar visto.
  const pendiente = noLeida(solicitud, yo, agente);
  useEffect(() => {
    if (pendiente && !marcarVista.isPending) marcarVista.mutate(solicitud.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud.id, pendiente, msjs.length]);

  // Siempre al final, como en Mensajes (salvo que la persona haya subido a leer o esté buscando).
  const alFinal = useRef(true);
  useLayoutEffect(() => {
    const el = lista.current;
    if (el && alFinal.current && !buscando) el.scrollTop = el.scrollHeight;
  }, [msjs.length, adjuntos.data, otroEscribe, buscando]);

  useEffect(() => {
    areaTexto.current?.focus();
  }, []);

  // La barra crece con el texto, hasta ~6 líneas.
  useLayoutEffect(() => {
    const el = areaTexto.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [texto]);

  const vistaCaptura = useMemo(() => (captura ? URL.createObjectURL(captura) : null), [captura]);
  useEffect(() => () => void (vistaCaptura && URL.revokeObjectURL(vistaCaptura)), [vistaCaptura]);

  // --- Búsqueda en el hilo -------------------------------------------------------------
  const resultados = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return [];
    return msjs.filter((m) => !m.evento && !m.retirado_en && m.texto.toLowerCase().includes(q)).map((m) => m.id);
  }, [consulta, msjs]);
  const irA = (id: string) => {
    document.getElementById(`msj-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setDestello(id);
    setTimeout(() => setDestello((d) => (d === id ? null : d)), 1400);
  };
  useEffect(() => {
    setCoincidencia(resultados.length ? resultados.length - 1 : 0);
  }, [resultados.length]);
  useEffect(() => {
    if (resultados[coincidencia]) irA(resultados[coincidencia]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coincidencia, resultados]);

  // --- Escribir y enviar ---------------------------------------------------------------
  const puedeEnviar = (texto.trim().length > 0 || !!captura) && !responder.isPending;
  const sugerencias = comoSoporte && texto.startsWith("/") ? respuestas.filter((r) => r.toLowerCase().includes(texto.slice(1).trim().toLowerCase())).slice(0, 4) : [];

  const cambiarTexto = (t: string) => {
    setTexto(t);
    avisar(t.trim().length > 0);
  };
  const insertar = (t: string, reemplazar = false) => {
    const nuevo = reemplazar || !texto.trim() ? t : `${texto.replace(/\s+$/, "")} ${t}`;
    cambiarTexto(nuevo);
    requestAnimationFrame(() => {
      const el = areaTexto.current;
      el?.focus();
      el?.setSelectionRange(nuevo.length, nuevo.length);
    });
  };

  const elegirCaptura = (f: File | null | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast.error("Solo se pueden adjuntar imágenes PNG, JPG o WebP.");
    if (f.size > MAX_CAPTURA) return toast.error("La imagen pesa más de 10 MB.");
    setCaptura(f);
  };

  const enviar = () => {
    if (!puedeEnviar) return;
    const t = texto;
    const c = captura;
    const r = respondiendo;
    setTexto("");
    setCaptura(null);
    setRespondiendo(null);
    avisar(false);
    alFinal.current = true;
    responder.mutate(
      { solicitud, texto: t, captura: c, yo, comoSoporte, respondeA: r?.id },
      {
        onError: (e) => {
          toast.error(mensajeError(e));
          setTexto(t);
          setCaptura(c);
          setRespondiendo(r);
        },
      },
    );
  };

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && sugerencias[0]) {
      e.preventDefault();
      insertar(sugerencias[0], true);
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    } else if (e.key === "Escape" && respondiendo) {
      setRespondiendo(null);
    }
  };
  const alPegar = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      elegirCaptura(img);
    }
  };

  const estado = (nuevo: EstadoSolicitud, prioridad?: PrioridadSolicitud) =>
    cambiarEstado.mutate({ solicitud: solicitud.id, estado: nuevo, prioridad }, { onError: (e) => toast.error(mensajeError(e)) });
  const tapback = (m: Mensaje, tipo: Tapback) => {
    setSelector(null);
    const actual = reaccionesPor.get(m.id)?.find((r) => (comoSoporte ? r.de_soporte : r.usuario_id === yo));
    reaccionar.mutate(
      { mensaje: m.id, solicitud: solicitud.id, tipo: actual?.tipo === tipo ? null : tipo, yo, comoSoporte },
      { onError: (e) => toast.error(mensajeError(e)) },
    );
  };
  const deshacer = (m: Mensaje) => {
    setSelector(null);
    if (respondiendo?.id === m.id) setRespondiendo(null);
    retirar.mutate({ mensaje: m.id, solicitud: solicitud.id }, { onError: (e) => toast.error(mensajeError(e)) });
  };
  const responderA = (m: Mensaje) => {
    setSelector(null);
    setRespondiendo(m);
    areaTexto.current?.focus();
  };

  // «Entregado / Leído» según lo último que abrió el otro lado.
  const vistoPorOtro = comoSoporte ? solicitud.vista_autor_en : solicitud.vista_soporte_en;
  const ultimoMio = [...msjs].reverse().find((m) => !m.evento && !m.retirado_en && esMio(m));
  const ultimoDelOtro = [...msjs].reverse().find((m) => !m.evento && !esMio(m));
  const mostrarRecibo = ultimoMio && (!ultimoDelOtro || ultimoMio.creado_en >= ultimoDelOtro.creado_en);

  const titulo = comoSoporte ? (solicitud.autor?.nombre_completo ?? "Usuario") : "Soporte MEDORA";
  const subtitulo = otroEscribe
    ? "escribiendo…"
    : comoSoporte
      ? `${solicitud.sistema?.nombre ?? ""} · #${solicitud.numero}`
      : `#${solicitud.numero} · ${ESTADO_SOLICITUD[solicitud.estado].etiqueta}`;
  const ctx = (solicitud.contexto ?? {}) as Record<string, unknown>;
  // Pantallas que tiene sentido enviarle al hospital (sin las de plataforma ni la propia Ayuda).
  const pantallas = NAVEGACION.filter((i) => !i.soloSuperadmin && i.ruta !== "/ayuda" && puedeVer(i, roles, esSuperadmin, permisos, soloLoPropio(roles)));

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <Confeti disparo={confeti} />

      {/* Encabezado translúcido, como la barra de Mensajes. */}
      <header className="relative z-10 border-b border-borde/70">
        <div aria-hidden className="absolute inset-0 -z-10 bg-superficie/80 backdrop-blur-xl backdrop-saturate-150" />
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          {onVolver && (
            <button
              type="button"
              onClick={onVolver}
              className="flex items-center gap-0.5 rounded-lg py-1 pr-2 text-[0.9375rem] font-medium text-marca-texto transition-opacity active:opacity-60 lg:hidden"
            >
              <ChevronLeft className="size-5" strokeWidth={2.4} />
              Ayuda
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {comoSoporte ? <Avatar nombre={solicitud.autor?.nombre_completo} foto={solicitud.autor?.foto} tamano={36} /> : <AvatarSoporte tamano={36} />}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[0.9375rem] leading-tight font-semibold">
                {titulo}
                {comoSoporte && solicitud.fijada_soporte && <Pin className="size-3.5 shrink-0 fill-current text-aviso" />}
              </p>
              <p className={cn("truncate text-xs", otroEscribe ? "text-marca-texto" : "text-texto-3")}>{subtitulo}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setBuscando((b) => !b);
              setConsulta("");
            }}
            title="Buscar en la conversación"
            aria-pressed={buscando}
            className={cn("grid size-9 place-items-center rounded-full text-marca-texto transition-colors hover:bg-superficie-2", buscando && "bg-superficie-2")}
          >
            <Search className="size-[18px]" />
          </button>
          {comoSoporte && (
            <button
              type="button"
              onClick={() => setVerInfo(true)}
              title="Datos de la solicitud"
              className="grid size-9 place-items-center rounded-full text-marca-texto transition-colors hover:bg-superficie-2"
            >
              <Info className="size-5" />
            </button>
          )}
          <Menu
            alinear="derecha"
            ancho={240}
            disparador={() => (
              <button type="button" title="Opciones" aria-label="Opciones" className="grid size-9 place-items-center rounded-full text-marca-texto transition-colors hover:bg-superficie-2">
                <Ellipsis className="size-5" />
              </button>
            )}
          >
            {(cerrar) => (
              <>
                {comoSoporte ? (
                  <>
                    <ItemMenu
                      icono={solicitud.fijada_soporte ? <PinOff /> : <Pin />}
                      onClick={() => (cerrar(), ajustarBandeja.mutate({ solicitud: solicitud.id, fijada: !solicitud.fijada_soporte }))}
                    >
                      {solicitud.fijada_soporte ? "Quitar de fijadas" : "Fijar arriba"}
                    </ItemMenu>
                    <ItemMenu
                      icono={<MailOpen />}
                      onClick={() => {
                        cerrar();
                        ajustarBandeja.mutate({ solicitud: solicitud.id, noLeida: true });
                        onVolver?.();
                      }}
                    >
                      Marcar como no leída
                    </ItemMenu>
                    <SeparadorMenu />
                    <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-texto-3">Estado</p>
                    {(Object.keys(ESTADO_SOLICITUD) as EstadoSolicitud[]).map((e) => (
                      <ItemMenu key={e} activo={solicitud.estado === e} onClick={() => (cerrar(), estado(e))}>
                        {ESTADO_SOLICITUD[e].etiqueta}
                      </ItemMenu>
                    ))}
                    <SeparadorMenu />
                    <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-texto-3">Prioridad</p>
                    {(Object.keys(PRIORIDAD_SOLICITUD) as PrioridadSolicitud[]).map((p) => (
                      <ItemMenu key={p} activo={solicitud.prioridad === p} onClick={() => (cerrar(), estado(solicitud.estado, p))}>
                        {PRIORIDAD_SOLICITUD[p]}
                      </ItemMenu>
                    ))}
                  </>
                ) : solicitud.estado === "resuelta" ? (
                  <ItemMenu icono={<RotateCcw />} onClick={() => (cerrar(), estado("abierta"))}>
                    Reabrir la solicitud
                  </ItemMenu>
                ) : (
                  <ItemMenu icono={<CheckCircle2 />} onClick={() => (cerrar(), estado("resuelta"))}>
                    Ya se resolvió
                  </ItemMenu>
                )}
              </>
            )}
          </Menu>
        </div>

        {/* Búsqueda en el hilo */}
        <AnimatePresence initial={false}>
          {buscando && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.18, ease: EASE_SALIDA }}
              className="flex items-center gap-2 px-3 pb-2.5"
            >
              <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-superficie-2 px-3 text-texto-3">
                <Search className="size-4 shrink-0" />
                <input
                  autoFocus
                  value={consulta}
                  onChange={(e) => setConsulta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && resultados.length) setCoincidencia((c) => (c - 1 + resultados.length) % resultados.length);
                    if (e.key === "Escape") setBuscando(false);
                  }}
                  placeholder="Buscar en esta conversación"
                  className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-3"
                />
              </label>
              <span className="w-16 shrink-0 text-center text-xs text-texto-3 tabular-nums">
                {consulta.trim() ? (resultados.length ? `${coincidencia + 1} de ${resultados.length}` : "Sin resultados") : ""}
              </span>
              <button
                type="button"
                disabled={resultados.length < 2}
                onClick={() => setCoincidencia((c) => (c - 1 + resultados.length) % resultados.length)}
                aria-label="Anterior"
                className="grid size-8 place-items-center rounded-full text-marca-texto hover:bg-superficie-2 disabled:opacity-35"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={resultados.length < 2}
                onClick={() => setCoincidencia((c) => (c + 1) % resultados.length)}
                aria-label="Siguiente"
                className="grid size-8 place-items-center rounded-full text-marca-texto hover:bg-superficie-2 disabled:opacity-35"
              >
                <ChevronDown className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hilo */}
      <div
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          alFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-4 pb-2 sm:px-5"
      >
        <div className="mb-5 text-center">
          <p className="text-[0.8125rem] font-semibold">{solicitud.asunto}</p>
          <p className="mt-0.5 text-xs text-texto-3">
            {CATEGORIA_SOLICITUD[solicitud.categoria]} · Abierta {etiquetaHora(solicitud.creado_en).toLowerCase()}
            {solicitud.prioridad !== "normal" && ` · Prioridad ${PRIORIDAD_SOLICITUD[solicitud.prioridad].toLowerCase()}`}
          </p>
        </div>

        {mensajes.isLoading ? (
          <div className="space-y-2">
            <Esqueleto className="h-10 w-2/3 rounded-[20px]" />
            <Esqueleto className="ml-auto h-10 w-1/2 rounded-[20px]" />
          </div>
        ) : (
          msjs.map((m, i) => {
            const previo = msjs[i - 1];
            const siguiente = msjs[i + 1];
            const t = new Date(m.creado_en).getTime();
            const separar = !previo || t - new Date(previo.creado_en).getTime() > SEPARAR_MS;
            const nuevo = iniciales.current !== null && !iniciales.current.has(m.id);

            if (m.evento) {
              const quien = m.de_soporte ? "Soporte MEDORA" : m.autor_id === yo ? "Tú" : nombreDe(m);
              return (
                <Fragment key={m.id}>
                  {separar && <SeparadorHora iso={m.creado_en} />}
                  <motion.p initial={nuevo ? { opacity: 0 } : false} animate={{ opacity: 1 }} className="my-3 text-center text-xs text-texto-3">
                    <b className="font-semibold text-texto-2">{quien}</b> {textoEvento(m.evento, comoSoporte)}
                  </motion.p>
                </Fragment>
              );
            }

            const mio = esMio(m);
            if (m.retirado_en) {
              return (
                <Fragment key={m.id}>
                  {separar && <SeparadorHora iso={m.creado_en} />}
                  <motion.p
                    id={`msj-${m.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn("my-2 text-xs text-texto-3 italic", mio ? "text-right" : "pl-9 text-left")}
                  >
                    {mio ? "Deshiciste el envío de un mensaje" : `${nombreDe(m)} deshizo el envío de un mensaje`}
                  </motion.p>
                </Fragment>
              );
            }

            const mismo = (o?: Mensaje) => !!o && !o.evento && !o.retirado_en && esMio(o) === mio && o.de_soporte === m.de_soporte && o.autor_id === m.autor_id;
            const conPrevio = !separar && mismo(previo) && t - new Date(previo!.creado_en).getTime() < AGRUPAR_MS;
            const conSiguiente = !!siguiente && mismo(siguiente) && new Date(siguiente.creado_en).getTime() - t < AGRUPAR_MS;
            const reacs = reaccionesPor.get(m.id) ?? [];

            return (
              <Fragment key={m.id}>
                {separar && <SeparadorHora iso={m.creado_en} />}
                {!mio && !conPrevio && <p className="mt-2 mb-0.5 ml-11 text-[0.6875rem] text-texto-3">{nombreDe(m)}</p>}
                <Burbuja
                  m={m}
                  mio={mio}
                  nuevo={nuevo}
                  conPrevio={conPrevio}
                  conSiguiente={conSiguiente}
                  avatar={!mio && !conSiguiente ? m.de_soporte ? <AvatarSoporte /> : <Avatar nombre={m.autor?.nombre_completo} foto={m.autor?.foto} tamano={28} /> : null}
                  imagen={m.vistaLocal ?? (m.adjunto ? adjuntos.data?.[m.adjunto] : undefined)}
                  citado={m.responde_a ? porId.get(m.responde_a) : undefined}
                  nombreCitado={(c) => nombreDe(c)}
                  reacciones={reacs}
                  miReaccion={reacs.find((r) => (comoSoporte ? r.de_soporte : r.usuario_id === yo))?.tipo}
                  puedeDeshacer={mio && !m.enviando && ahora - t < DESHACER_MS}
                  selectorAbierto={selector === m.id}
                  destacado={destello === m.id}
                  consulta={buscando ? consulta.trim() : ""}
                  onSelector={(abrir) => setSelector(abrir ? m.id : null)}
                  onTapback={(tipo) => tapback(m, tipo)}
                  onResponder={() => responderA(m)}
                  onDeshacer={() => deshacer(m)}
                  onAmpliar={setAmpliada}
                  onIrA={irA}
                  onAbrirEnlace={(ruta) => navigate(ruta)}
                />
                {mostrarRecibo && m.id === ultimoMio?.id && (
                  <p className="-mt-1 mb-2 pr-1 text-right text-[0.6875rem] font-medium text-texto-3">
                    {m.enviando ? "Enviando…" : vistoPorOtro && vistoPorOtro >= m.creado_en ? etiquetaLeido(vistoPorOtro) : "Entregado"}
                  </p>
                )}
              </Fragment>
            );
          })
        )}

        {/* «Escribiendo…» */}
        <AnimatePresence>
          {otroEscribe && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: EASE_SALIDA }}
              style={{ transformOrigin: "0% 100%" }}
              className="mt-1 mb-2 flex items-end gap-2"
              aria-live="polite"
            >
              <span className="w-7 shrink-0">{comoSoporte ? <Avatar nombre={solicitud.autor?.nombre_completo} foto={solicitud.autor?.foto} tamano={28} /> : <AvatarSoporte />}</span>
              <span className="flex h-9 items-center gap-1 rounded-[20px] bg-superficie-2 px-3.5" aria-label="Escribiendo">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-2 rounded-full bg-texto-3"
                    animate={{ opacity: [0.35, 1, 0.35], y: [0, -2.5, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
                  />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Barra de escritura */}
      <div className="relative border-t border-borde/70 px-3 pt-2 pb-3">
        <div aria-hidden className="absolute inset-0 -z-10 bg-superficie/80 backdrop-blur-xl" />

        {/* Respuestas rápidas al escribir «/» (soporte) */}
        <AnimatePresence>
          {sugerencias.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.18, ease: EASE_SALIDA }}
              className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5"
            >
              {sugerencias.map((r, i) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => insertar(r, true)}
                  className={cn(
                    "max-w-72 shrink-0 truncate rounded-full border px-3 py-1.5 text-xs transition-colors",
                    i === 0 ? "border-marca bg-marca-suave text-marca-texto" : "border-borde bg-superficie text-texto-2 hover:bg-superficie-2",
                  )}
                >
                  {r}
                </button>
              ))}
              <span className="shrink-0 self-center px-1 text-[0.6875rem] text-texto-3">Tab para usar la primera</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Respondiendo a… */}
        <AnimatePresence>
          {respondiendo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.18, ease: EASE_SALIDA }}
              className="mb-2 ml-12 flex items-center gap-2 rounded-xl border-l-[3px] border-marca bg-superficie-2 py-1.5 pr-1.5 pl-2.5"
            >
              <Reply className="size-4 shrink-0 text-marca-texto" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-semibold text-marca-texto">Respondiendo a {nombreDe(respondiendo) === "Tú" ? "tu mensaje" : nombreDe(respondiendo)}</p>
                <p className="truncate text-xs text-texto-2">{resumenMensaje(respondiendo)}</p>
              </div>
              <button type="button" onClick={() => setRespondiendo(null)} aria-label="No responder a este mensaje" className="grid size-7 place-items-center rounded-full text-texto-3 hover:bg-superficie hover:text-texto">
                <X className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {vistaCaptura && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: EASE_SALIDA }}
              className="relative mb-2 ml-12 inline-block"
            >
              <img src={vistaCaptura} alt="Captura por enviar" className="h-24 rounded-xl border border-borde object-cover" />
              <button
                type="button"
                onClick={() => setCaptura(null)}
                aria-label="Quitar captura"
                className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-texto text-superficie shadow-md"
              >
                <X className="size-3.5" strokeWidth={2.6} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-1.5">
          <BotonBarra titulo="Adjuntar captura" onClick={() => archivo.current?.click()}>
            <ImagePlus className="size-[18px]" />
          </BotonBarra>
          <input
            ref={archivo}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              elegirCaptura(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Menu
            alinear="izquierda"
            ancho={280}
            disparador={() => (
              <BotonBarra titulo="Enlazar una pantalla de MEDORA">
                <Link2 className="size-[18px]" />
              </BotonBarra>
            )}
          >
            {(cerrar) => (
              <>
                <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-texto-3">Pantallas</p>
                {pantallas.map((i) => (
                  <ItemMenu key={i.ruta} icono={<i.icono />} onClick={() => (cerrar(), insertar(enlaceA(i.ruta)))}>
                    {i.etiqueta}
                  </ItemMenu>
                ))}
                <SeparadorMenu />
                <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-texto-3">Guías</p>
                {GUIAS.map((g) => (
                  <ItemMenu key={g.id} icono={<BookOpen />} onClick={() => (cerrar(), insertar(enlaceA(`/ayuda?guia=${g.id}`)))}>
                    {g.titulo}
                  </ItemMenu>
                ))}
              </>
            )}
          </Menu>
          {comoSoporte && (
            <Menu
              alinear="izquierda"
              ancho={320}
              disparador={() => (
                <BotonBarra titulo="Respuestas rápidas (o escribe «/»)">
                  <Zap className="size-[18px]" />
                </BotonBarra>
              )}
            >
              {(cerrar) => (
                <>
                  <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-texto-3">Respuestas rápidas</p>
                  {respuestas.map((r) => (
                    <ItemMenu key={r} onClick={() => (cerrar(), insertar(r, true))}>
                      {r}
                    </ItemMenu>
                  ))}
                  <SeparadorMenu />
                  <ItemMenu onClick={() => (cerrar(), setEditarRespuestas(true))}>Editar respuestas…</ItemMenu>
                </>
              )}
            </Menu>
          )}
          <div className="ml-0.5 flex min-w-0 flex-1 items-end rounded-[20px] border border-borde bg-superficie pr-1 transition-[border-color,box-shadow] focus-within:border-marca focus-within:[box-shadow:0_0_0_3px_var(--anillo)]">
            <textarea
              ref={areaTexto}
              rows={1}
              value={texto}
              onChange={(e) => cambiarTexto(e.target.value)}
              onKeyDown={alTeclear}
              onPaste={alPegar}
              onBlur={() => avisar(false)}
              maxLength={4000}
              placeholder={solicitud.estado === "resuelta" ? "Escribe para reabrirla" : comoSoporte ? "Mensaje (escribe / para respuestas rápidas)" : "Mensaje"}
              aria-label="Mensaje"
              className="max-h-[132px] min-h-9 flex-1 resize-none bg-transparent py-2 pl-3.5 text-[0.9375rem] leading-snug text-texto outline-none placeholder:text-texto-3"
            />
            <AnimatePresence initial={false}>
              {puedeEnviar && (
                <motion.button
                  type="button"
                  onClick={enviar}
                  aria-label="Enviar"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.1 } }}
                  transition={{ type: "spring", duration: 0.28, bounce: 0.3 }}
                  whileTap={{ scale: 0.9 }}
                  className="mb-1 grid size-7 shrink-0 place-items-center rounded-full bg-marca text-white"
                >
                  <ArrowUp className="size-4" strokeWidth={2.8} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
        {!comoSoporte && <p className="mt-1.5 text-center text-[0.6875rem] text-texto-3">No escribas datos de pacientes. Las cédulas y teléfonos se ocultan solos.</p>}
      </div>

      {/* Datos que se adjuntaron solos (solo soporte). */}
      <Modal abierto={verInfo} onCerrar={() => setVerInfo(false)} titulo={`Solicitud #${solicitud.numero}`} descripcion={solicitud.sistema?.nombre}>
        <dl className="divide-y divide-borde/70 px-6 py-2 text-sm">
          {[
            ["Persona", solicitud.autor?.nombre_completo],
            ["Categoría", CATEGORIA_SOLICITUD[solicitud.categoria]],
            ["Prioridad", PRIORIDAD_SOLICITUD[solicitud.prioridad]],
            ["Estado", <Insignia key="e" tono={ESTADO_SOLICITUD[solicitud.estado].tono}>{ESTADO_SOLICITUD[solicitud.estado].etiqueta}</Insignia>],
            ["Versión", ctx.version],
            ["Pantalla", ctx.pantalla],
            ["Roles", Array.isArray(ctx.roles) ? (ctx.roles as string[]).join(", ") : null],
            ["Sede", ctx.sede],
            ["Equipo", ctx.entorno ? `${ctx.entorno} · ${ctx.pantalla_px ?? ""}` : null],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-texto-2">{k as ReactNode}</dt>
                <dd className="text-right font-medium">{v as ReactNode}</dd>
              </div>
            ))}
        </dl>
        {Array.isArray(ctx.errores) && ctx.errores.length > 0 && (
          <div className="px-6 pb-5">
            <p className="mb-2 text-xs font-medium text-texto-3">Errores recientes en su sesión</p>
            <ul className="space-y-1.5">
              {(ctx.errores as { tipo: string; mensaje: string; pantalla: string }[]).map((e, i) => (
                <li key={i} className="rounded-xl bg-superficie-2 px-3 py-2 font-mono text-xs break-words text-texto-2">
                  <b className="text-texto">{e.tipo}</b> en {e.pantalla}: {e.mensaje}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <EditarRespuestas abierto={editarRespuestas} onCerrar={() => setEditarRespuestas(false)} actuales={respuestas} usuarioId={perfil?.id} />

      <Modal abierto={!!ampliada} onCerrar={() => setAmpliada(null)} titulo="Captura" ancho="xl">
        {ampliada && <img src={ampliada} alt="Captura adjunta" className="mx-auto block max-h-[70vh] max-w-full p-4" />}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Burbuja
// ---------------------------------------------------------------------------

function resumenMensaje(m: Mensaje) {
  if (m.retirado_en) return "Mensaje retirado";
  const { texto, rutas } = extraerEnlaces(m.texto);
  if (texto) return texto;
  if (rutas.length) return `🔗 ${describirEnlace(rutas[0]).etiqueta}`;
  return m.adjunto || m.vistaLocal ? "📷 Captura" : "";
}

function Burbuja({
  m,
  mio,
  nuevo,
  conPrevio,
  conSiguiente,
  avatar,
  imagen,
  citado,
  nombreCitado,
  reacciones,
  miReaccion,
  puedeDeshacer,
  selectorAbierto,
  destacado,
  consulta,
  onSelector,
  onTapback,
  onResponder,
  onDeshacer,
  onAmpliar,
  onIrA,
  onAbrirEnlace,
}: {
  m: Mensaje;
  mio: boolean;
  nuevo: boolean;
  conPrevio: boolean;
  conSiguiente: boolean;
  avatar: ReactNode;
  imagen?: string;
  citado?: Mensaje;
  nombreCitado: (m: Mensaje) => string;
  reacciones: Reaccion[];
  miReaccion?: Tapback;
  puedeDeshacer: boolean;
  selectorAbierto: boolean;
  destacado: boolean;
  consulta: string;
  onSelector: (abrir: boolean) => void;
  onTapback: (t: Tapback) => void;
  onResponder: () => void;
  onDeshacer: () => void;
  onAmpliar: (url: string) => void;
  onIrA: (id: string) => void;
  onAbrirEnlace: (ruta: string) => void;
}) {
  const { texto, rutas } = useMemo(() => extraerEnlaces(m.texto), [m.texto]);
  const presion = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicio = useRef({ x: 0, y: 0 });
  const enTactil = useMemo(tactil, []);
  const selectorRef = useRef<HTMLDivElement>(null);

  // El selector se cierra al tocar fuera o con Escape. (Una capa «fixed» no sirve aquí: la
  // burbuja tiene transform por su animación y el fixed quedaría encerrado en ella.)
  useEffect(() => {
    if (!selectorAbierto) return;
    const fuera = (e: PointerEvent) => !selectorRef.current?.contains(e.target as Node) && onSelector(false);
    const tecla = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onSelector(false);
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera, true);
      document.removeEventListener("keydown", tecla);
    };
  }, [selectorAbierto, onSelector]);

  // Mantener presionado (táctil) abre los tapbacks, como en Mensajes.
  const alPresionar = (e: EventoPuntero) => {
    if (e.pointerType !== "touch" || m.enviando) return;
    inicio.current = { x: e.clientX, y: e.clientY };
    presion.current = setTimeout(() => onSelector(true), 450);
  };
  const cancelarPresion = (e?: EventoPuntero) => {
    if (e && presion.current && Math.hypot(e.clientX - inicio.current.x, e.clientY - inicio.current.y) < 8) return;
    if (presion.current) clearTimeout(presion.current);
    presion.current = null;
  };

  const agrupadas = TAPBACKS.filter((t) => reacciones.some((r) => r.tipo === t.tipo));
  const esquinas = mio ? [conPrevio && "rounded-tr-md", conSiguiente && "rounded-br-md"] : [conPrevio && "rounded-tl-md", conSiguiente && "rounded-bl-md"];

  return (
    <motion.div
      id={`msj-${m.id}`}
      initial={nuevo ? { opacity: 0, y: 10, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: EASE_SALIDA }}
      style={{ transformOrigin: mio ? "100% 100%" : "0% 100%" }}
      className={cn("group/msj relative flex items-end gap-2", mio ? "justify-end" : "justify-start", conSiguiente ? "mb-0.5" : "mb-2", agrupadas.length > 0 && "mt-3")}
    >
      {!mio && <span className="w-7 shrink-0">{avatar}</span>}

      {/* Acciones al pasar el mouse: reaccionar, responder y deshacer el envío. */}
      {!m.enviando && (
        <div
          className={cn(
            "flex items-center gap-0.5 self-center opacity-0 transition-opacity duration-150 group-hover/msj:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:hidden",
            mio ? "order-first" : "order-last",
          )}
        >
          <AccionBurbuja titulo="Reaccionar" onClick={() => onSelector(!selectorAbierto)}>
            <SmilePlus className="size-4" />
          </AccionBurbuja>
          <AccionBurbuja titulo="Responder" onClick={onResponder}>
            <Reply className="size-4" />
          </AccionBurbuja>
          {puedeDeshacer && (
            <AccionBurbuja titulo="Deshacer envío" onClick={onDeshacer}>
              <Undo2 className="size-4" />
            </AccionBurbuja>
          )}
        </div>
      )}

      <motion.div
        // Deslizar a la derecha para responder (pantallas táctiles), como en Mensajes.
        drag={enTactil && !m.enviando ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.45 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => info.offset.x > 56 && onResponder()}
        onPointerDown={alPresionar}
        onPointerMove={cancelarPresion}
        onPointerUp={() => cancelarPresion()}
        onPointerCancel={() => cancelarPresion()}
        onDoubleClick={() => !m.enviando && onSelector(true)}
        onContextMenu={(e) => enTactil && e.preventDefault()}
        className={cn("relative flex max-w-[78%] touch-pan-y flex-col gap-0.5 select-text sm:max-w-[68%]", mio ? "items-end" : "items-start")}
      >
        {/* Selector de tapbacks */}
        <AnimatePresence>
          {selectorAbierto && (
            <>
              <motion.div
                ref={selectorRef}
                role="menu"
                aria-label="Reaccionar"
                initial={{ opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
                transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                style={{ transformOrigin: mio ? "100% 100%" : "0% 100%" }}
                className={cn(
                  "absolute bottom-full z-40 mb-2 flex gap-0.5 rounded-full border border-borde/70 bg-[color-mix(in_oklab,var(--superficie)_90%,transparent)] p-1 shadow-lg backdrop-blur-xl",
                  mio ? "right-0" : "left-0",
                )}
              >
                {TAPBACKS.map((t) => (
                  <button
                    key={t.tipo}
                    type="button"
                    role="menuitem"
                    title={t.nombre}
                    aria-label={t.nombre}
                    aria-pressed={miReaccion === t.tipo}
                    onClick={() => onTapback(t.tipo)}
                    className={cn(
                      "grid size-9 place-items-center rounded-full text-[1.15rem] transition-transform duration-150 hover:scale-110 active:scale-95",
                      miReaccion === t.tipo && "bg-marca",
                    )}
                  >
                    {t.emoji}
                  </button>
                ))}
                {enTactil && (
                  <>
                    <span className="mx-0.5 w-px self-stretch bg-borde" />
                    <button type="button" title="Responder" onClick={onResponder} className="grid size-9 place-items-center rounded-full text-marca-texto">
                      <Reply className="size-[18px]" />
                    </button>
                    {puedeDeshacer && (
                      <button type="button" title="Deshacer envío" onClick={onDeshacer} className="grid size-9 place-items-center rounded-full text-marca-texto">
                        <Undo2 className="size-[18px]" />
                      </button>
                    )}
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Tapbacks recibidos: en la esquina superior, del lado opuesto al remitente. */}
        {agrupadas.length > 0 && (
          <button
            type="button"
            onClick={() => onSelector(true)}
            title={agrupadas.map((t) => t.nombre).join(", ")}
            className={cn(
              "absolute -top-3.5 z-10 flex h-6 items-center gap-px rounded-full border-2 border-superficie px-1.5 text-[0.8125rem] leading-none shadow-sm",
              mio ? "-left-3" : "-right-3",
              miReaccion ? "bg-marca" : "bg-superficie-2",
            )}
          >
            {agrupadas.slice(0, 3).map((t) => (
              <span key={t.tipo}>{t.emoji}</span>
            ))}
            {reacciones.length > 1 && <span className={cn("ml-0.5 text-[0.6875rem] font-semibold", miReaccion ? "text-white" : "text-texto-2")}>{reacciones.length}</span>}
          </button>
        )}

        {/* Mensaje al que responde */}
        {citado && (
          <button
            type="button"
            onClick={() => onIrA(citado.id)}
            className={cn(
              "max-w-full rounded-2xl border-l-[3px] px-2.5 py-1.5 text-left text-xs transition-opacity hover:opacity-80",
              mio ? "border-marca bg-marca-suave text-texto-2" : "border-texto-3 bg-superficie-2/70 text-texto-2",
            )}
          >
            <span className="block font-semibold text-texto">{nombreCitado(citado)}</span>
            <span className="line-clamp-2">{resumenMensaje(citado)}</span>
          </button>
        )}

        {(m.adjunto || m.vistaLocal) && (
          <button type="button" onClick={() => imagen && onAmpliar(imagen)} className={cn("overflow-hidden rounded-[18px] bg-superficie-2", m.enviando && "opacity-70")}>
            {imagen ? (
              <img src={imagen} alt="Captura adjunta" draggable={false} className="block max-h-72 max-w-full object-cover sm:max-w-[280px]" />
            ) : (
              <Esqueleto className="h-40 w-56 rounded-[18px]" />
            )}
          </button>
        )}

        {texto && (
          <div
            className={cn(
              "rounded-[20px] px-3.5 py-2 text-[0.9375rem] leading-snug break-words whitespace-pre-wrap transition-shadow duration-300",
              mio ? "bg-marca text-white" : "bg-superficie-2 text-texto",
              esquinas,
              m.enviando && "opacity-70",
              destacado && "ring-4 ring-[color-mix(in_oklab,#ffd60a_60%,transparent)]",
            )}
          >
            {conResaltado(texto, consulta, mio)}
          </div>
        )}

        {/* Enlaces a pantallas de MEDORA, como la vista previa de enlaces de Mensajes. */}
        {rutas.map((ruta) => {
          const { etiqueta, detalle, icono: Icono } = describirEnlace(ruta);
          return (
            <button
              key={ruta}
              type="button"
              onClick={() => onAbrirEnlace(ruta)}
              className="flex w-64 max-w-full items-center gap-3 overflow-hidden rounded-[18px] border border-borde bg-superficie px-3 py-2.5 text-left shadow-sm transition-[transform,background-color] duration-150 hover:bg-superficie-2 active:scale-[0.98]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca-texto">
                <Icono className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-texto">{etiqueta}</span>
                <span className="block truncate text-xs text-texto-3">{detalle}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-texto-3" />
            </button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

function AccionBurbuja({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} className="grid size-7 place-items-center rounded-full text-texto-3 transition-colors hover:bg-superficie-2 hover:text-texto">
      {children}
    </button>
  );
}

function BotonBarra({ titulo, onClick, children }: { titulo: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-superficie-2 text-texto-2 transition-[transform,color] duration-150 hover:text-texto active:scale-95"
    >
      {children}
    </button>
  );
}

/** Respuestas rápidas de soporte: una por línea, guardadas en las preferencias del perfil. */
function EditarRespuestas({ abierto, onCerrar, actuales, usuarioId }: { abierto: boolean; onCerrar: () => void; actuales: string[]; usuarioId?: string }) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    if (abierto) setTexto(actuales.join("\n"));
  }, [abierto, actuales]);
  const guardar = () => {
    const lineas = texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    cambiarPreferencias({ respuestasSoporte: lineas }, usuarioId);
    toast.success("Respuestas rápidas guardadas.");
    onCerrar();
  };
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Respuestas rápidas"
      descripcion="Una por línea. Aparecen en el botón ⚡ y al escribir «/» en una conversación."
      pie={
        <div className="flex justify-between gap-2">
          <Boton variante="fantasma" onClick={() => setTexto(RESPUESTAS_DE_FABRICA.join("\n"))}>
            Restaurar las de fábrica
          </Boton>
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton onClick={guardar}>Guardar</Boton>
          </div>
        </div>
      }
    >
      <div className="px-6 py-5">
        <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} aria-label="Respuestas rápidas, una por línea" />
      </div>
    </Modal>
  );
}

/** Lo que dice el hilo cuando cambia el estado («Soporte MEDORA marcó la solicitud como resuelta»). */
function textoEvento(e: EstadoSolicitud, veSoporte: boolean) {
  if (e === "esperando_respuesta") return veSoporte ? "quedó esperando una respuesta" : "espera tu respuesta";
  return ESTADO_SOLICITUD[e].evento;
}

function SeparadorHora({ iso }: { iso: string }) {
  return <p className="my-3 text-center text-[0.6875rem] font-medium text-texto-3">{etiquetaHora(iso)}</p>;
}
