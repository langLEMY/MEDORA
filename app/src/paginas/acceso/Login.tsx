import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useAnimation } from "motion/react";
import { ArrowRight, Lock, TicketCheck, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { Entrada, EntradaClave } from "@/components/ui/campos";
import { ErrorFuncion, invocar, mensajeError, supabase } from "@/lib/supabase";
import { PantallaAcceso } from "./PantallaAcceso";
import { RecuperarPassword } from "./RecuperarPassword";
import { Registro } from "./Registro";

const esquema = z.object({
  usuario: z.string().trim().min(2, "Escribe tu usuario"),
  password: z.string().min(1, "Escribe tu contraseña"),
});
type Datos = z.infer<typeof esquema>;

export function Login() {
  const [error, setError] = useState<string | null>(null);
  const [registro, setRegistro] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const sacudir = useAnimation();
  const { register, handleSubmit, formState, setValue } = useForm<Datos>({ resolver: zodResolver(esquema) });

  const entrar = handleSubmit(async ({ usuario, password }) => {
    setError(null);
    // El servidor (Edge Function "acceso") resuelve usuario→correo sin revelarlo,
    // limita los intentos, migra la contraseña heredada de FUNBIDE y devuelve la
    // sesión. Si la cuenta tiene 2FA, la Puerta pide el código a continuación.
    let error: unknown = null;
    try {
      const tokens = await invocar<{ access_token: string; refresh_token: string }>("acceso", { usuario, password });
      ({ error } = await supabase.auth.setSession(tokens));
    } catch (e) {
      error = e;
    }
    if (error) {
      // Bloqueo por demasiados intentos: decir cuánto esperar (el servidor manda espera_seg).
      const espera = error instanceof ErrorFuncion && error.estado === 429 ? Math.max(1, Math.ceil(Number(error.cuerpo?.espera_seg ?? 300) / 60)) : 0;
      setError(espera ? `Demasiados intentos seguidos. Por seguridad, espera ${espera} min para volver a intentar.` : mensajeError(error));
      setValue("password", "");
      // Sacudida corta: "no" sin necesidad de leer.
      void sacudir.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.4 } });
      return;
    }
    void supabase.rpc("registrar_evento", { p_accion: "LOGIN" });
  });

  if (registro)
    return (
      <PantallaAcceso>
        <Registro onVolver={() => setRegistro(false)} />
      </PantallaAcceso>
    );

  return (
    <PantallaAcceso>
      <div className="text-center">
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em]">Bienvenido de nuevo</h1>
        <p className="mt-1.5 text-sm text-texto-2">Inicia sesión con el usuario que te asignó la administración.</p>
      </div>

      <motion.form animate={sacudir} onSubmit={entrar} className="mt-7 space-y-4" noValidate>
        <Entrada
          etiqueta="Usuario"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          icono={<User />}
          placeholder="nombre.apellido"
          error={formState.errors.usuario?.message}
          {...register("usuario")}
        />
        <EntradaClave
          etiqueta="Contraseña"
          extraEtiqueta={
            <button type="button" onClick={() => setRecuperar(true)} className="text-xs font-medium text-marca-texto hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          }
          autoComplete="current-password"
          icono={<Lock />}
          placeholder="••••••••••"
          error={formState.errors.password?.message}
          {...register("password")}
        />
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-[color-mix(in_oklab,var(--peligro)_8%,transparent)] px-3 py-2 text-sm text-peligro"
          >
            {error}
          </motion.p>
        )}
        <Boton type="submit" tamano="lg" className="group w-full justify-center" cargando={formState.isSubmitting}>
          Iniciar sesión
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Boton>
      </motion.form>

      <div className="mt-7 flex items-center gap-3 text-[0.6875rem] tracking-wide text-texto-3 uppercase">
        <span className="h-px flex-1 bg-borde" />o<span className="h-px flex-1 bg-borde" />
      </div>
      <button
        type="button"
        onClick={() => setRegistro(true)}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-borde px-4 py-2.5 text-sm text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto"
      >
        <TicketCheck className="size-4 shrink-0 text-marca-texto" />
        <span>
          <span className="font-medium text-texto">Crear cuenta</span> con código de invitación
        </span>
      </button>
      <RecuperarPassword abierto={recuperar} onCerrar={() => setRecuperar(false)} />
    </PantallaAcceso>
  );
}
