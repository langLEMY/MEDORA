import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, Camera, Check, ChevronLeft, Copy, KeyRound, LoaderCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RecorteFoto } from "@/components/RecorteFoto";
import { Boton } from "@/components/ui/boton";
import { Entrada, EntradaClave } from "@/components/ui/campos";
import { ConfetiCelebracion } from "@/components/ui/celebracion";
import { CodigoDigitos } from "@/components/ui/codigo";
import { EASE_SALIDA } from "@/components/ui/movimiento";
import { Avatar, Insignia } from "@/components/ui/superficies";
import type { Fila } from "@/lib/supabase";
import { mensajeError, supabase } from "@/lib/supabase";
import { cn, fecha, moneda, USUARIO_RE } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { actualizarPassword, RequisitosClave } from "./CambiarPassword";
import { PantallaAcceso } from "./PantallaAcceso";

type Paso = "usuario" | "foto" | "clave" | "dosPasos" | "plan";

interface PlanPorElegir {
  sistema_id: string;
  sistema: string;
  sedes: number;
}

interface Resumen {
  usuario: string;
  dosPasos: boolean;
  plan: { nombre: string; hasta: string } | null;
}

const TIPOS_FOTO = ["image/png", "image/jpeg", "image/webp"];
const ESPERA_FINAL_MS = 3200;

/**
 * Primer acceso guiado: nombre de usuario propio, foto (opcional), contraseña (si entró con una
 * temporal), verificación en dos pasos (opcional) y, para el primer administrador de un hospital
 * nuevo, el plan con 30 días gratis. Termina con «¡Todo listo!» y confeti, y lleva al Inicio.
 * Cada paso se guarda al continuar; completar_bienvenida cierra el recorrido en el servidor.
 */
export function Bienvenida() {
  const { perfil, recargar, cerrarSesion } = useSesion();

  const inicio = useQuery({
    queryKey: ["bienvenida", perfil?.id],
    enabled: !!perfil,
    staleTime: Infinity,
    queryFn: async () => {
      const [plan, factores, planes] = await Promise.all([
        supabase.rpc("plan_por_elegir"),
        supabase.auth.mfa.listFactors(),
        supabase.from("planes").select("*").eq("activo", true).order("orden").order("precio_sede"),
      ]);
      if (plan.error) throw plan.error;
      return {
        plan: (plan.data as unknown as PlanPorElegir | null) ?? null,
        tieneDosPasos: (factores.data?.totp ?? []).some((f) => f.status === "verified"),
        planes: planes.data ?? [],
      };
    },
  });

  // Los pasos se fijan una vez: guardar la contraseña cambia el perfil, pero el recorrido sigue igual.
  const [pasos, setPasos] = useState<Paso[] | null>(null);
  useEffect(() => {
    if (pasos || !inicio.data || !perfil) return;
    const p: Paso[] = ["usuario", "foto"];
    if (perfil.debe_cambiar_password) p.push("clave");
    if (!inicio.data.tieneDosPasos) p.push("dosPasos");
    if (inicio.data.plan && inicio.data.planes.length > 0) p.push("plan");
    setPasos(p);
  }, [inicio.data, perfil, pasos]);

  const [indice, setIndice] = useState(0);
  const [dir, setDir] = useState(1);
  const [usuario, setUsuario] = useState(perfil?.nombre_usuario ?? "");
  const [dosPasos, setDosPasos] = useState(false);
  const [planElegido, setPlanElegido] = useState<Resumen["plan"]>(null);
  const [terminado, setTerminado] = useState(false);
  const [terminando, setTerminando] = useState(false);

  const ir = (d: number) => {
    setDir(d);
    setIndice((i) => i + d);
  };

  const siguiente = async () => {
    if (!pasos) return;
    if (indice < pasos.length - 1) return ir(1);
    setTerminando(true);
    try {
      const { error } = await supabase.rpc("completar_bienvenida");
      if (error) throw error;
      setDir(1);
      setTerminado(true);
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setTerminando(false);
    }
  };

  if (inicio.isError)
    return (
      <PantallaAcceso>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">No pudimos preparar tu cuenta</h2>
        <p className="mt-2 text-sm text-texto-2">{mensajeError(inicio.error)}</p>
        <div className="mt-6 flex gap-2">
          <Boton onClick={() => void inicio.refetch()}>Reintentar</Boton>
          <Boton variante="secundario" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </Boton>
        </div>
      </PantallaAcceso>
    );

  if (!pasos || !perfil)
    return (
      <PantallaAcceso>
        <div className="grid h-40 place-items-center">
          <LoaderCircle className="size-6 animate-spin text-texto-3" />
        </div>
      </PantallaAcceso>
    );

  const paso = pasos[indice];
  const puedeVolver = !terminado && indice > 0 && (paso === "foto" || paso === "clave");

  return (
    <PantallaAcceso ancho="amplio" fluido>
      {!terminado && (
        <motion.div layout="position" className="mb-6">
          <div className="mb-3 flex h-7 items-center justify-between">
            <AnimatePresence initial={false}>
              {puedeVolver ? (
                <motion.button
                  key="atras"
                  type="button"
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: EASE_SALIDA }}
                  onClick={() => ir(-1)}
                  className="-ml-1.5 inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-sm text-marca-texto transition-colors hover:bg-marca-suave"
                >
                  <ChevronLeft className="size-4" /> Atrás
                </motion.button>
              ) : (
                <span />
              )}
            </AnimatePresence>
            <div className="flex items-center gap-3 text-xs text-texto-3">
              <span className="tabular" aria-live="polite">
                Paso {indice + 1} de {pasos.length}
              </span>
              <button type="button" onClick={() => void cerrarSesion()} className="transition-colors hover:text-texto-2">
                Salir
              </button>
            </div>
          </div>
          <Progreso total={pasos.length} actual={indice} />
        </motion.div>
      )}

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={terminado ? "listo" : paso}
          layout="position"
          custom={dir}
          variants={{
            entra: (d: number) => ({ opacity: 0, x: d * 20 }),
            visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_SALIDA } },
            sale: (d: number) => ({ opacity: 0, x: d * -14, transition: { duration: 0.14, ease: "easeOut" } }),
          }}
          initial="entra"
          animate="visible"
          exit="sale"
        >
          {terminado ? (
            <TodoListo
              nombre={perfil.nombre_completo}
              resumen={{ usuario, dosPasos: dosPasos || !!inicio.data?.tieneDosPasos, plan: planElegido }}
              onEntrar={recargar}
            />
          ) : paso === "usuario" ? (
            <PasoUsuario perfil={perfil} valor={usuario} onCambio={setUsuario} onListo={siguiente} />
          ) : paso === "foto" ? (
            <PasoFoto perfil={perfil} onListo={siguiente} />
          ) : paso === "clave" ? (
            <PasoClave usuario={usuario} onListo={siguiente} />
          ) : paso === "dosPasos" ? (
            <PasoDosPasos
              terminando={terminando}
              onListo={(activo) => {
                setDosPasos(activo);
                void siguiente();
              }}
            />
          ) : (
            <PasoPlan
              info={inicio.data!.plan!}
              planes={inicio.data!.planes}
              onListo={(p) => {
                setPlanElegido(p);
                void siguiente();
              }}
              terminando={terminando}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </PantallaAcceso>
  );
}

/** Barra de pasos segmentada, como el progreso de configuración de iOS. Solo scaleX. */
function Progreso({ total, actual }: { total: number; actual: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--texto)_9%,transparent)]">
          <motion.span
            className="block h-full origin-left rounded-full bg-marca"
            initial={false}
            animate={{ scaleX: i <= actual ? 1 : 0 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.05, delay: i === actual ? 0.08 : 0 }}
          />
        </span>
      ))}
    </div>
  );
}

function Encabezado({ icono, titulo, texto, etiqueta }: { icono: ReactNode; titulo: string; texto: ReactNode; etiqueta?: string }) {
  return (
    <div className="mb-6">
      <div className="mb-4 grid size-11 place-items-center rounded-[14px] bg-marca-suave text-marca">{icono}</div>
      {etiqueta && <p className="mb-1 text-[0.8125rem] font-medium text-marca-texto">{etiqueta}</p>}
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-balance">{titulo}</h2>
      <p className="mt-1.5 text-sm text-pretty text-texto-2">{texto}</p>
    </div>
  );
}

// ── Usuario ─────────────────────────────────────────────────────────────────────────────────────

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Propuestas a partir del nombre: juan.perez, jperez, juanp (en RD suele haber dos apellidos). */
function sugerencias(nombre: string, actual: string) {
  const partes = sinAcentos(nombre).replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (partes.length < 2) return [];
  const primero = partes[0];
  const apellido = partes.length >= 3 ? partes[partes.length - 2] : partes[1];
  return [...new Set([`${primero}.${apellido}`, `${primero[0]}${apellido}`, `${primero}${apellido[0]}`])]
    .filter((s) => USUARIO_RE.test(s) && s !== actual)
    .slice(0, 3);
}

type Estado = "vacio" | "invalido" | "revisando" | "libre" | "ocupado";

function PasoUsuario({ perfil, valor, onCambio, onListo }: {
  perfil: Fila<"perfiles">;
  valor: string;
  onCambio: (v: string) => void;
  onListo: () => void;
}) {
  const [estado, setEstado] = useState<Estado>("vacio");
  const [guardando, setGuardando] = useState(false);
  const propuestas = useMemo(() => sugerencias(perfil.nombre_completo, valor), [perfil.nombre_completo, valor]);
  const primerNombre = perfil.nombre_completo.trim().split(/\s+/)[0] || "";

  // Disponibilidad mientras escribe (con pausa, y descartando respuestas viejas).
  useEffect(() => {
    if (!valor) return setEstado("vacio");
    if (!USUARIO_RE.test(valor)) return setEstado("invalido");
    if (valor === perfil.nombre_usuario) return setEstado("libre");
    setEstado("revisando");
    let vigente = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("usuario_disponible", { p_usuario: valor });
      if (vigente) setEstado(error ? "invalido" : data ? "libre" : "ocupado");
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [valor, perfil.nombre_usuario]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (estado !== "libre") return;
    setGuardando(true);
    try {
      if (valor !== perfil.nombre_usuario) {
        const { error } = await supabase.rpc("elegir_nombre_usuario", { p_usuario: valor });
        if (error) throw error;
      }
      onListo();
    } catch (err) {
      toast.error(mensajeError(err));
      setEstado("ocupado");
    } finally {
      setGuardando(false);
    }
  };

  const indicador =
    estado === "revisando" ? (
      <LoaderCircle className="mr-3 size-4 animate-spin text-texto-3" />
    ) : estado === "libre" ? (
      <motion.span key="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.3, bounce: 0.3 }} className="mr-3 grid place-items-center">
        <Check className="size-4 text-exito" strokeWidth={3} />
      </motion.span>
    ) : estado === "ocupado" ? (
      <X className="mr-3 size-4 text-peligro" strokeWidth={3} />
    ) : null;

  return (
    <form onSubmit={guardar} noValidate>
      <Encabezado
        icono={<AtSign className="size-5" />}
        etiqueta={primerNombre ? `Hola, ${primerNombre}` : "Bienvenido"}
        titulo="Elige tu nombre de usuario"
        texto="Con él entrarás a MEDORA. Que sea tuyo, corto y fácil de recordar."
      />
      <Entrada
        etiqueta="Nombre de usuario"
        autoFocus
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={40}
        placeholder="nombre.apellido"
        icono={<AtSign className="size-4" />}
        accion={indicador}
        value={valor}
        onChange={(e) => onCambio(e.target.value.toLowerCase().replace(/\s/g, ""))}
        error={
          estado === "ocupado"
            ? "Ese usuario ya lo usa otra persona."
            : estado === "invalido"
              ? "Usa letras minúsculas, números, punto, guion o guion bajo (de 2 a 40)."
              : undefined
        }
        ayuda={estado === "libre" ? "Disponible." : "Sin espacios ni acentos."}
      />
      {propuestas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-texto-3">Ideas:</span>
          {propuestas.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onCambio(s)}
              className="rounded-full bg-[color-mix(in_oklab,var(--texto)_6%,transparent)] px-2.5 py-1 text-xs font-medium text-texto-2 transition-colors hover:bg-marca-suave hover:text-marca-texto"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <Boton type="submit" tamano="lg" className="mt-7 w-full justify-center" cargando={guardando} disabled={estado !== "libre"}>
        Continuar
      </Boton>
    </form>
  );
}

// ── Foto ────────────────────────────────────────────────────────────────────────────────────────

function PasoFoto({ perfil, onListo }: { perfil: Fila<"perfiles">; onListo: () => void }) {
  const [foto, setFoto] = useState<string | null>(perfil.foto);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const elegir = (f: File | undefined | null) => {
    if (!f) return;
    if (!TIPOS_FOTO.includes(f.type)) return toast.error("Elige una imagen JPG, PNG o WebP.");
    setArchivo(f);
  };

  const continuar = async () => {
    if (foto === perfil.foto) return onListo();
    setGuardando(true);
    try {
      const { error } = await supabase.from("perfiles").update({ foto }).eq("id", perfil.id);
      if (error) throw error;
      onListo();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <Encabezado
        icono={<Camera className="size-5" />}
        titulo="Ponle cara a tu cuenta"
        texto="Tus compañeros te reconocen más rápido en la agenda, los mensajes y el personal. Es opcional."
      />
      <div
        className="flex flex-col items-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          elegir(e.dataTransfer.files?.[0]);
        }}
      >
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          aria-label={foto ? "Cambiar la foto" : "Elegir una foto"}
          className="group relative rounded-full outline-none focus-visible:ring-4 focus-visible:ring-marca/30"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={foto ?? "sin-foto"}
              className="block rounded-full ring-4 ring-superficie shadow-[0_8px_24px_-8px_rgb(16_24_40/0.35)]"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
            >
              <Avatar nombre={perfil.nombre_completo} foto={foto} tamano={112} />
            </motion.span>
          </AnimatePresence>
          <span className="absolute right-0.5 bottom-0.5 grid size-9 place-items-center rounded-full bg-marca text-white shadow-md ring-[3px] ring-superficie transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
            <Camera className="size-4" />
          </span>
        </button>
        <input
          ref={entrada}
          type="file"
          accept={TIPOS_FOTO.join(",")}
          className="hidden"
          onChange={(e) => {
            elegir(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="mt-4 text-sm font-medium">{perfil.nombre_completo}</p>
        <div className="mt-1 h-5">
          {foto ? (
            <button type="button" onClick={() => setFoto(null)} className="text-xs font-medium text-peligro hover:underline">
              Quitar foto
            </button>
          ) : (
            <p className="text-xs text-texto-3">Toca el círculo o arrastra una imagen.</p>
          )}
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-2">
        {foto ? (
          <Boton tamano="lg" className="w-full justify-center" cargando={guardando} onClick={() => void continuar()}>
            Continuar
          </Boton>
        ) : (
          <>
            <Boton tamano="lg" className="w-full justify-center" icono={<Camera className="size-4" />} onClick={() => entrada.current?.click()}>
              Elegir una foto
            </Boton>
            <Boton variante="fantasma" className="w-full justify-center" cargando={guardando} onClick={() => void continuar()}>
              Ahora no
            </Boton>
          </>
        )}
      </div>

      <RecorteFoto
        archivo={archivo}
        forma="circulo"
        onCancelar={() => setArchivo(null)}
        onListo={(img) => {
          setFoto(img);
          setArchivo(null);
        }}
      />
    </div>
  );
}

// ── Contraseña ──────────────────────────────────────────────────────────────────────────────────

function PasoClave({ usuario, onListo }: { usuario: string; onListo: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Mínimo 10 caracteres.");
    if (/^\d+$/.test(password)) return setError("No puede ser solo números.");
    if (usuario && password.toLowerCase().includes(usuario.toLowerCase())) return setError("No puede contener tu usuario.");
    if (password !== confirmar) return setError("Las contraseñas no coinciden.");
    setGuardando(true);
    try {
      await actualizarPassword(password);
      onListo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} noValidate>
      <Encabezado
        icono={<KeyRound className="size-5" />}
        titulo="Crea tu contraseña"
        texto="Entraste con una contraseña temporal. Elige una que solo tú conozcas; nadie de soporte te la pedirá."
      />
      <div className="space-y-4">
        <EntradaClave etiqueta="Nueva contraseña" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
        <EntradaClave etiqueta="Confirmar contraseña" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        <RequisitosClave password={password} confirmar={confirmar} usuario={usuario} />
      </div>
      <Boton type="submit" tamano="lg" className="mt-7 w-full justify-center" cargando={guardando} disabled={!password || !confirmar}>
        Guardar y continuar
      </Boton>
    </form>
  );
}

// ── Dos pasos ───────────────────────────────────────────────────────────────────────────────────

function PasoDosPasos({ onListo, terminando }: { onListo: (activo: boolean) => void; terminando: boolean }) {
  const { actualizarVerificacion } = useSesion();
  const [alta, setAlta] = useState<{ factorId: string; qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState(false);

  const empezar = async () => {
    setOcupado(true);
    try {
      // Un alta a medias (sin verificar) bloquea otra con el mismo nombre: se limpia.
      const { data: todos } = await supabase.auth.mfa.listFactors();
      for (const f of todos?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MEDORA", issuer: "MEDORA" });
      if (error) throw error;
      setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const verificar = async (v: string) => {
    if (!alta) return;
    setOcupado(true);
    setError(false);
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: alta.factorId, code: v });
    if (e) {
      setError(true);
      setCodigo("");
      setOcupado(false);
      return;
    }
    void supabase.rpc("registrar_evento", { p_accion: "ACTIVAR_2FA" });
    await actualizarVerificacion();
    setOcupado(false);
    setHecho(true);
    setTimeout(() => onListo(true), 900);
  };

  if (hecho)
    return (
      <div className="py-6 text-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.3 }}
          className="mx-auto grid size-16 place-items-center rounded-full bg-[color-mix(in_oklab,var(--exito)_14%,var(--superficie))] text-exito"
        >
          <ShieldCheck className="size-8" />
        </motion.span>
        <p className="mt-4 text-lg font-semibold tracking-[-0.01em]">Verificación activada</p>
        <p className="mt-1 text-sm text-texto-2">Desde ahora, MEDORA te pedirá el código al entrar.</p>
      </div>
    );

  return (
    <div>
      <Encabezado
        icono={<ShieldCheck className="size-5" />}
        titulo="Protege tu cuenta con dos pasos"
        texto={
          alta
            ? "Escanea el código con tu aplicación de autenticación (Google Authenticator, Microsoft Authenticator…) y escribe los 6 números que aparecen."
            : "Además de la contraseña, al entrar te pediremos un código de 6 números de tu teléfono. Aunque alguien sepa tu contraseña, no podrá entrar."
        }
      />
      <AnimatePresence mode="wait" initial={false}>
        {alta ? (
          <motion.div
            key="alta"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_SALIDA }}
            className="space-y-4"
          >
            <div className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-borde">
              <img src={alta.qr} alt="Código QR para la aplicación de autenticación" className="size-40" />
            </div>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(alta.secreto).then(() => toast.success("Clave copiada"))}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-superficie-2 px-3 py-2 font-mono text-xs break-all text-texto-2 transition-colors hover:text-texto"
              title="Copiar la clave para escribirla a mano"
            >
              <Copy className="size-3.5 shrink-0" />
              {alta.secreto}
            </button>
            <div>
              <CodigoDigitos valor={codigo} onChange={setCodigo} onCompleto={(v) => void verificar(v)} deshabilitado={ocupado} error={error} autoFocus />
              <p className={cn("mt-2 h-4 text-center text-xs", error ? "text-peligro" : "text-texto-3")}>
                {error ? "Código incorrecto. Escribe el que muestra ahora tu aplicación." : ocupado ? "Verificando…" : ""}
              </p>
            </div>
            <Boton variante="fantasma" className="w-full justify-center" disabled={ocupado || terminando} onClick={() => onListo(false)}>
              Lo activo después
            </Boton>
          </motion.div>
        ) : (
          <motion.div key="intro" exit={{ opacity: 0, transition: { duration: 0.12 } }} className="flex flex-col gap-2">
            <Boton tamano="lg" className="w-full justify-center" cargando={ocupado} icono={<ShieldCheck className="size-4" />} onClick={() => void empezar()}>
              Activar verificación
            </Boton>
            <Boton variante="fantasma" className="w-full justify-center" cargando={terminando} onClick={() => onListo(false)}>
              Ahora no
            </Boton>
            <p className="mt-1 text-center text-xs text-texto-3">Puedes activarla cuando quieras en Mi perfil.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────

function PasoPlan({ info, planes, onListo, terminando }: {
  info: PlanPorElegir;
  planes: Fila<"planes">[];
  onListo: (p: { nombre: string; hasta: string }) => void;
  terminando: boolean;
}) {
  const [elegido, setElegido] = useState(() => (planes.find((p) => p.destacado) ?? planes[0])?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const plan = planes.find((p) => p.id === elegido);

  const confirmar = async () => {
    if (!plan) return;
    setGuardando(true);
    try {
      const { data, error } = await supabase.rpc("elegir_plan", { p_sistema: info.sistema_id, p_plan: plan.id });
      if (error) throw error;
      const r = data as unknown as { plan: string; prueba_hasta: string };
      onListo({ nombre: r.plan, hasta: r.prueba_hasta });
    } catch (e) {
      toast.error(mensajeError(e));
      setGuardando(false);
    }
  };

  return (
    <div>
      <Encabezado
        icono={<Sparkles className="size-5" />}
        etiqueta={info.sistema}
        titulo="Elige el plan de tu hospital"
        texto={
          <>
            Los primeros <span className="font-medium text-texto">30 días son gratis</span>. Después se cobra por sede:{" "}
            {info.sedes === 1 ? "hoy tienes 1 sede" : `hoy tienes ${info.sedes} sedes`}.
          </>
        }
      />
      <div role="radiogroup" aria-label="Planes" className="space-y-2.5">
        {planes.map((p) => {
          const activo = p.id === elegido;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setElegido(p.id)}
              className={cn(
                "relative w-full rounded-2xl border p-4 text-left transition-colors duration-150",
                activo ? "border-transparent" : "border-borde hover:bg-superficie-2/60",
              )}
            >
              {activo && (
                <motion.span
                  layoutId="plan-elegido"
                  className="absolute inset-0 rounded-2xl bg-marca-suave/60 ring-2 ring-marca"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
                />
              )}
              <span className="relative flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150",
                    activo ? "border-marca bg-marca text-white" : "border-borde-fuerte",
                  )}
                >
                  {activo && <Check className="size-3" strokeWidth={3.5} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.nombre}</span>
                        {p.destacado && <Insignia tono="marca">Recomendado</Insignia>}
                      </span>
                      {p.descripcion && <span className="mt-0.5 block text-[0.8125rem] text-texto-2">{p.descripcion}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[0.9375rem] font-semibold tabular">{moneda(p.precio_sede)}</span>
                      <span className="block text-[0.6875rem] text-texto-3">por sede / mes</span>
                    </span>
                  </span>
                  {p.caracteristicas.length > 0 && (
                    <span className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-[color-mix(in_oklab,var(--texto)_7%,transparent)] pt-3 sm:grid-cols-2">
                      {p.caracteristicas.map((c) => (
                        <span key={c} className="flex items-start gap-1.5 text-xs text-texto-2">
                          <Check className="mt-0.5 size-3 shrink-0 text-exito" strokeWidth={3} />
                          {c}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {plan && (
        <p className="mt-4 text-center text-xs text-texto-3">
          Al terminar la prueba: {moneda(Number(plan.precio_sede) * info.sedes)} al mes con {info.sedes === 1 ? "tu sede" : `tus ${info.sedes} sedes`}. Nada
          se cobra durante la prueba.
        </p>
      )}
      <Boton tamano="lg" className="mt-5 w-full justify-center" cargando={guardando || terminando} disabled={!plan} onClick={() => void confirmar()}>
        Empezar 30 días gratis
      </Boton>
    </div>
  );
}

// ── ¡Todo listo! ────────────────────────────────────────────────────────────────────────────────

function TodoListo({ nombre, resumen, onEntrar }: { nombre: string; resumen: Resumen; onEntrar: () => Promise<void> }) {
  const navigate = useNavigate();
  const icono = useRef<HTMLDivElement>(null);
  const [origen, setOrigen] = useState<{ x: number; y: number } | null>(null);
  const saliendo = useRef(false);
  const primerNombre = nombre.trim().split(/\s+/)[0] || "";

  // El confeti sale desde el ícono de la marca de verificación.
  useLayoutEffect(() => {
    const r = icono.current?.getBoundingClientRect();
    if (r) setOrigen({ x: ((r.left + r.width / 2) / window.innerWidth) * 100, y: ((r.top + r.height / 2) / window.innerHeight) * 100 });
  }, []);

  const entrar = () => {
    if (saliendo.current) return;
    saliendo.current = true;
    navigate("/", { replace: true });
    void onEntrar();
  };

  useEffect(() => {
    const t = setTimeout(entrar, ESPERA_FINAL_MS);
    return () => clearTimeout(t);
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filas = [
    { texto: <>Entrarás como <span className="font-medium text-texto">@{resumen.usuario}</span></> },
    { texto: resumen.dosPasos ? "Verificación en dos pasos activa" : "Contraseña lista" },
    ...(resumen.plan
      ? [{ texto: <>Plan <span className="font-medium text-texto">{resumen.plan.nombre}</span> · gratis hasta el {fecha(`${resumen.plan.hasta}T12:00:00`)}</> }]
      : []),
  ];

  return (
    <div className="py-2 text-center">
      {origen && <ConfetiCelebracion origen={origen} />}
      <div ref={icono} className="relative mx-auto grid size-20 place-items-center">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-exito"
          initial={{ opacity: 0.35, scale: 1 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.9, delay: 0.15, ease: EASE_SALIDA }}
        />
        <motion.span
          className="relative grid size-20 place-items-center rounded-full bg-exito text-white shadow-[0_12px_30px_-10px_color-mix(in_oklab,var(--exito)_70%,transparent)]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", duration: 0.55, bounce: 0.35 }}
        >
          <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.42, delay: 0.22, ease: [0.65, 0, 0.35, 1] }} />
          </svg>
        </motion.span>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: EASE_SALIDA }}
        className="mt-6 text-[1.75rem] font-semibold tracking-[-0.025em]"
      >
        ¡Todo listo!
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4, ease: EASE_SALIDA }}
        className="mt-1.5 text-sm text-texto-2"
      >
        {primerNombre ? `${primerNombre}, tu` : "Tu"} cuenta está preparada. Bienvenido a MEDORA.
      </motion.p>

      <motion.ul
        initial="inicial"
        animate="visible"
        variants={{ inicial: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.5 } } }}
        className="mx-auto mt-6 w-fit max-w-full space-y-2 text-left"
      >
        {filas.map((f, i) => (
          <motion.li
            key={i}
            variants={{ inicial: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_SALIDA } } }}
            className="flex items-center gap-2.5 text-sm text-texto-2"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--exito)_16%,transparent)] text-exito">
              <Check className="size-3" strokeWidth={3.5} />
            </span>
            <span>{f.texto}</span>
          </motion.li>
        ))}
      </motion.ul>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.75 }} className="mt-8">
        <Boton tamano="lg" className="relative w-full justify-center overflow-hidden" onClick={entrar}>
          {/* Cuenta regresiva discreta: el botón se «llena» hasta entrar solo. */}
          <motion.span
            aria-hidden
            className="absolute inset-0 origin-left bg-white/12"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: ESPERA_FINAL_MS / 1000, ease: "linear" }}
          />
          <span className="relative">Ir al inicio</span>
        </Boton>
      </motion.div>
    </div>
  );
}
