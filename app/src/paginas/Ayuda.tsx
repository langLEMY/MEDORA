import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Lightbulb, MailOpen, MessageCircle, MessageSquarePlus, Pin, PinOff, RotateCcw, Search, TriangleAlert, UserRound } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AvatarSoporte, Conversacion } from "@/components/soporte/Conversacion";
import { NuevaSolicitud } from "@/components/soporte/NuevaSolicitud";
import { Boton } from "@/components/ui/boton";
import { Segmentado } from "@/components/ui/campos";
import { EASE_SALIDA } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { buscarGuias, guiasPara, GUIAS, type Guia } from "@/lib/ayuda";
import { ESTADO_SOLICITUD, PRIORIDAD_SOLICITUD, extraerEnlaces, noLeida, useAccionesSoporte, useAgenteSoporte, useSolicitudes, type CategoriaSolicitud, type Solicitud } from "@/lib/soporte";
import { mensajeError } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

/*
 * Ayuda: guías según la pantalla de la que se viene y las conversaciones con
 * Soporte MEDORA. En pantallas anchas, lista a la izquierda y detalle a la
 * derecha (como Mensajes en el iPad); en angostas, una cosa a la vez.
 *
 *   ?desde=/caja      pantalla de la que se abrió (guías sugeridas y contexto)
 *   ?solicitud=<id>   conversación abierta
 *   ?guia=<id>        guía abierta
 *   ?nueva=1          hoja para escribir a soporte
 */

type Filtro = "pendientes" | "abiertas" | "resueltas" | "todas";

const ICONO_CATEGORIA: Record<CategoriaSolicitud, { icono: typeof CircleHelp; color: string }> = {
  duda: { icono: CircleHelp, color: "#0a84ff" },
  problema: { icono: TriangleAlert, color: "#ff9f0a" },
  sugerencia: { icono: Lightbulb, color: "#bf5af2" },
  cuenta: { icono: UserRound, color: "#30b0c7" },
};

/** Hora corta de la lista: «10:42 a. m.», «Ayer», «lun», «20/10/26». */
function horaLista(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const dias = Math.floor((new Date(hoy.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (dias === 0) return new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit" }).format(d);
  if (dias === 1) return "Ayer";
  if (dias < 7) return new Intl.DateTimeFormat("es-DO", { weekday: "long" }).format(d);
  return new Intl.DateTimeFormat("es-DO", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
}

export default function Ayuda() {
  const { sesion } = useSesion();
  const { sistemaId } = useSistema();
  const agente = useAgenteSoporte();
  const yo = sesion?.user.id ?? "";
  const [params, setParams] = useSearchParams();
  const desde = params.get("desde") ?? "/";
  const abierta = params.get("solicitud");
  const guiaId = params.get("guia");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [asuntoNueva, setAsuntoNueva] = useState<string | undefined>();

  const solicitudes = useSolicitudes(sistemaId, agente);
  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };
  const abrirSolicitud = (id: string) => ir({ solicitud: id, guia: null, nueva: null });
  const abrirGuia = (id: string) => ir({ guia: id, solicitud: null });
  const volver = () => ir({ guia: null, solicitud: null });
  const nueva = (asunto?: string) => {
    setAsuntoNueva(asunto);
    ir({ nueva: "1" });
  };

  // Bandeja de soporte: lo que escribieron los hospitales; el resto, sus solicitudes.
  const lista = useMemo(() => {
    const todas = solicitudes.data ?? [];
    const q = busqueda.trim().toLowerCase();
    return todas.filter((s) => {
      if (q && !`${s.asunto} ${s.numero} ${s.autor?.nombre_completo ?? ""} ${s.sistema?.nombre ?? ""}`.toLowerCase().includes(q)) return false;
      if (!agente) return true;
      if (filtro === "pendientes") return s.estado !== "resuelta" && !s.ultimo_de_soporte;
      if (filtro === "abiertas") return s.estado !== "resuelta";
      if (filtro === "resueltas") return s.estado === "resuelta";
      return true;
    });
  }, [solicitudes.data, busqueda, filtro, agente]);
  // En la bandeja de soporte, las fijadas van arriba (como en Mensajes).
  const fijadas = agente ? lista.filter((s) => s.fijada_soporte) : [];
  const resto = agente ? lista.filter((s) => !s.fijada_soporte) : lista;

  const sugeridas = guiasPara(desde);
  const guias = busqueda ? buscarGuias(busqueda) : GUIAS.filter((g) => !sugeridas.includes(g));
  const actual = solicitudes.data?.find((s) => s.id === abierta) ?? null;
  const guia = GUIAS.find((g) => g.id === guiaId) ?? null;
  const hayDetalle = !!(abierta || guia);

  return (
    <>
      <EncabezadoPagina
        titulo="Ayuda"
        descripcion={agente ? "Las solicitudes de todos los hospitales y las guías de MEDORA." : "Guías rápidas y conversación directa con Soporte MEDORA."}
        acciones={
          !agente && (
            <Boton icono={<MessageSquarePlus className="size-4" />} onClick={() => nueva()}>
              Escribir a soporte
            </Boton>
          )
        }
      />

      <div className="grid gap-4 lg:h-[calc(100dvh-12.5rem)] lg:min-h-[540px] lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* Lista */}
        <div className={cn("min-h-0 space-y-5 overflow-y-auto lg:pr-1", hayDetalle && "hidden lg:block")}>
          <label className="flex h-10 items-center gap-2 rounded-xl bg-superficie-2 px-3 text-texto-3 focus-within:ring-2 focus-within:ring-anillo">
            <Search className="size-4 shrink-0" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={agente ? "Buscar solicitudes o guías" : "Buscar en la ayuda"}
              className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-3"
            />
          </label>

          {agente && (
            <Segmentado
              id="ayuda-filtro"
              valor={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: "pendientes", etiqueta: "Por responder" },
                { valor: "abiertas", etiqueta: "Abiertas" },
                { valor: "resueltas", etiqueta: "Resueltas" },
                { valor: "todas", etiqueta: "Todas" },
              ]}
            />
          )}

          {fijadas.length > 0 && (
            <Grupo titulo="Fijadas">
              {fijadas.map((s) => (
                <FilaSolicitud key={s.id} s={s} yo={yo} agente={agente} activa={s.id === abierta} onClick={() => abrirSolicitud(s.id)} />
              ))}
            </Grupo>
          )}

          <Grupo titulo={agente ? "Solicitudes" : "Tus conversaciones"}>
            {solicitudes.isLoading ? (
              <div className="space-y-3 p-4">
                <Esqueleto className="h-10" />
                <Esqueleto className="h-10" />
              </div>
            ) : resto.length === 0 && fijadas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                <AvatarSoporte tamano={44} />
                <p className="text-sm font-medium">{agente ? "Nada por aquí" : "Sin conversaciones todavía"}</p>
                <p className="text-xs text-texto-3">
                  {agente ? "No hay solicitudes con este filtro." : "Si algo no funciona o tienes una duda, escríbenos y te respondemos aquí."}
                </p>
                {!agente && (
                  <Boton tamano="sm" variante="suave" className="mt-1" onClick={() => nueva()}>
                    Escribir a soporte
                  </Boton>
                )}
              </div>
            ) : (
              resto.map((s) => <FilaSolicitud key={s.id} s={s} yo={yo} agente={agente} activa={s.id === abierta} onClick={() => abrirSolicitud(s.id)} />)
            )}
          </Grupo>

          {!busqueda && sugeridas.length > 0 && (
            <Grupo titulo="Para esta pantalla">
              {sugeridas.map((g) => (
                <FilaGuia key={g.id} g={g} activa={g.id === guiaId} onClick={() => abrirGuia(g.id)} />
              ))}
            </Grupo>
          )}
          <Grupo titulo={busqueda ? "Guías encontradas" : "Todas las guías"}>
            {guias.length ? (
              guias.map((g) => <FilaGuia key={g.id} g={g} activa={g.id === guiaId} onClick={() => abrirGuia(g.id)} />)
            ) : (
              <p className="px-4 py-5 text-center text-sm text-texto-3">Ninguna guía habla de eso.</p>
            )}
          </Grupo>
        </div>

        {/* Detalle */}
        <Tarjeta className={cn("min-h-[70dvh] overflow-hidden lg:min-h-0", !hayDetalle && "hidden lg:block")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={abierta ?? guia?.id ?? "vacio"}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.22, ease: EASE_SALIDA }}
              className="h-full"
            >
              {abierta ? (
                actual ? (
                  <Conversacion key={actual.id} solicitud={actual} yo={yo} agente={agente} onVolver={volver} />
                ) : solicitudes.isLoading ? (
                  <div className="p-6">
                    <Esqueleto className="h-12" />
                  </div>
                ) : (
                  <Vacio icono={<MessageCircle />} titulo="No encontramos esa conversación" descripcion="Puede que ya no tengas acceso a ella." />
                )
              ) : guia ? (
                <DetalleGuia g={guia} onVolver={volver} onPreguntar={agente ? undefined : () => nueva(guia.titulo)} />
              ) : (
                <div className="grid h-full place-items-center p-8">
                  <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                    <AvatarSoporte tamano={56} />
                    <p className="text-[1.0625rem] font-semibold tracking-[-0.02em]">{agente ? "Bandeja de soporte" : "¿En qué te ayudamos?"}</p>
                    <p className="text-sm text-texto-3">
                      {agente
                        ? "Elige una solicitud para responderla. Tus respuestas salen firmadas como Soporte MEDORA."
                        : "Revisa una guía o escríbenos: te respondemos en esta misma pantalla."}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Tarjeta>
      </div>

      {!agente && (
        <NuevaSolicitud
          abierto={params.get("nueva") === "1"}
          onCerrar={() => ir({ nueva: null })}
          onCreada={(id) => abrirSolicitud(id)}
          pantalla={desde}
          asuntoInicial={asuntoNueva}
        />
      )}
    </>
  );
}

/** Lista agrupada al estilo de Ajustes de iOS: título pequeño encima y filas separadas por líneas finas. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-4 text-[0.75rem] font-medium tracking-wide text-texto-3 uppercase">{titulo}</h2>
      <Tarjeta className="divide-y divide-borde/70 overflow-hidden">{children}</Tarjeta>
    </section>
  );
}

/** Vista previa del último mensaje en la lista. */
function previaDe(u: Solicitud["ultimo"]) {
  if (!u) return "";
  if (u.retirado_en) return "Se deshizo el envío de un mensaje";
  if (u.evento) return ESTADO_SOLICITUD[u.evento as keyof typeof ESTADO_SOLICITUD]?.etiqueta ?? "";
  const { texto, rutas } = extraerEnlaces(u.texto);
  if (texto) return texto;
  if (rutas.length) return "🔗 Enlace a una pantalla de MEDORA";
  return u.adjunto ? "📷 Captura" : "";
}

const ANCHO_ACCION = 76;

/**
 * Fila de conversación. En pantallas táctiles se desliza a la izquierda para mostrar sus
 * acciones, como en Mensajes y Mail: soporte fija o marca como no leída; quien la abrió la
 * da por resuelta o la reabre.
 */
function FilaSolicitud({ s, yo, agente, activa, onClick }: { s: Solicitud; yo: string; agente: boolean; activa: boolean; onClick: () => void }) {
  const { ajustarBandeja, cambiarEstado } = useAccionesSoporte();
  const comoSoporte = agente && s.autor_id !== yo;
  const tactil = useMemo(() => window.matchMedia("(pointer: coarse)").matches, []);
  const x = useMotionValue(0);
  const arrastrando = useRef(false);
  const acciones: { etiqueta: string; icono: ReactNode; color: string; hacer: () => void }[] = comoSoporte
    ? [
        {
          etiqueta: s.fijada_soporte ? "Soltar" : "Fijar",
          icono: s.fijada_soporte ? <PinOff className="size-5" /> : <Pin className="size-5" />,
          color: "#ff9f0a",
          hacer: () => ajustarBandeja.mutate({ solicitud: s.id, fijada: !s.fijada_soporte }),
        },
        {
          etiqueta: "No leída",
          icono: <MailOpen className="size-5" />,
          color: "#0a84ff",
          hacer: () => ajustarBandeja.mutate({ solicitud: s.id, noLeida: true }),
        },
      ]
    : s.autor_id === yo
      ? [
          s.estado === "resuelta"
            ? {
                etiqueta: "Reabrir",
                icono: <RotateCcw className="size-5" />,
                color: "#0a84ff",
                hacer: () => cambiarEstado.mutate({ solicitud: s.id, estado: "abierta" }, { onError: (e) => toast.error(mensajeError(e)) }),
              }
            : {
                etiqueta: "Resuelta",
                icono: <CheckCircle2 className="size-5" />,
                color: "#30d158",
                hacer: () => cambiarEstado.mutate({ solicitud: s.id, estado: "resuelta" }, { onError: (e) => toast.error(mensajeError(e)) }),
              },
        ]
      : [];
  const abierto = -ANCHO_ACCION * acciones.length;
  const cerrar = () => void animate(x, 0, { type: "spring", duration: 0.3, bounce: 0 });

  const fila = <FilaContenido s={s} yo={yo} agente={agente} activa={activa} />;
  if (!tactil || !acciones.length)
    return (
      <button type="button" onClick={onClick} className={cn("relative block w-full text-left transition-colors", activa ? "bg-marca-suave" : "hover:bg-superficie-2/70 active:bg-superficie-2")}>
        {fila}
      </button>
    );

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex">
        {acciones.map((a) => (
          <button
            key={a.etiqueta}
            type="button"
            onClick={() => {
              a.hacer();
              cerrar();
            }}
            className="flex flex-col items-center justify-center gap-1 text-xs font-medium text-white"
            style={{ width: ANCHO_ACCION, background: a.color }}
          >
            {a.icono}
            {a.etiqueta}
          </button>
        ))}
      </div>
      <motion.button
        type="button"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: abierto, right: 0 }}
        dragElastic={{ left: 0.15, right: 0 }}
        style={{ x }}
        onDragStart={() => (arrastrando.current = true)}
        onDragEnd={(_, info) => {
          const abrir = info.offset.x < -40 || info.velocity.x < -300;
          void animate(x, abrir ? abierto : 0, { type: "spring", duration: 0.3, bounce: 0 });
          setTimeout(() => (arrastrando.current = false), 0);
        }}
        onClick={() => {
          if (arrastrando.current) return;
          if (x.get() !== 0) return cerrar();
          onClick();
        }}
        className={cn("relative block w-full touch-pan-y text-left", activa ? "bg-marca-suave" : "bg-superficie active:bg-superficie-2")}
      >
        {fila}
      </motion.button>
    </div>
  );
}

function FilaContenido({ s, yo, agente, activa }: { s: Solicitud; yo: string; agente: boolean; activa: boolean }) {
  const nueva = noLeida(s, yo, agente);
  const { icono: Icono, color } = ICONO_CATEGORIA[s.categoria];
  const u = s.ultimo;
  const previa = previaDe(u);
  const deOtro = s.autor_id !== yo;
  return (
    <span className={cn("relative flex w-full items-start gap-3 py-3 pr-3 pl-4", activa && "bg-marca-suave")}>
      {/* Punto de no leído, como en Mail. */}
      <span className={cn("absolute top-[1.15rem] left-1.5 size-2 rounded-full bg-marca transition-opacity", nueva ? "opacity-100" : "opacity-0")} />
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: color }}>
        <Icono className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {agente && s.fijada_soporte && <Pin className="size-3 shrink-0 self-center fill-current text-aviso" aria-label="Fijada" />}
          <span className={cn("min-w-0 flex-1 truncate text-[0.9375rem]", nueva ? "font-semibold" : "font-medium")}>{s.asunto}</span>
          <span className={cn("shrink-0 text-xs", nueva ? "font-medium text-marca-texto" : "text-texto-3")}>{horaLista(s.ultimo_mensaje_en)}</span>
        </span>
        {(agente || deOtro) && (
          <span className="block truncate text-xs text-texto-2">
            {[agente && s.sistema?.nombre, s.autor?.nombre_completo].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-texto-3">
          {u?.de_soporte && !u.evento && !u.retirado_en && !agente && "Soporte: "}
          {previa}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <Insignia tono={ESTADO_SOLICITUD[s.estado].tono}>{ESTADO_SOLICITUD[s.estado].etiqueta}</Insignia>
          {s.prioridad !== "normal" && <Insignia tono={s.prioridad === "urgente" ? "peligro" : "aviso"}>{PRIORIDAD_SOLICITUD[s.prioridad]}</Insignia>}
        </span>
      </span>
      <ChevronRight className="mt-2 size-4 shrink-0 text-texto-3 lg:hidden" />
    </span>
  );
}

function FilaGuia({ g, activa, onClick }: { g: Guia; activa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors", activa ? "bg-marca-suave" : "hover:bg-superficie-2/70 active:bg-superficie-2")}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[#ff9500] text-white">
        <BookOpen className="size-4" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium">{g.titulo}</span>
        <span className="block truncate text-xs text-texto-3">{g.resumen}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-texto-3" />
    </button>
  );
}

function DetalleGuia({ g, onVolver, onPreguntar }: { g: Guia; onVolver: () => void; onPreguntar?: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-3 pt-2.5 lg:hidden">
        <button type="button" onClick={onVolver} className="flex items-center gap-0.5 py-1 pr-2 text-[0.9375rem] font-medium text-marca-texto active:opacity-60">
          <ChevronLeft className="size-5" strokeWidth={2.4} />
          Ayuda
        </button>
      </div>
      <article className="mx-auto w-full max-w-2xl px-6 py-8">
        <span className="grid size-12 place-items-center rounded-[14px] bg-[#ff9500] text-white">
          <BookOpen className="size-6" strokeWidth={2.2} />
        </span>
        <h2 className="mt-4 text-[1.5rem] leading-tight font-bold tracking-[-0.03em]">{g.titulo}</h2>
        <p className="mt-1.5 text-texto-2">{g.resumen}</p>
        <ol className="mt-6 space-y-4">
          {g.pasos.map((p, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-marca-suave text-[0.8125rem] font-semibold text-marca-texto tabular-nums">{i + 1}</span>
              <p className="pt-0.5 text-[0.9375rem] leading-relaxed">{p}</p>
            </li>
          ))}
        </ol>
        {onPreguntar && (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl bg-superficie-2 px-5 py-4">
            <p className="text-sm text-texto-2">¿No se resolvió?</p>
            <Boton tamano="sm" variante="suave" icono={<MessageCircle className="size-4" />} onClick={onPreguntar}>
              Preguntar a soporte
            </Boton>
          </div>
        )}
      </article>
    </div>
  );
}
