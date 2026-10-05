import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { Check, CheckCircle2, KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { EntradaClave } from "@/components/ui/campos";
import { seguridadClave } from "@/lib/equipo";
import { mensajeError, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { PantallaAcceso } from "./PantallaAcceso";

export const esquemaPassword = z
  .object({
    password: z.string().min(10, "Mínimo 10 caracteres"),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, { path: ["confirmar"], message: "Las contraseñas no coinciden" });

export async function actualizarPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  await supabase.rpc("marcar_password_actualizada");
  await supabase.rpc("registrar_evento", { p_accion: "CAMBIO_PASSWORD" });
}

const NIVELES = [
  { texto: "", color: "bg-borde" },
  { texto: "Débil", color: "bg-peligro" },
  { texto: "Aceptable", color: "bg-aviso" },
  { texto: "Buena", color: "bg-exito" },
  { texto: "Fuerte", color: "bg-exito" },
];

/** Medidor y lista de requisitos que se marcan mientras se escribe. */
export function RequisitosClave({ password, confirmar, usuario }: { password: string; confirmar: string; usuario?: string | null }) {
  const nivel = seguridadClave(password, usuario);
  const requisitos = [
    { ok: password.length >= 10, texto: "Al menos 10 caracteres" },
    { ok: !!password && (!usuario || !password.toLowerCase().includes(usuario.toLowerCase())), texto: "Que no contenga tu usuario" },
    { ok: !!password && !/^\d+$/.test(password), texto: "Que no sea solo números (como la temporal)" },
    { ok: !!confirmar && password === confirmar, texto: "Las dos coinciden" },
  ];
  return (
    <div className="space-y-3 rounded-xl bg-superficie-2/60 p-3.5">
      <div>
        <div className="flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-200", i <= nivel ? NIVELES[nivel].color : "bg-borde")} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-texto-3" aria-live="polite">
          {password ? (
            <>
              Seguridad: <span className="font-medium text-texto-2">{NIVELES[nivel].texto}</span>
              {nivel < 3 && " · usa una frase larga, o mezcla mayúsculas, números y símbolos"}
            </>
          ) : (
            "Consejo: una frase de varias palabras es fácil de recordar y difícil de adivinar."
          )}
        </p>
      </div>
      <ul className="space-y-1.5">
        {requisitos.map((r) => (
          <li key={r.texto} className={cn("flex items-center gap-2 text-xs transition-colors duration-150", r.ok ? "text-exito" : "text-texto-3")}>
            <span className={cn("grid size-4 place-items-center rounded-full transition-colors duration-150", r.ok ? "bg-exito text-white" : "border border-borde-fuerte")}>
              {r.ok && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            {r.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Se muestra tras entrar con una contraseña temporal. */
export function CambiarPassword() {
  const { perfil, recargar, cerrarSesion } = useSesion();
  const [lista, setLista] = useState(false);
  const { register, handleSubmit, formState, watch, setError } = useForm<z.infer<typeof esquemaPassword>>({
    resolver: zodResolver(esquemaPassword),
    defaultValues: { password: "", confirmar: "" },
  });
  const password = watch("password");
  const confirmar = watch("confirmar");

  const guardar = handleSubmit(async ({ password }) => {
    if (/^\d+$/.test(password)) return setError("password", { message: "No puede ser solo números." });
    if (perfil?.nombre_usuario && password.toLowerCase().includes(perfil.nombre_usuario.toLowerCase()))
      return setError("password", { message: "No puede contener tu usuario." });
    try {
      await actualizarPassword(password);
      setLista(true);
    } catch (e) {
      toast.error(mensajeError(e));
    }
  });

  if (lista)
    return (
      <PantallaAcceso>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.4, bounce: 0.2 }} className="text-center">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--exito)_14%,var(--superficie))] text-exito">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Listo, ya tienes tu contraseña</h2>
          <p className="mt-2 text-sm text-texto-2">Úsala la próxima vez que entres. No la compartas con nadie, ni con soporte.</p>
          <Boton tamano="lg" className="mt-8 w-full justify-center" onClick={() => void recargar()}>
            Entrar a MEDORA
          </Boton>
        </motion.div>
      </PantallaAcceso>
    );

  return (
    <PantallaAcceso>
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
        <KeyRound className="size-5" />
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Crea tu contraseña</h2>
      <p className="mt-1.5 text-sm text-texto-2">Entraste con una contraseña temporal. Elige una nueva que solo tú conozcas.</p>
      <form onSubmit={guardar} className="mt-8 space-y-4" noValidate>
        <EntradaClave etiqueta="Nueva contraseña" autoComplete="new-password" autoFocus error={formState.errors.password?.message} {...register("password")} />
        <EntradaClave etiqueta="Confirmar contraseña" autoComplete="new-password" error={formState.errors.confirmar?.message} {...register("confirmar")} />
        <RequisitosClave password={password} confirmar={confirmar} usuario={perfil?.nombre_usuario} />
        <Boton type="submit" tamano="lg" className="w-full justify-center" cargando={formState.isSubmitting}>
          Guardar y continuar
        </Boton>
        <Boton variante="fantasma" className="w-full justify-center" onClick={() => void cerrarSesion()}>
          Cerrar sesión
        </Boton>
      </form>
    </PantallaAcceso>
  );
}
