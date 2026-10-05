import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useAnimation } from "motion/react";
import { Check, Clock, Info, User, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { Entrada, EntradaClave } from "@/components/ui/campos";
import { Avatar } from "@/components/ui/superficies";
import { cuentaRecordada, recordarCuenta, saludo, tomarAvisoSalida, type CuentaRecordada } from "@/lib/equipo";
import { ErrorFuncion, invocar, mensajeError, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PantallaAcceso } from "./PantallaAcceso";
import { RecuperarPassword } from "./RecuperarPassword";
import { Registro } from "./Registro";

const esquema = z.object({
  usuario: z.string().trim().min(2, "Escribe tu usuario"),
  password: z.string().min(1, "Escribe tu contraseña"),
});
type Datos = z.infer<typeof esquema>;

type Problema = { tipo: "error" | "sin-conexion"; texto: string } | { tipo: "espera"; hasta: number };

/** "4:32" a partir de segundos. */
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Login() {
  const [problema, setProblema] = useState<Problema | null>(null);
  const [registro, setRegistro] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const [recordada, setRecordada] = useState<CuentaRecordada | null>(cuentaRecordada);
  const [recordar, setRecordar] = useState(() => !!cuentaRecordada());
  const [avisoSalida] = useState(tomarAvisoSalida);
  const sacudir = useAnimation();
  const { register, handleSubmit, formState, setValue, setFocus } = useForm<Datos>({
    resolver: zodResolver(esquema),
    defaultValues: { usuario: recordada?.usuario ?? "" },
  });

  // Cuenta regresiva si se bloqueó por demasiados intentos.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (problema?.tipo !== "espera") return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [problema]);
  const restante = problema?.tipo === "espera" ? Math.max(0, Math.ceil((problema.hasta - ahora) / 1000)) : 0;
  useEffect(() => {
    if (problema?.tipo === "espera" && restante === 0) setProblema(null);
  }, [problema, restante]);

  useEffect(() => {
    setFocus(recordada ? "password" : "usuario");
  }, [recordada, setFocus]);

  const entrar = handleSubmit(async ({ usuario, password }) => {
    setProblema(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setProblema({ tipo: "sin-conexion", texto: "No hay conexión a internet. Revisa el cable o el Wi-Fi e inténtalo de nuevo." });
      return;
    }
    // El servidor (Edge Function "acceso") resuelve usuario→correo sin revelarlo,
    // limita los intentos, migra la contraseña heredada de FUNBIDE y devuelve la
    // sesión. Si la cuenta tiene 2FA, la Puerta pide el código a continuación.
    try {
      const tokens = await invocar<{ access_token: string; refresh_token: string }>("acceso", { usuario, password });
      const { data, error } = await supabase.auth.setSession(tokens);
      if (error) throw error;
      void supabase.rpc("registrar_evento", { p_accion: "LOGIN" });
      // Recordar el usuario (nunca la contraseña) solo si se pidió.
      if (recordar && data.user) {
        const { data: p } = await supabase.from("perfiles").select("nombre_completo, foto, nombre_usuario").eq("id", data.user.id).maybeSingle();
        recordarCuenta({ usuario: p?.nombre_usuario ?? usuario.trim().toLowerCase(), nombre: p?.nombre_completo ?? usuario, foto: p?.foto ?? null });
      } else if (!recordar) recordarCuenta(null);
    } catch (e) {
      if (e instanceof ErrorFuncion && e.estado === 429) {
        setProblema({ tipo: "espera", hasta: Date.now() + Number(e.cuerpo?.espera_seg ?? 300) * 1000 });
      } else if (e instanceof ErrorFuncion && e.sinConexion) {
        setProblema({ tipo: "sin-conexion", texto: "No se pudo conectar con MEDORA. Revisa tu internet e inténtalo de nuevo." });
      } else {
        setProblema({ tipo: "error", texto: mensajeError(e) });
        setValue("password", "");
        setFocus("password");
      }
      // Sacudida corta: "no" sin necesidad de leer.
      void sacudir.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.4 } });
    }
  });

  const otraCuenta = () => {
    recordarCuenta(null);
    setRecordada(null);
    setRecordar(false);
    setValue("usuario", "");
    setValue("password", "");
    setProblema(null);
  };

  const titulo = useMemo(() => (recordada ? `${saludo()}, ${recordada.nombre.split(" ")[0]}` : saludo()), [recordada]);

  if (registro)
    return (
      <PantallaAcceso>
        <Registro onVolver={() => setRegistro(false)} />
      </PantallaAcceso>
    );

  const bloqueado = problema?.tipo === "espera";

  return (
    <PantallaAcceso>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">{titulo}</h2>
      <p className="mt-1.5 text-sm text-texto-2">
        {recordada ? "Escribe tu contraseña para continuar." : "Inicia sesión con el usuario que te dio la administración de tu hospital."}
      </p>

      {avisoSalida && !problema && (
        <p className="mt-6 flex items-start gap-2.5 rounded-xl bg-superficie-2 px-3.5 py-3 text-sm text-texto-2">
          <Info className="mt-0.5 size-4 shrink-0 text-marca" />
          Tu sesión se cerró por seguridad. Vuelve a entrar para continuar.
        </p>
      )}

      <motion.form animate={sacudir} onSubmit={entrar} className="mt-8 space-y-4" noValidate>
        {recordada ? (
          <div className="flex items-center gap-3 rounded-xl border border-borde bg-superficie-2/60 p-3">
            <Avatar nombre={recordada.nombre} foto={recordada.foto} tamano={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{recordada.nombre}</p>
              <p className="truncate text-xs text-texto-3">@{recordada.usuario}</p>
            </div>
            <button type="button" onClick={otraCuenta} className="shrink-0 text-xs font-medium text-marca-texto hover:underline">
              Usar otra cuenta
            </button>
            <input type="hidden" {...register("usuario")} />
          </div>
        ) : (
          <Entrada
            etiqueta="Usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            icono={<User />}
            placeholder="nombre.apellido"
            error={formState.errors.usuario?.message}
            {...register("usuario")}
          />
        )}
        <EntradaClave
          etiqueta="Contraseña"
          autoComplete="current-password"
          placeholder="••••••••••"
          error={formState.errors.password?.message}
          extraEtiqueta={
            <button type="button" onClick={() => setRecuperar(true)} className="text-xs font-medium text-marca-texto hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          }
          {...register("password")}
        />

        {!recordada && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-texto-2 select-none">
            <span
              className={cn(
                "grid size-[1.125rem] shrink-0 place-items-center rounded-[5px] border transition-colors duration-150",
                recordar ? "border-marca bg-marca text-white" : "border-borde-fuerte bg-superficie",
              )}
            >
              {recordar && <Check className="size-3" strokeWidth={3} />}
            </span>
            <input type="checkbox" className="sr-only" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Recordar mi usuario en este equipo
          </label>
        )}

        <AnimatePresence initial={false}>
          {problema && (
            <motion.div
              key={problema.tipo}
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm",
                problema.tipo === "error" ? "bg-[color-mix(in_oklab,var(--peligro)_8%,transparent)] text-peligro" : "bg-[color-mix(in_oklab,var(--aviso)_10%,transparent)] text-texto",
              )}
            >
              {problema.tipo === "espera" ? (
                <>
                  <Clock className="mt-0.5 size-4 shrink-0 text-aviso" />
                  <span>
                    Demasiados intentos seguidos. Por seguridad, espera <b className="tabular">{reloj(restante)}</b> para volver a intentar.
                  </span>
                </>
              ) : problema.tipo === "sin-conexion" ? (
                <>
                  <WifiOff className="mt-0.5 size-4 shrink-0 text-aviso" />
                  <span>{problema.texto}</span>
                </>
              ) : (
                <span>{problema.texto}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <Boton type="submit" tamano="lg" className="w-full justify-center" cargando={formState.isSubmitting} disabled={bloqueado}>
          {bloqueado ? `Espera ${reloj(restante)}` : "Iniciar sesión"}
        </Boton>
      </motion.form>

      <p className="mt-10 text-center text-xs text-texto-3">
        ¿Te invitaron como administrador?{" "}
        <button onClick={() => setRegistro(true)} className="font-medium text-marca-texto hover:underline">
          Usar código de invitación
        </button>
      </p>
      <RecuperarPassword abierto={recuperar} onCerrar={() => setRecuperar(false)} />
    </PantallaAcceso>
  );
}
