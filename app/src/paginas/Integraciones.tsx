import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CreditCard, ExternalLink, KeyRound, MessageCircle, Plug, PlugZap, ScrollText, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { datos, invocar, mensajeError, supabase } from "@/lib/supabase";
import { cn, fechaHora, relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Conectores de cada hospital (WhatsApp y Azul): configurar credenciales, probar la conexión
 * y activar. Las claves van a Supabase Vault y nunca vuelven a la pantalla: solo se
 * ve una pista ("…4f2a"). El envío de mensajes y cobros llega en la fase 2.
 */
type Proveedor = "whatsapp" | "azul";
type Estado = "sin_configurar" | "sin_probar" | "conectado" | "error";

interface Integracion {
  proveedor: Proveedor;
  activo: boolean;
  estado: Estado;
  config: Record<string, string>;
  secretos: Record<string, { pista: string; actualizado_en: string }>;
  detalle_conexion: Record<string, string | null> | null;
  ultimo_error: string | null;
  verificado_en: string | null;
}

interface Campo {
  clave: string;
  etiqueta: string;
  ayuda?: string;
  secreto?: boolean;
  opciones?: { valor: string; etiqueta: string }[];
  placeholder?: string;
}

const CATALOGO: Record<
  Proveedor,
  { nombre: string; para: string; icono: ReactNode; color: string; campos: Campo[]; guia: { texto: string; url: string }; nota?: string }
> = {
  whatsapp: {
    nombre: "WhatsApp Business",
    para: "Avisos por WhatsApp: al personal y a los pacientes (recordatorios de cita, aviso de turno, facturas).",
    icono: <MessageCircle />,
    color: "#25d366",
    campos: [
      { clave: "phone_number_id", etiqueta: "Identificador del número (Phone number ID)", placeholder: "Ej. 1234567890123456" },
      { clave: "waba_id", etiqueta: "Cuenta de WhatsApp Business (WABA ID)", ayuda: "Se usará para las plantillas de mensajes." },
      { clave: "token", etiqueta: "Token de acceso permanente", secreto: true, ayuda: "De un usuario del sistema en Meta Business, con permiso whatsapp_business_messaging." },
    ],
    guia: { texto: "Meta Business → WhatsApp → Configuración de la API", url: "https://business.facebook.com/latest/whatsapp_manager" },
    nota: "Meta exige plantillas aprobadas para los mensajes que inicia el hospital y cobra por mensaje.",
  },
  azul: {
    nombre: "Azul",
    para: "Links de pago para que el paciente pague citas y anticipos desde su celular; el cobro entra solo a Caja.",
    icono: <CreditCard />,
    color: "#0b5cff",
    campos: [
      { clave: "merchant_id", etiqueta: "Merchant ID (número de comercio)" },
      { clave: "nombre_comercio", etiqueta: "Nombre del comercio" },
      {
        clave: "ambiente",
        etiqueta: "Ambiente",
        opciones: [
          { valor: "pruebas", etiqueta: "Pruebas (sandbox)" },
          { valor: "produccion", etiqueta: "Producción" },
        ],
      },
      { clave: "auth1", etiqueta: "Auth1", secreto: true },
      { clave: "auth2", etiqueta: "Auth2", secreto: true },
    ],
    guia: { texto: "Credenciales que entrega Azul al afiliar el comercio a su API", url: "https://www.azul.com.do" },
    nota: "La prueba de conexión se habilita cuando Azul entregue el ambiente de pruebas y su certificado.",
  },
};

const ESTADO: Record<Estado, { etiqueta: string; tono: Tono }> = {
  sin_configurar: { etiqueta: "Sin configurar", tono: "neutro" },
  sin_probar: { etiqueta: "Sin probar", tono: "aviso" },
  conectado: { etiqueta: "Conectado", tono: "exito" },
  error: { etiqueta: "Error de conexión", tono: "peligro" },
};

const ORDEN: Proveedor[] = ["whatsapp", "azul"];

export default function Integraciones() {
  const { sistemaId, sistema } = useSistema();
  const [editar, setEditar] = useState<Proveedor | null>(null);

  const q = useQuery({
    queryKey: ["integraciones", sistemaId],
    queryFn: async () =>
      (datos(
        await supabase
          .from("integraciones")
          .select("proveedor, activo, estado, config, secretos, detalle_conexion, ultimo_error, verificado_en")
          .eq("sistema_id", sistemaId),
      ) ?? []) as unknown as Integracion[],
  });
  const de = (p: Proveedor) => q.data?.find((i) => i.proveedor === p);

  return (
    <>
      <EncabezadoPagina
        titulo="Integraciones"
        descripcion={`Conecta las cuentas de ${sistema.nombre}: WhatsApp para los avisos al personal y a los pacientes, y Azul para los pagos. Las claves se guardan cifradas y no se vuelven a mostrar.`}
      />

      <motion.div variants={contenedorEscalonado} initial="inicial" animate="visible" className="grid gap-4 lg:grid-cols-2">
        {ORDEN.map((p) => (
          <motion.div key={p} variants={itemEscalonado}>
            {q.isLoading ? <Esqueleto className="h-56 rounded-2xl" /> : <TarjetaIntegracion proveedor={p} i={de(p)} onConfigurar={() => setEditar(p)} />}
          </motion.div>
        ))}
      </motion.div>

      <Bitacora />
      <Configurar proveedor={editar} i={editar ? de(editar) : undefined} onCerrar={() => setEditar(null)} />
    </>
  );
}

function TarjetaIntegracion({ proveedor, i, onConfigurar }: { proveedor: Proveedor; i?: Integracion; onConfigurar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const c = CATALOGO[proveedor];
  const estado = i?.estado ?? "sin_configurar";
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["integraciones", sistemaId] });
    void qc.invalidateQueries({ queryKey: ["integracion-eventos", sistemaId] });
  };

  const probar = useMutation({
    mutationFn: async () => invocar<{ ok: boolean; error?: string }>("integraciones", { accion: "probar", sistema_id: sistemaId, proveedor }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`${c.nombre}: conexión correcta`);
      else toast.error(`${c.nombre}: ${r.error}`);
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  const activar = useMutation({
    mutationFn: async (activo: boolean) => datos(await supabase.rpc("activar_integracion", { p_sistema: sistemaId, p_proveedor: proveedor, p_activo: activo })),
    onSuccess: (_, activo) => {
      toast.success(activo ? `${c.nombre} activada` : `${c.nombre} en pausa`);
      refrescar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const detalle = i?.detalle_conexion ? Object.values(i.detalle_conexion).filter(Boolean).join(" · ") : null;

  return (
    <Tarjeta className="flex h-full flex-col p-5">
      <div className="flex items-start gap-4">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm [&>svg]:size-6"
          style={{ background: `linear-gradient(135deg, ${c.color}, color-mix(in oklab, ${c.color} 70%, black))` }}
        >
          {c.icono}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[0.9375rem] font-semibold">{c.nombre}</p>
            <Insignia tono={ESTADO[estado].tono} punto>
              {ESTADO[estado].etiqueta}
            </Insignia>
            {i?.activo && <Insignia tono="marca">Activa</Insignia>}
          </div>
          <p className="mt-1 text-[0.8125rem] text-texto-2">{c.para}</p>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-1.5 text-xs">
        {estado === "conectado" && detalle && <p className="text-exito">✓ {detalle}</p>}
        {estado === "error" && i?.ultimo_error && <p className="text-peligro">{i.ultimo_error}</p>}
        {i?.verificado_en && <p className="text-texto-3">Última prueba {relativo(i.verificado_en)}</p>}
        {Object.entries(i?.secretos ?? {}).map(([k, s]) => (
          <p key={k} className="flex items-center gap-1.5 text-texto-3">
            <KeyRound className="size-3" /> {c.campos.find((x) => x.clave === k)?.etiqueta ?? k}: <span className="font-mono">{s.pista}</span>
          </p>
        ))}
        {c.nota && estado !== "conectado" && <p className="text-texto-3">{c.nota}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-borde pt-4">
        <Boton variante="secundario" tamano="sm" icono={<Plug className="size-3.5" />} onClick={onConfigurar}>
          {i ? "Editar datos" : "Configurar"}
        </Boton>
        <Boton
          variante="suave"
          tamano="sm"
          icono={<PlugZap className="size-3.5" />}
          disabled={estado === "sin_configurar"}
          cargando={probar.isPending}
          onClick={() => probar.mutate()}
        >
          Probar conexión
        </Boton>
        <div className="ml-auto">
          <Interruptor
            activo={!!i?.activo}
            disabled={estado !== "conectado" || activar.isPending}
            onChange={(v) => activar.mutate(v)}
            etiqueta={i?.activo ? "Activa" : "Inactiva"}
          />
        </div>
      </div>
    </Tarjeta>
  );
}

function Configurar({ proveedor, i, onCerrar }: { proveedor: Proveedor | null; i?: Integracion; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, string>>({});
  const c = proveedor ? CATALOGO[proveedor] : null;

  useEffect(() => {
    if (!proveedor) return;
    // Los datos visibles se precargan; las claves nunca (solo su pista).
    setValores({ ambiente: "pruebas", ...(i?.config ?? {}) });
  }, [proveedor, i]);

  const guardar = useMutation({
    mutationFn: async () => {
      const config: Record<string, string> = {};
      const secretos: Record<string, string> = {};
      for (const campo of c!.campos) (campo.secreto ? secretos : config)[campo.clave] = valores[campo.clave] ?? "";
      return datos(await supabase.rpc("guardar_integracion", { p_sistema: sistemaId, p_proveedor: proveedor!, p_config: config, p_secretos: secretos })) as {
        estado: Estado;
      };
    },
    onSuccess: (r) => {
      toast.success(r.estado === "sin_configurar" ? "Guardado. Faltan datos para poder probarla." : "Guardado. Ahora prueba la conexión.");
      void qc.invalidateQueries({ queryKey: ["integraciones", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["integracion-eventos", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const quitar = useMutation({
    mutationFn: async () => datos(await supabase.rpc("quitar_integracion", { p_sistema: sistemaId, p_proveedor: proveedor! })),
    onSuccess: () => {
      toast.success("Integración quitada y claves borradas");
      void qc.invalidateQueries({ queryKey: ["integraciones", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["integracion-eventos", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <Modal
      lateral
      abierto={!!proveedor}
      onCerrar={onCerrar}
      titulo={c ? `Conectar ${c.nombre}` : ""}
      descripcion={c?.para}
      pie={
        <>
          {i && i.estado !== "sin_configurar" && (
            <Boton variante="fantasma" className="mr-auto text-peligro" icono={<Trash2 className="size-4" />} cargando={quitar.isPending} onClick={() => quitar.mutate()}>
              Quitar
            </Boton>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        </>
      }
    >
      {c && (
        <div className="space-y-4">
          <a
            href={c.guia.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-borde bg-superficie-2 px-3 py-2.5 text-[0.8125rem] text-texto-2 hover:text-texto"
          >
            <ExternalLink className="size-4 shrink-0" /> Dónde obtenerlas: {c.guia.texto}
          </a>
          {c.campos.map((campo) =>
            campo.opciones ? (
              <Selector
                key={campo.clave}
                etiqueta={campo.etiqueta}
                value={valores[campo.clave] ?? ""}
                onChange={(e) => setValores({ ...valores, [campo.clave]: e.target.value })}
              >
                {campo.opciones.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Selector>
            ) : (
              <Entrada
                key={campo.clave}
                etiqueta={campo.etiqueta}
                type={campo.secreto ? "password" : "text"}
                autoComplete="off"
                placeholder={campo.secreto && i?.secretos?.[campo.clave] ? `Guardada (${i.secretos[campo.clave].pista}) · escribe solo para reemplazarla` : campo.placeholder}
                ayuda={campo.ayuda}
                value={valores[campo.clave] ?? ""}
                onChange={(e) => setValores({ ...valores, [campo.clave]: e.target.value })}
              />
            ),
          )}
          <p className="flex items-start gap-2 rounded-xl bg-superficie-2 px-3 py-2.5 text-xs text-texto-3">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" />
            Las claves se guardan cifradas en la bóveda de la plataforma. Nadie —ni la administración— puede volver a verlas; solo reemplazarlas.
          </p>
        </div>
      )}
    </Modal>
  );
}

const TIPO_EVENTO: Record<string, string> = {
  configuracion: "Datos actualizados",
  prueba: "Prueba de conexión",
  activacion: "Activación",
  baja: "Integración quitada",
  envio: "Envío",
  webhook: "Aviso recibido",
  error: "Error",
};

function Bitacora() {
  const { sistemaId } = useSistema();
  const q = useQuery({
    queryKey: ["integracion-eventos", sistemaId],
    queryFn: async () =>
      datos(
        await supabase
          .from("integracion_eventos")
          .select("id, proveedor, tipo, resultado, detalle, creado_en")
          .eq("sistema_id", sistemaId)
          .order("creado_en", { ascending: false })
          .limit(30),
      ) ?? [],
  });
  const describir = (e: { tipo: string; resultado: string; detalle: unknown }) => {
    const d = (e.detalle ?? {}) as Record<string, unknown>;
    if (e.tipo === "prueba") return e.resultado === "ok" ? "Conexión correcta" : String(d.error ?? "Falló");
    if (e.tipo === "activacion") return d.activo ? "Activada" : "En pausa";
    if (e.tipo === "configuracion") return `Cambió: ${((d.campos as string[]) ?? []).join(", ")}`;
    return "";
  };
  return (
    <Tarjeta className="mt-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-borde px-5 py-4">
        <ScrollText className="size-4 text-texto-3" />
        <h2 className="text-[0.9375rem] font-semibold">Bitácora</h2>
        <span className="ml-auto text-xs text-texto-3">Cambios y pruebas de las integraciones (no se puede borrar)</span>
      </div>
      {q.isLoading ? (
        <Esqueleto className="m-5 h-24" />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio icono={<ScrollText />} titulo="Sin movimientos todavía" />
      ) : (
        <ul className="divide-y divide-borde">
          {q.data!.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className={cn("size-2 shrink-0 rounded-full", e.resultado === "ok" ? "bg-exito" : "bg-peligro")} />
              <span className="w-36 shrink-0 font-medium">{CATALOGO[e.proveedor as Proveedor]?.nombre ?? e.proveedor}</span>
              <span className="w-40 shrink-0 text-texto-2">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span>
              <span className="min-w-0 flex-1 truncate text-texto-3">{describir(e)}</span>
              <span className="shrink-0 text-xs text-texto-3">{fechaHora(e.creado_en)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
