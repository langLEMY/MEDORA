import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, UserRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { invocar, supabase } from "@/lib/supabase";
import { slugificar } from "@/lib/utils";
import { PantallaAcceso } from "./PantallaAcceso";

const esquema = z
  .object({
    codigo: z.string().trim().min(6, "Escribe el código de instalación"),
    nombre_completo: z.string().trim().min(3, "Escribe tu nombre completo"),
    email: z.email("Correo inválido"),
    password: z.string().min(10, "Mínimo 10 caracteres"),
    confirmar: z.string(),
    sistema: z.string().trim().min(2, "Escribe el nombre del sistema hospitalario"),
  })
  .refine((d) => d.password === d.confirmar, { path: ["confirmar"], message: "Las contraseñas no coinciden" });
type Datos = z.infer<typeof esquema>;

/** Primer arranque: crea el superadministrador y el primer sistema hospitalario. */
export function ConfiguracionInicial() {
  const qc = useQueryClient();
  const [paso, setPaso] = useState(0);
  const { register, handleSubmit, trigger, formState } = useForm<Datos>({ resolver: zodResolver(esquema) });
  const e = formState.errors;

  const siguiente = async () => {
    if (await trigger(["codigo", "nombre_completo", "email", "password", "confirmar"])) setPaso(1);
  };

  const finalizar = handleSubmit(async (d) => {
    try {
      await invocar("configuracion-inicial", {
        codigo: d.codigo.toUpperCase(),
        nombre_completo: d.nombre_completo,
        email: d.email,
        password: d.password,
        sistema: { nombre: d.sistema, slug: slugificar(d.sistema) || "sistema" },
      });
      const { error } = await supabase.auth.signInWithPassword({ email: d.email.toLowerCase(), password: d.password });
      if (error) throw error;
      await qc.invalidateQueries();
      toast.success("MEDORA está listo");
    } catch (err) {
      toast.error((err as Error).message);
    }
  });

  return (
    <PantallaAcceso>
      <div className="mb-6 flex gap-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-superficie-2">
            <motion.div
              className="h-full bg-marca"
              initial={false}
              animate={{ width: paso >= i ? "100%" : "0%" }}
              transition={{ type: "spring", duration: 0.5, bounce: 0 }}
            />
          </div>
        ))}
      </div>

      <form onSubmit={finalizar} noValidate>
        <AnimatePresence mode="wait" initial={false}>
          {paso === 0 ? (
            <motion.div
              key="p0"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-4"
            >
              <div>
                <div className="mb-3 grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
                  <UserRound className="size-5" />
                </div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em]">Configura MEDORA</h2>
                <p className="mt-1.5 text-sm text-texto-2">
                  Crea la cuenta de superadministración de la plataforma. Solo se hace una vez.
                </p>
              </div>
              <Entrada
                etiqueta="Código de instalación"
                placeholder="MDR-XXXX-XXXX-XXXX"
                autoComplete="off"
                className="font-mono uppercase tracking-wider"
                error={e.codigo?.message}
                {...register("codigo")}
              />
              <Entrada etiqueta="Nombre completo" error={e.nombre_completo?.message} {...register("nombre_completo")} />
              <Entrada etiqueta="Correo electrónico" type="email" error={e.email?.message} {...register("email")} />
              <Entrada
                etiqueta="Contraseña"
                type="password"
                autoComplete="new-password"
                error={e.password?.message}
                {...register("password")}
              />
              <Entrada
                etiqueta="Confirmar contraseña"
                type="password"
                autoComplete="new-password"
                error={e.confirmar?.message}
                {...register("confirmar")}
              />
              <Boton tamano="lg" className="w-full justify-center" onClick={siguiente}>
                Continuar <ArrowRight className="size-4" />
              </Boton>
            </motion.div>
          ) : (
            <motion.div
              key="p1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-4"
            >
              <div>
                <div className="mb-3 grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
                  <Building2 className="size-5" />
                </div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em]">Primer sistema hospitalario</h2>
                <p className="mt-1.5 text-sm text-texto-2">
                  Podrás agregar más sistemas, sedes y personal después.
                </p>
              </div>
              <Entrada
                etiqueta="Nombre del sistema"
                placeholder="Ej. Red Hospitalaria del Cibao"
                error={e.sistema?.message}
                {...register("sistema")}
              />
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="lg" onClick={() => setPaso(0)} icono={<ArrowLeft className="size-4" />}>
                  Atrás
                </Boton>
                <Boton type="submit" tamano="lg" className="flex-1 justify-center" cargando={formState.isSubmitting}>
                  Finalizar configuración
                </Boton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </PantallaAcceso>
  );
}
