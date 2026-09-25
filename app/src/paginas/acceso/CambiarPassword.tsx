import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { mensajeError, supabase } from "@/lib/supabase";
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

/** Se muestra tras entrar con una contraseña temporal. */
export function CambiarPassword() {
  const { recargar, cerrarSesion } = useSesion();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof esquemaPassword>>({
    resolver: zodResolver(esquemaPassword),
  });

  const guardar = handleSubmit(async ({ password }) => {
    try {
      await actualizarPassword(password);
      await recargar();
      toast.success("Contraseña actualizada");
    } catch (e) {
      toast.error(mensajeError(e));
    }
  });

  return (
    <PantallaAcceso>
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
        <KeyRound className="size-5" />
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Crea tu contraseña</h2>
      <p className="mt-1.5 text-sm text-texto-2">
        Entraste con una contraseña temporal. Elige una nueva que solo tú conozcas.
      </p>
      <form onSubmit={guardar} className="mt-8 space-y-4" noValidate>
        <Entrada
          etiqueta="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          error={formState.errors.password?.message}
          {...register("password")}
        />
        <Entrada
          etiqueta="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          error={formState.errors.confirmar?.message}
          {...register("confirmar")}
        />
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
