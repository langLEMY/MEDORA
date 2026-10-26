import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { enEscritorio } from "./escritorio";
import { erroresRecientes } from "./monitoreo";
import type { Json } from "./database.types";
import { datos, supabase } from "./supabase";

/*
 * Ayuda y soporte (helpdesk). Ver supabase/migrations/20261026120000_ayuda_soporte.sql:
 * el hospital abre solicitudes, Soporte MEDORA (el superadmin) responde desde su
 * bandeja. Todo se escribe por RPC; el RLS decide quién ve cada solicitud.
 */

export type EstadoSolicitud = "abierta" | "en_proceso" | "esperando_respuesta" | "resuelta";
export type CategoriaSolicitud = "duda" | "problema" | "sugerencia" | "cuenta";
export type PrioridadSolicitud = "normal" | "alta" | "urgente";

export const ESTADO_SOLICITUD: Record<EstadoSolicitud, { etiqueta: string; evento: string; tono: "marca" | "aviso" | "exito" | "info" }> = {
  abierta: { etiqueta: "Abierta", evento: "reabrió la solicitud", tono: "info" },
  en_proceso: { etiqueta: "En proceso", evento: "está trabajando en esto", tono: "marca" },
  esperando_respuesta: { etiqueta: "Esperando tu respuesta", evento: "espera tu respuesta", tono: "aviso" },
  resuelta: { etiqueta: "Resuelta", evento: "marcó la solicitud como resuelta", tono: "exito" },
};

export const CATEGORIA_SOLICITUD: Record<CategoriaSolicitud, string> = {
  duda: "Duda",
  problema: "Problema",
  sugerencia: "Sugerencia",
  cuenta: "Mi cuenta",
};

export const PRIORIDAD_SOLICITUD: Record<PrioridadSolicitud, string> = {
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export interface Solicitud {
  id: string;
  sistema_id: string;
  numero: number;
  autor_id: string;
  asunto: string;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  estado: EstadoSolicitud;
  contexto: Json;
  creado_en: string;
  ultimo_mensaje_en: string;
  ultimo_de_soporte: boolean;
  vista_autor_en: string | null;
  vista_soporte_en: string | null;
  fijada_soporte: boolean;
  no_leida_soporte: boolean;
  autor: { nombre_completo: string | null; foto: string | null } | null;
  sistema: { nombre: string } | null;
  /** Último mensaje, para la vista previa de la lista. */
  ultimo?: { texto: string; evento: string | null; adjunto: string | null; de_soporte: boolean; retirado_en: string | null } | null;
}

export interface Mensaje {
  id: string;
  solicitud_id: string;
  autor_id: string | null;
  de_soporte: boolean;
  texto: string;
  adjunto: string | null;
  evento: EstadoSolicitud | null;
  responde_a: string | null;
  retirado_en: string | null;
  creado_en: string;
  autor: { nombre_completo: string | null; foto: string | null } | null;
  /** Mensaje que aún se está enviando (se muestra antes de que el servidor lo confirme). */
  enviando?: boolean;
  /** Captura local mientras sube. */
  vistaLocal?: string;
}

/**
 * Lo que nunca debe viajar en un mensaje: espejo exacto de privado.limpiar_texto_soporte,
 * para que lo que se ve al enviar sea lo mismo que se guarda.
 */
const PATRONES: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]"],
  [/\b\d{3}-?\d{7}-?\d\b/g, "[cédula]"],
  [/(\+?1[ -]?)?\b(809|829|849)[ -]?\d{3}[ -]?\d{4}\b/g, "[teléfono]"],
  [/\b\d{9,11}\b/g, "[número]"],
];
export const limpiarTextoSoporte = (s: string) => PATRONES.reduce((t, [re, r]) => t.replace(re, r), s.trim());

/** Lo que se adjunta solo a cada solicitud: sin datos de pacientes. */
export function contextoSolicitud(pantalla: string, roles: string[], sede?: string | null): Json {
  return {
    version: __VERSION_APP__,
    pantalla: pantalla.split("?")[0] || "/",
    roles,
    sede: sede ?? null,
    entorno: enEscritorio ? "escritorio" : "navegador",
    pantalla_px: `${window.screen.width}×${window.screen.height}`,
    navegador: navigator.userAgent.slice(0, 200),
    errores: erroresRecientes(),
  };
}

/** ¿Hay algo nuevo para mí en esta solicitud? */
export function noLeida(s: Solicitud, yo: string | undefined, soporte: boolean) {
  if (soporte && s.autor_id !== yo)
    return s.no_leida_soporte || (!s.ultimo_de_soporte && s.estado !== "resuelta" && (!s.vista_soporte_en || s.vista_soporte_en < s.ultimo_mensaje_en));
  return s.autor_id === yo && s.ultimo_de_soporte && (!s.vista_autor_en || s.vista_autor_en < s.ultimo_mensaje_en);
}

const SELECT_SOLICITUD =
  "id, sistema_id, numero, autor_id, asunto, categoria, prioridad, estado, contexto, creado_en, ultimo_mensaje_en, ultimo_de_soporte, vista_autor_en, vista_soporte_en, fijada_soporte, no_leida_soporte, autor:perfiles!solicitudes_soporte_autor_id_fkey(nombre_completo, foto), sistema:sistemas(nombre)";

/**
 * Solicitudes que puedo ver (el RLS decide: las mías, las de mi hospital si soy admin y todas
 * si soy soporte). `todas`: bandeja de soporte, sin filtrar por sistema.
 */
export function useSolicitudes(sistemaId: string, todas: boolean) {
  const qc = useQueryClient();
  const clave = ["soporte", "solicitudes", todas ? "todas" : sistemaId];
  useEffect(() => {
    const canal = supabase
      .channel(`soporte-solicitudes-${todas ? "todas" : sistemaId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitudes_soporte", ...(todas ? {} : { filter: `sistema_id=eq.${sistemaId}` }) },
        () => void qc.invalidateQueries({ queryKey: ["soporte"] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [qc, sistemaId, todas]);

  return useQuery({
    queryKey: clave,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase.from("solicitudes_soporte").select(SELECT_SOLICITUD).order("ultimo_mensaje_en", { ascending: false }).limit(200);
      if (!todas) q = q.eq("sistema_id", sistemaId);
      const filas = datos(await q) as unknown as Solicitud[];
      if (!filas.length) return filas;
      // Vista previa: el último mensaje de cada una (una sola consulta).
      const ultimos = datos(
        await supabase
          .from("mensajes_soporte")
          .select("solicitud_id, texto, evento, adjunto, de_soporte, retirado_en, creado_en")
          .in("solicitud_id", filas.map((f) => f.id))
          .order("creado_en", { ascending: false })
          .limit(1000),
      );
      const porSolicitud = new Map<string, Solicitud["ultimo"]>();
      for (const m of ultimos ?? []) if (!porSolicitud.has(m.solicitud_id)) porSolicitud.set(m.solicitud_id, m);
      return filas.map((f) => ({ ...f, ultimo: porSolicitud.get(f.id) ?? null }));
    },
  });
}

/** Mensajes de una solicitud, en vivo. */
export function useMensajes(solicitudId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!solicitudId) return;
    const canal = supabase
      .channel(`soporte-mensajes-${solicitudId}-${Math.random().toString(36).slice(2)}`)
      // INSERT (mensajes nuevos) y UPDATE (envíos deshechos).
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes_soporte", filter: `solicitud_id=eq.${solicitudId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["soporte", "mensajes", solicitudId] });
        void qc.invalidateQueries({ queryKey: ["soporte", "solicitudes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reacciones_soporte", filter: `solicitud_id=eq.${solicitudId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["soporte", "reacciones", solicitudId] });
      })
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [qc, solicitudId]);

  return useQuery({
    queryKey: ["soporte", "mensajes", solicitudId],
    enabled: !!solicitudId,
    queryFn: async () =>
      datos(
        await supabase
          .from("mensajes_soporte")
          .select("id, solicitud_id, autor_id, de_soporte, texto, adjunto, evento, responde_a, retirado_en, creado_en, autor:perfiles!mensajes_soporte_autor_id_fkey(nombre_completo, foto)")
          .eq("solicitud_id", solicitudId!)
          .order("creado_en"),
      ) as unknown as Mensaje[],
  });
}

/**
 * ¿Respondo como Soporte MEDORA? Solo los agentes de plataforma.agentes_soporte (hoy, lemy) y con
 * la sesión en dos pasos (aal2). Un superadmin que no esté en la lista ve Ayuda como cualquiera.
 */
export function useAgenteSoporte() {
  const { data } = useQuery({
    queryKey: ["soporte", "agente"],
    staleTime: 5 * 60_000,
    queryFn: async () => datos(await supabase.rpc("soy_agente_soporte")) as boolean,
  });
  return data ?? false;
}

/** Cuántas solicitudes tienen algo nuevo para mí (el globo rojo del botón de Ayuda). */
export function usePendientesSoporte(activo: boolean) {
  return useQuery({
    queryKey: ["soporte", "pendientes"],
    enabled: activo,
    refetchInterval: 60_000,
    queryFn: async () => datos(await supabase.rpc("soporte_pendientes")) as number,
  });
}

/** URLs firmadas (1 h) de las capturas de un hilo. */
export function useAdjuntos(rutas: string[]) {
  return useQuery({
    queryKey: ["soporte", "adjuntos", rutas],
    enabled: rutas.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const r = datos(await supabase.storage.from("soporte").createSignedUrls(rutas, 3600));
      return Object.fromEntries((r ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl])) as Record<string, string>;
    },
  });
}

/** Sube una captura a la carpeta de la solicitud y devuelve su ruta. */
export async function subirCaptura(sistemaId: string, solicitudId: string, archivo: Blob) {
  const ext = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  const ruta = `${sistemaId}/${solicitudId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("soporte").upload(ruta, archivo, { contentType: archivo.type || "image/jpeg" });
  if (error) throw error;
  return ruta;
}

export function useAccionesSoporte() {
  const qc = useQueryClient();
  const refrescar = (solicitudId?: string) => {
    void qc.invalidateQueries({ queryKey: ["soporte", "solicitudes"] });
    void qc.invalidateQueries({ queryKey: ["soporte", "pendientes"] });
    if (solicitudId) void qc.invalidateQueries({ queryKey: ["soporte", "mensajes", solicitudId] });
  };

  const crear = useMutation({
    mutationFn: async (v: {
      sistemaId: string;
      asunto: string;
      categoria: CategoriaSolicitud;
      prioridad: PrioridadSolicitud;
      texto: string;
      contexto: Json;
      captura?: Blob | null;
    }) => {
      const id = datos(
        await supabase.rpc("crear_solicitud_soporte", {
          p_sistema: v.sistemaId,
          p_asunto: v.asunto,
          p_categoria: v.categoria,
          p_prioridad: v.prioridad,
          p_texto: v.texto,
          p_contexto: v.contexto,
        }),
      ) as string;
      // La captura necesita la carpeta de la solicitud: va como segundo mensaje.
      if (v.captura) {
        const ruta = await subirCaptura(v.sistemaId, id, v.captura);
        datos(await supabase.rpc("responder_solicitud_soporte", { p_solicitud: id, p_texto: "", p_adjunto: ruta }));
      }
      return id;
    },
    onSuccess: () => refrescar(),
  });

  const responder = useMutation({
    mutationFn: async (v: { solicitud: Solicitud; texto: string; captura?: Blob | null; yo: string; comoSoporte: boolean; respondeA?: string | null }) => {
      const adjunto = v.captura ? await subirCaptura(v.solicitud.sistema_id, v.solicitud.id, v.captura) : undefined;
      return datos(
        await supabase.rpc("responder_solicitud_soporte", { p_solicitud: v.solicitud.id, p_texto: v.texto, p_adjunto: adjunto, p_responde_a: v.respondeA ?? undefined }),
      ) as string;
    },
    // Burbuja inmediata mientras el servidor confirma.
    onMutate: async (v) => {
      const clave = ["soporte", "mensajes", v.solicitud.id];
      await qc.cancelQueries({ queryKey: clave });
      const previo = qc.getQueryData<Mensaje[]>(clave);
      qc.setQueryData<Mensaje[]>(clave, (m = []) => [
        ...m,
        {
          id: `temporal-${Date.now()}`,
          solicitud_id: v.solicitud.id,
          autor_id: v.comoSoporte ? null : v.yo,
          de_soporte: v.comoSoporte,
          texto: limpiarTextoSoporte(v.texto),
          adjunto: null,
          evento: null,
          responde_a: v.respondeA ?? null,
          retirado_en: null,
          creado_en: new Date().toISOString(),
          autor: null,
          enviando: true,
          vistaLocal: v.captura ? URL.createObjectURL(v.captura) : undefined,
        },
      ]);
      return { previo, clave };
    },
    onError: (_e, _v, c) => c && qc.setQueryData(c.clave, c.previo),
    onSettled: (_d, _e, v) => refrescar(v.solicitud.id),
  });

  const cambiarEstado = useMutation({
    mutationFn: async (v: { solicitud: string; estado: EstadoSolicitud; prioridad?: PrioridadSolicitud }) =>
      datos(await supabase.rpc("cambiar_estado_solicitud_soporte", { p_solicitud: v.solicitud, p_estado: v.estado, p_prioridad: v.prioridad })),
    onSettled: (_d, _e, v) => refrescar(v.solicitud),
  });

  const marcarVista = useMutation({
    mutationFn: async (solicitud: string) => datos(await supabase.rpc("marcar_solicitud_soporte_vista", { p_solicitud: solicitud })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["soporte", "pendientes"] });
      void qc.invalidateQueries({ queryKey: ["soporte", "solicitudes"] });
    },
  });

  // «Deshacer envío»: el servidor vacía el mensaje y, si tenía foto, la app la borra del bucket.
  const retirar = useMutation({
    mutationFn: async (v: { mensaje: string; solicitud: string }) => {
      const ruta = datos(await supabase.rpc("retirar_mensaje_soporte", { p_mensaje: v.mensaje })) as string | null;
      if (ruta) await supabase.storage.from("soporte").remove([ruta]);
    },
    onMutate: async (v) => {
      const clave = ["soporte", "mensajes", v.solicitud];
      await qc.cancelQueries({ queryKey: clave });
      const previo = qc.getQueryData<Mensaje[]>(clave);
      qc.setQueryData<Mensaje[]>(clave, (m = []) =>
        m.map((x) => (x.id === v.mensaje ? { ...x, texto: "", adjunto: null, retirado_en: new Date().toISOString() } : x)),
      );
      return { previo, clave };
    },
    onError: (_e, _v, c) => c && qc.setQueryData(c.clave, c.previo),
    onSettled: (_d, _e, v) => {
      refrescar(v.solicitud);
      void qc.invalidateQueries({ queryKey: ["soporte", "reacciones", v.solicitud] });
    },
  });

  // Tapback: tocar la misma reacción la quita (como en Mensajes).
  const reaccionar = useMutation({
    mutationFn: async (v: { mensaje: string; solicitud: string; tipo: Tapback | null; yo: string; comoSoporte: boolean }) =>
      datos(await supabase.rpc("reaccionar_mensaje_soporte", { p_mensaje: v.mensaje, p_tipo: v.tipo })),
    onMutate: async (v) => {
      const clave = ["soporte", "reacciones", v.solicitud];
      await qc.cancelQueries({ queryKey: clave });
      const previo = qc.getQueryData<Reaccion[]>(clave);
      const mia = (r: Reaccion) => r.mensaje_id === v.mensaje && (v.comoSoporte ? r.de_soporte : r.usuario_id === v.yo);
      qc.setQueryData<Reaccion[]>(clave, (rs = []) => [
        ...rs.filter((r) => !mia(r)),
        ...(v.tipo ? [{ mensaje_id: v.mensaje, usuario_id: v.comoSoporte ? null : v.yo, de_soporte: v.comoSoporte, tipo: v.tipo }] : []),
      ]);
      return { previo, clave };
    },
    onError: (_e, _v, c) => c && qc.setQueryData(c.clave, c.previo),
    onSettled: (_d, _e, v) => void qc.invalidateQueries({ queryKey: ["soporte", "reacciones", v.solicitud] }),
  });

  // Bandeja de soporte: fijar y marcar como no leída.
  const ajustarBandeja = useMutation({
    mutationFn: async (v: { solicitud: string; fijada?: boolean; noLeida?: boolean }) =>
      datos(await supabase.rpc("ajustar_bandeja_soporte", { p_solicitud: v.solicitud, p_fijada: v.fijada, p_no_leida: v.noLeida })),
    onSettled: () => refrescar(),
  });

  return { crear, responder, cambiarEstado, marcarVista, retirar, reaccionar, ajustarBandeja };
}

// ---------------------------------------------------------------------------
// Tapbacks
// ---------------------------------------------------------------------------

export type Tapback = "corazon" | "me_gusta" | "no_me_gusta" | "risa" | "exclamacion" | "pregunta";
/** En el orden del selector de Mensajes. */
export const TAPBACKS: { tipo: Tapback; emoji: string; nombre: string }[] = [
  { tipo: "corazon", emoji: "❤️", nombre: "Me encanta" },
  { tipo: "me_gusta", emoji: "👍", nombre: "Me gusta" },
  { tipo: "no_me_gusta", emoji: "👎", nombre: "No me gusta" },
  { tipo: "risa", emoji: "😂", nombre: "Me da risa" },
  { tipo: "exclamacion", emoji: "‼️", nombre: "¡Importante!" },
  { tipo: "pregunta", emoji: "❓", nombre: "Tengo una duda" },
];

export interface Reaccion {
  mensaje_id: string;
  usuario_id: string | null;
  de_soporte: boolean;
  tipo: Tapback;
}

export function useReacciones(solicitudId: string | null) {
  return useQuery({
    queryKey: ["soporte", "reacciones", solicitudId],
    enabled: !!solicitudId,
    queryFn: async () =>
      datos(
        await supabase.from("reacciones_soporte").select("mensaje_id, usuario_id, de_soporte, tipo").eq("solicitud_id", solicitudId!).not("tipo", "is", null),
      ) as unknown as Reaccion[],
  });
}

// ---------------------------------------------------------------------------
// «Escribiendo…» (Realtime Broadcast: no toca la base; solo dice de qué lado se escribe)
// ---------------------------------------------------------------------------

const AVISO_CADA_MS = 2500;
const ESCRIBIENDO_DURA_MS = 5000;

export function useEscribiendo(solicitudId: string, lado: "soporte" | "hospital") {
  const [otroEscribe, setOtroEscribe] = useState(false);
  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ultimoAviso = useRef(0);

  useEffect(() => {
    let apagar: ReturnType<typeof setTimeout> | undefined;
    const c = supabase
      .channel(`soporte-escribiendo-${solicitudId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "escribiendo" }, ({ payload }) => {
        const p = payload as { lado?: string; activo?: boolean };
        if (p.lado === lado) return;
        clearTimeout(apagar);
        setOtroEscribe(!!p.activo);
        if (p.activo) apagar = setTimeout(() => setOtroEscribe(false), ESCRIBIENDO_DURA_MS);
      })
      .subscribe();
    canal.current = c;
    return () => {
      clearTimeout(apagar);
      canal.current = null;
      void supabase.removeChannel(c);
    };
  }, [solicitudId, lado]);

  /** Llamar al teclear (se avisa como mucho cada 2.5 s) y con `false` al enviar o borrar. */
  const avisar = useCallback(
    (activo: boolean) => {
      const ahora = Date.now();
      if (activo && ahora - ultimoAviso.current < AVISO_CADA_MS) return;
      ultimoAviso.current = activo ? ahora : 0;
      void canal.current?.send({ type: "broadcast", event: "escribiendo", payload: { lado, activo } });
    },
    [lado],
  );

  // Si llega un mensaje del otro lado, ya no está escribiendo.
  const dejoDeEscribir = useCallback(() => setOtroEscribe(false), []);
  return { otroEscribe, avisar, dejoDeEscribir };
}

// ---------------------------------------------------------------------------
// Enlaces a pantallas de MEDORA dentro de un mensaje: medora://caja?vista=cuadre
// ---------------------------------------------------------------------------

export const PREFIJO_ENLACE = "medora://";
const ENLACE_RE = /medora:\/\/([a-z0-9/_-]*)(\?[a-z0-9=&_-]*)?/gi;

/** Separa los enlaces internos del texto: el texto queda sin ellos y cada uno pasa a tarjeta. */
export function extraerEnlaces(texto: string) {
  const rutas: string[] = [];
  const limpio = texto
    .replace(ENLACE_RE, (_m, camino: string, query?: string) => {
      const ruta = `/${camino.replace(/^\/+/, "")}${query ?? ""}`;
      if (!rutas.includes(ruta)) rutas.push(ruta);
      return "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { texto: limpio, rutas };
}

export const enlaceA = (ruta: string) => `${PREFIJO_ENLACE}${ruta.replace(/^\//, "")}`;

// ---------------------------------------------------------------------------
// Respuestas rápidas de soporte
// ---------------------------------------------------------------------------

export const RESPUESTAS_DE_FABRICA = [
  "¡Hola! Ya estoy revisando tu caso.",
  "¿Me puedes enviar una captura de la pantalla donde pasa?",
  "¿Qué estabas haciendo justo antes de que pasara?",
  "Ya está corregido. Cierra MEDORA y vuelve a abrirla para ver el cambio.",
  "Sale en la próxima actualización de MEDORA. Te aviso cuando esté.",
  "¿Te funcionó? Si es así, la marco como resuelta.",
];
