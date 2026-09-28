import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Accessibility, ArrowLeft, Baby, CalendarCheck, Delete, HeartPulse, Stethoscope, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { enviar, imprimirDirecto } from "@/lib/escritorio";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { cn, fechaHora, hora } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

/**
 * Quiosco de turnos (pantalla táctil de la entrada). El paciente se identifica con
 * su cédula, elige especialidad (o confirma su cita), indica si necesita atención
 * preferencial y recibe su ticket. Todo pasa por RPC quiosco_* (la cuenta del
 * quiosco no puede leer pacientes ni citas). Vuelve solo al inicio si nadie toca.
 */
interface Opcion {
  especialidad: string;
  prefijo: string;
  medicos: { id: string; nombre: string }[];
  en_espera: number;
}
interface Encontrado {
  paciente_id: string;
  nombre: string;
  cita: { id: string; inicio: string; medico: string | null; especialidad: string | null } | null;
}
interface Resultado {
  turno: string;
  destino: string;
  especialidad: string;
  delante: number;
  cobrar: boolean;
  fecha: string;
}
type Paso = "inicio" | "cedula" | "cita" | "especialidad" | "medico" | "prioridad" | "listo";

const INACTIVIDAD_MS = 30_000;
const LISTO_MS = 12_000;

const PRIORIDADES: { valor: string | null; etiqueta: string; icono: ReactNode }[] = [
  { valor: null, etiqueta: "No, gracias", icono: <UserRound /> },
  { valor: "Envejeciente", etiqueta: "Envejeciente (65+)", icono: <Users /> },
  { valor: "Embarazada", etiqueta: "Embarazada", icono: <Baby /> },
  { valor: "Persona con discapacidad", etiqueta: "Discapacidad", icono: <Accessibility /> },
];

const formatoCedula = (d: string) => (d.length <= 3 ? d : d.length <= 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10, 11)}`);

export default function Quiosco() {
  const { sistema, sistemaId } = useSistema();
  const [paso, setPaso] = useState<Paso>("inicio");
  const [cedula, setCedula] = useState("");
  const [encontrado, setEncontrado] = useState<Encontrado | null>(null);
  const [especialidad, setEspecialidad] = useState<Opcion | null>(null);
  const [medico, setMedico] = useState<string | null>(null);
  const [citaId, setCitaId] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opciones = useQuery({
    queryKey: ["quiosco-opciones", sistemaId],
    refetchInterval: 60_000,
    queryFn: async () => (datos(await supabase.rpc("quiosco_opciones", { p_sistema: sistemaId })) ?? []) as unknown as Opcion[],
  });

  const reiniciar = useCallback(() => {
    setPaso("inicio");
    setCedula("");
    setEncontrado(null);
    setEspecialidad(null);
    setMedico(null);
    setCitaId(null);
    setResultado(null);
    setError(null);
  }, []);

  // Si nadie toca la pantalla, vuelve al inicio (y el siguiente no ve datos del anterior).
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (paso === "inicio") return;
    const armar = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(reiniciar, paso === "listo" ? LISTO_MS : INACTIVIDAD_MS);
    };
    armar();
    window.addEventListener("pointerdown", armar);
    return () => {
      window.removeEventListener("pointerdown", armar);
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [paso, reiniciar]);

  const buscar = useMutation({
    mutationFn: async () => datos(await supabase.rpc("quiosco_buscar", { p_sistema: sistemaId, p_cedula: cedula })) as unknown as Encontrado | null,
    onSuccess: (r) => {
      setEncontrado(r);
      setPaso(r?.cita ? "cita" : "especialidad");
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const tomar = useMutation({
    mutationFn: async (prioridad: string | null) =>
      datos(
        await supabase.rpc("quiosco_tomar_turno", {
          p_sistema: sistemaId,
          p_paciente: encontrado?.paciente_id,
          p_cedula: cedula || undefined,
          p_cita: citaId ?? undefined,
          p_medico: medico ?? undefined,
          p_especialidad: especialidad?.especialidad,
          p_prioridad: !!prioridad,
          p_motivo_prioridad: prioridad ?? undefined,
        }),
      ) as unknown as Resultado,
    onSuccess: (r) => {
      setResultado(r);
      setPaso("listo");
      // Deja pintar el ticket en el área de impresión y lo manda a la térmica.
      setTimeout(imprimirDirecto, 350);
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const atras: Partial<Record<Paso, Paso>> = { cedula: "inicio", cita: "cedula", especialidad: "cedula", medico: "especialidad", prioridad: "especialidad" };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fondo text-texto select-none">
      <Cabecera />

      <main className="relative flex-1 overflow-y-auto px-10 pb-10">
        {paso !== "inicio" && paso !== "listo" && (
          <button
            onClick={() => setPaso(paso === "prioridad" && citaId ? "cita" : (atras[paso] ?? "inicio"))}
            className="mb-4 inline-flex h-14 items-center gap-2 rounded-2xl px-5 text-lg font-medium text-texto-2 active:scale-[0.97] active:bg-superficie-2"
          >
            <ArrowLeft className="size-6" /> Atrás
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.section
            key={paso}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="mx-auto max-w-5xl"
          >
            {paso === "inicio" && (
              <button onClick={() => setPaso("cedula")} className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-8 text-center">
                <span className="grid size-36 place-items-center rounded-[2.5rem] bg-marca text-white shadow-lg">
                  <Stethoscope className="size-20" />
                </span>
                <div>
                  <p className="text-5xl font-bold tracking-tight">Bienvenido a {sistema.nombre}</p>
                  <p className="mt-4 text-2xl text-texto-2">Toque la pantalla para tomar su turno</p>
                </div>
                <span className="animate-pulse rounded-full bg-marca-suave px-8 py-4 text-xl font-semibold text-marca-texto">Tomar turno</span>
              </button>
            )}

            {paso === "cedula" && (
              <div className="grid items-start gap-10 lg:grid-cols-[1fr_26rem]">
                <div>
                  <Titulo>Escriba su cédula</Titulo>
                  <p className="mt-2 text-xl text-texto-2">Así encontramos su expediente y su cita.</p>
                  <p className="mt-8 rounded-3xl border-2 border-borde bg-superficie px-6 py-5 text-center font-mono text-5xl tracking-widest tabular">
                    {cedula ? formatoCedula(cedula) : <span className="text-texto-3">000-0000000-0</span>}
                  </p>
                  <button
                    onClick={() => {
                      setCedula("");
                      setEncontrado(null);
                      setPaso("especialidad");
                    }}
                    className="mt-6 w-full rounded-2xl border-2 border-dashed border-borde-fuerte px-6 py-5 text-xl font-medium text-texto-2 active:scale-[0.98] active:bg-superficie-2"
                  >
                    No tengo cédula / Soy nuevo
                  </button>
                </div>
                <Teclado
                  valor={cedula}
                  onCambio={(v) => setCedula(v.slice(0, 11))}
                  onListo={() => buscar.mutate()}
                  cargando={buscar.isPending}
                  listo={cedula.length >= 6}
                />
              </div>
            )}

            {paso === "cita" && encontrado?.cita && (
              <div className="text-center">
                <Titulo>Hola, {encontrado.nombre}</Titulo>
                <p className="mt-3 text-2xl text-texto-2">Tiene cita hoy</p>
                <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-borde bg-superficie p-8 text-left shadow-sm">
                  <p className="flex items-center gap-3 text-3xl font-semibold">
                    <CalendarCheck className="size-8 text-marca" /> {hora(encontrado.cita.inicio)}
                  </p>
                  <p className="mt-3 text-2xl">{encontrado.cita.medico ?? encontrado.cita.especialidad}</p>
                  {encontrado.cita.especialidad && <p className="text-xl text-texto-2">{encontrado.cita.especialidad}</p>}
                </div>
                <div className="mx-auto mt-8 grid max-w-xl gap-4">
                  <BotonGrande
                    onClick={() => {
                      setCitaId(encontrado.cita!.id);
                      setPaso("prioridad");
                    }}
                  >
                    Sí, vengo a mi cita
                  </BotonGrande>
                  <BotonGrande secundario onClick={() => setPaso("especialidad")}>
                    Vengo por otra cosa
                  </BotonGrande>
                </div>
              </div>
            )}

            {paso === "especialidad" && (
              <div>
                <Titulo>{encontrado ? `Hola, ${encontrado.nombre}. ` : ""}¿Qué consulta necesita?</Titulo>
                {!encontrado && cedula && <p className="mt-2 text-xl text-texto-2">No encontramos esa cédula: le registrarán en caja.</p>}
                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(opciones.data ?? []).map((o) => (
                    <button
                      key={o.especialidad}
                      onClick={() => {
                        setEspecialidad(o);
                        setCitaId(null);
                        setMedico(null);
                        setPaso(o.medicos.length > 1 ? "medico" : "prioridad");
                      }}
                      className="flex min-h-36 flex-col justify-between rounded-3xl border border-borde bg-superficie p-6 text-left shadow-sm transition-transform duration-150 active:scale-[0.97] active:border-marca"
                    >
                      <span className="flex items-center gap-3">
                        <span className="grid size-12 place-items-center rounded-2xl bg-marca-suave font-mono text-lg font-bold text-marca-texto">{o.prefijo}</span>
                        <span className="text-2xl font-semibold leading-tight">{o.especialidad}</span>
                      </span>
                      <span className="text-lg text-texto-2">{o.en_espera ? `${o.en_espera} esperando` : "Sin espera"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paso === "medico" && especialidad && (
              <div>
                <Titulo>{especialidad.especialidad}: ¿con quién?</Titulo>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      setMedico(null);
                      setPaso("prioridad");
                    }}
                    className="rounded-3xl border-2 border-marca bg-marca-suave p-7 text-left active:scale-[0.97] sm:col-span-2"
                  >
                    <p className="text-3xl font-bold text-marca-texto">El primero disponible</p>
                    <p className="mt-1 text-xl text-texto-2">Recomendado: le atienden más rápido</p>
                  </button>
                  {especialidad.medicos.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMedico(m.id);
                        setPaso("prioridad");
                      }}
                      className="rounded-3xl border border-borde bg-superficie p-6 text-left text-2xl font-semibold shadow-sm active:scale-[0.97] active:border-marca"
                    >
                      {m.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paso === "prioridad" && (
              <div>
                <Titulo>¿Necesita atención preferencial?</Titulo>
                <p className="mt-2 text-xl text-texto-2">Por ley pasan primero las personas envejecientes, embarazadas o con discapacidad.</p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.etiqueta}
                      disabled={tomar.isPending}
                      onClick={() => tomar.mutate(p.valor)}
                      className={cn(
                        "flex items-center gap-5 rounded-3xl border p-7 text-left text-2xl font-semibold shadow-sm active:scale-[0.97] disabled:opacity-50 [&_svg]:size-9",
                        p.valor ? "border-borde bg-superficie" : "border-marca bg-marca-suave text-marca-texto",
                      )}
                    >
                      {p.icono}
                      {p.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paso === "listo" && resultado && (
              <button onClick={reiniciar} className="flex min-h-[65vh] w-full flex-col items-center justify-center text-center">
                <p className="text-2xl font-medium tracking-widest text-texto-2">SU TURNO</p>
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", duration: 0.5, bounce: 0.25 }}
                  className="my-4 font-mono text-[9rem] leading-none font-black text-marca"
                >
                  {resultado.turno}
                </motion.p>
                <p className="text-3xl font-semibold">{resultado.destino}</p>
                <p className="mt-2 text-2xl text-texto-2">{resultado.delante === 0 ? "Es el próximo" : `${resultado.delante} antes que usted`}</p>
                {resultado.cobrar && (
                  <p className="mt-8 rounded-2xl bg-[color-mix(in_oklab,var(--aviso)_14%,var(--superficie))] px-8 py-4 text-2xl font-semibold text-aviso">
                    Pase a caja con su ticket
                  </p>
                )}
                <p className="mt-8 text-lg text-texto-3">Retire su ticket · Toque para terminar</p>
              </button>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <Modal abierto={!!error} onCerrar={() => setError(null)} ancho="sm" titulo="No se pudo completar" pie={<Boton onClick={() => setError(null)}>Entendido</Boton>}>
        <p className="text-lg">{error}</p>
        <p className="mt-2 text-texto-2">Si el problema sigue, pase a recepción.</p>
      </Modal>

      {resultado && createPortal(<TicketImpreso r={resultado} />, document.body)}
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h1 className="text-4xl font-bold tracking-tight">{children}</h1>;
}

function BotonGrande({ children, onClick, secundario }: { children: ReactNode; onClick: () => void; secundario?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-20 rounded-2xl text-2xl font-semibold transition-transform duration-150 active:scale-[0.97]",
        secundario ? "border border-borde bg-superficie text-texto" : "bg-marca text-white shadow-md",
      )}
    >
      {children}
    </button>
  );
}

function Teclado({ valor, onCambio, onListo, cargando, listo }: { valor: string; onCambio: (v: string) => void; onListo: () => void; cargando: boolean; listo: boolean }) {
  const tecla = "grid h-20 place-items-center rounded-2xl bg-superficie text-3xl font-semibold shadow-sm transition-transform duration-100 active:scale-[0.95] active:bg-superficie-2";
  return (
    <div className="grid grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
        <button key={n} className={tecla} onClick={() => onCambio(valor + n)}>
          {n}
        </button>
      ))}
      <button className={cn(tecla, "text-texto-2")} onClick={() => onCambio(valor.slice(0, -1))} aria-label="Borrar">
        <Delete className="size-8" />
      </button>
      <button className={tecla} onClick={() => onCambio(valor + "0")}>
        0
      </button>
      <button
        className={cn(tecla, "bg-marca text-xl text-white disabled:opacity-40")}
        disabled={!listo || cargando}
        onClick={onListo}
      >
        {cargando ? "…" : "Seguir"}
      </button>
    </div>
  );
}

/** Cabecera: logo (mantener 3 s para salir del modo quiosco), nombre y hora. */
function Cabecera() {
  const { sistema } = useSistema();
  const [ahora, setAhora] = useState(new Date());
  const [salir, setSalir] = useState(false);
  const pulsado = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const soltar = () => pulsado.current && clearTimeout(pulsado.current);
  return (
    <header className="flex items-center gap-4 px-10 py-6">
      <div
        onPointerDown={() => (pulsado.current = setTimeout(() => setSalir(true), 3000))}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        className="flex items-center gap-4"
      >
        {sistema.logo_url || sistema.logo_factura ? (
          <img
            src={(sistema.logo_url ?? sistema.logo_factura)!}
            alt=""
            className={cn("h-14 w-auto", !sistema.logo_url && "rounded-lg bg-white p-1")}
            draggable={false}
          />
        ) : (
          <HeartPulse className="size-12 text-marca" />
        )}
        <span className="text-2xl font-bold">{sistema.nombre}</span>
      </div>
      <span className="ml-auto text-2xl font-medium text-texto-2 tabular">{hora(ahora.toISOString())}</span>
      <SalirQuiosco abierto={salir} onCerrar={() => setSalir(false)} />
    </header>
  );
}

/** Solo el personal sale del quiosco: pide la contraseña de la cuenta del quiosco. */
function SalirQuiosco({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sesion, cerrarSesion } = useSesion();
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: sesion!.user.email!, password });
      if (error) throw new Error("Contraseña incorrecta.");
    },
    onSuccess: async () => {
      enviar("salir-quiosco");
      await cerrarSesion();
    },
  });
  useEffect(() => {
    if (!abierto) setPassword("");
  }, [abierto]);
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Salir del modo quiosco"
      descripcion="Solo personal autorizado."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!password} onClick={() => m.mutate()}>
            Salir
          </Boton>
        </>
      }
    >
      <Entrada etiqueta="Contraseña del quiosco" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={m.error?.message} autoFocus />
    </Modal>
  );
}

/** Ticket para la térmica (80 mm). Solo existe al imprimir (index.css: .area-impresion). */
function TicketImpreso({ r }: { r: Resultado }) {
  const { sistema } = useSistema();
  return (
    <div className="area-impresion hidden w-[72mm] bg-white p-2 font-mono text-[12px] text-black">
      {(sistema.logo_factura ?? sistema.logo_url) && <img src={(sistema.logo_factura ?? sistema.logo_url)!} alt="" className="mx-auto mb-1 max-h-16 w-auto" />}
      <p className="text-center font-bold">{sistema.nombre}</p>
      <div className="my-2 rounded-md border-2 border-black py-2 text-center">
        <p className="text-[11px] tracking-widest">SU TURNO</p>
        <p className="text-[34px] leading-none font-black">{r.turno}</p>
        <p className="mt-1">{r.destino}</p>
        <p className="text-[11px]">{r.delante === 0 ? "Es el próximo" : `${r.delante} antes que usted`}</p>
      </div>
      {r.cobrar && <p className="text-center font-bold">PASE A CAJA CON ESTE TICKET</p>}
      <p className="mt-1 text-center text-[11px]">{fechaHora(r.fecha)}</p>
      <p className="mt-1 text-center text-[11px]">Espere a ser llamado en la pantalla.</p>
    </div>
  );
}
