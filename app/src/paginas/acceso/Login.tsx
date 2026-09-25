import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useAnimation } from "motion/react";
import { Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { mensajeError, supabase } from "@/lib/supabase";
import { PantallaAcceso } from "./PantallaAcceso";

const esquema = z.object({
  email: z.email("Correo inválido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});
type Datos = z.infer<typeof esquema>;

export function Login() {
  const [error, setError] = useState<string | null>(null);
  const sacudir = useAnimation();
  const { register, handleSubmit, formState } = useForm<Datos>({ resolver: zodResolver(esquema) });

  const entrar = handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setError(mensajeError(error));
      // Sacudida corta: "no" sin necesidad de leer.
      void sacudir.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.4 } });
      return;
    }
    void supabase.rpc("registrar_evento", { p_accion: "LOGIN" });
  });

  return (
    <PantallaAcceso>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Bienvenido de nuevo</h2>
      <p className="mt-1.5 text-sm text-texto-2">Inicia sesión con tu cuenta institucional.</p>

      <motion.form animate={sacudir} onSubmit={entrar} className="mt-8 space-y-4" noValidate>
        <Entrada
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="username"
          icono={<Mail />}
          placeholder="nombre@hospital.com"
          error={formState.errors.email?.message}
          {...register("email")}
        />
        <Entrada
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          icono={<Lock />}
          placeholder="••••••••••"
          error={formState.errors.password?.message}
          {...register("password")}
        />
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-[color-mix(in_oklab,var(--peligro)_8%,transparent)] px-3 py-2 text-sm text-peligro"
          >
            {error}
          </motion.p>
        )}
        <Boton type="submit" tamano="lg" className="w-full justify-center" cargando={formState.isSubmitting}>
          Iniciar sesión
        </Boton>
      </motion.form>

      <p className="mt-8 text-center text-xs text-texto-3">
        ¿Olvidaste tu contraseña? Pide a la administración de tu sistema que la restablezca.
      </p>
    </PantallaAcceso>
  );
}
