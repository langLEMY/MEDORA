import { zodResolver } from "@hookform/resolvers/zod";
import { MonitorDown, Pencil, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { DosPasos } from "@/components/DosPasos";
import { Impresion } from "@/components/Impresion";
import { notasDeVersion, VentanaNovedades } from "@/components/Novedades";
import { Personalizacion } from "@/components/Personalizacion";
import { RestablecerContrasenas } from "@/components/RestablecerContrasenas";
import { CerrarSesiones, Soporte } from "@/components/Soporte";
import { Boton } from "@/components/ui/boton";
import { EntradaClave, Segmentado } from "@/components/ui/campos";
import { CabeceraPerfil, EditarPerfil } from "@/components/perfil/CabeceraPerfil";
import { EncabezadoPagina, Tarjeta } from "@/components/ui/superficies";
import { enEscritorio, enviar, escuchar } from "@/lib/escritorio";
import { mensajeError } from "@/lib/supabase";
import { cn, correoVisible } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { actualizarPassword, esquemaPassword, RequisitosClave } from "./acceso/CambiarPassword";

type Pestana = "perfil" | "preferencias" | "seguridad" | "dispositivo" | "soporte";

export default function Perfil() {
  const { perfil, esSuperadmin } = useSesion();
  // La pestaña vive en ?vista= para que los enlaces y el botón «atrás» la respeten.
  const [params, setParams] = useSearchParams();
  const [editando, setEditando] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [novedades, setNovedades] = useState(false);

  useEffect(() => {
    const quitar = escuchar((m) => {
      if (m.tipo === "info") setVersion(m.version);
      if (m.tipo === "sin-actualizacion") {
        setBuscando(false);
        toast.success("Ya tienes la versión más reciente");
      }
      if (m.tipo === "error-busqueda") {
        setBuscando(false);
        toast.error("No se pudo buscar actualizaciones", { description: m.mensaje });
      }
      if (m.tipo === "actualizacion") setBuscando(false);
    });
    enviar("info");
    return quitar;
  }, []);

  const pwd = useForm({ resolver: zodResolver(esquemaPassword) });
  const cambiar = pwd.handleSubmit(async ({ password }) => {
    try {
      await actualizarPassword(password);
      pwd.reset();
      toast.success("Contraseña actualizada");
    } catch (e) {
      toast.error(mensajeError(e));
    }
  });

  const pestanas: [Pestana, string][] = [
    ["perfil", "Perfil"],
    ["preferencias", "Preferencias"],
    ["seguridad", "Seguridad"],
    ["dispositivo", "Dispositivo"],
    ...(esSuperadmin ? ([["soporte", "Soporte"]] as [Pestana, string][]) : []),
  ];
  const actual = pestanas.find(([p]) => p === params.get("vista"))?.[0] ?? "perfil";

  return (
    <>
      <EncabezadoPagina titulo="Mi perfil" />
      <CabeceraPerfil onEditar={() => setEditando(true)} acciones={esSuperadmin ? <RestablecerContrasenas /> : undefined} />
      <EditarPerfil abierto={editando} onCerrar={() => setEditando(false)} />

      <div className="mb-5 overflow-x-auto pb-0.5">
        <Segmentado
          id="perfil-pestanas"
          valor={actual}
          onChange={(p) => setParams(new URLSearchParams({ vista: p }), { replace: true })}
          opciones={pestanas.map(([p, etiqueta]) => ({ valor: p, etiqueta }))}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={actual}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
      {actual === "perfil" && (
        <div className="max-w-3xl space-y-6">
          <GrupoAjustes titulo="Contacto">
            <FilaAjuste etiqueta="Usuario" valor={perfil?.nombre_usuario ? `@${perfil.nombre_usuario}` : "—"} />
            <FilaAjuste etiqueta="Teléfono celular" valor={perfil?.telefono || "Sin teléfono"} tenue={!perfil?.telefono} />
            <FilaAjuste etiqueta="Correo de contacto" valor={correoVisible(perfil?.correo_contacto) || "Sin correo"} tenue={!perfil?.correo_contacto} />
          </GrupoAjustes>
          <GrupoAjustes titulo="Avisos de MEDORA" pie="Pocos avisos del hospital. Puedes desactivarlos cuando quieras.">
            <FilaAjuste etiqueta="WhatsApp" valor={perfil?.recibir_whatsapp ? "Activados" : "Desactivados"} tenue={!perfil?.recibir_whatsapp} />
          </GrupoAjustes>
          <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditando(true)}>
            Editar perfil
          </Boton>
        </div>
      )}

      {actual === "preferencias" && (
        <div className="max-w-3xl">
          <Personalizacion />
        </div>
      )}

      {actual === "seguridad" && (
        <div className="max-w-3xl space-y-4">
          <Tarjeta className="p-6">
            <h2 className="mb-4 text-[0.9375rem] font-semibold">Cambiar contraseña</h2>
            <form onSubmit={cambiar} className="space-y-4" noValidate>
              <EntradaClave etiqueta="Nueva contraseña" autoComplete="new-password" error={pwd.formState.errors.password?.message as string} {...pwd.register("password")} />
              <EntradaClave etiqueta="Confirmar" autoComplete="new-password" error={pwd.formState.errors.confirmar?.message as string} {...pwd.register("confirmar")} />
              {pwd.watch("password") && <RequisitosClave password={pwd.watch("password")} confirmar={pwd.watch("confirmar") ?? ""} usuario={perfil?.nombre_usuario} />}
              <div className="flex justify-end">
                <Boton type="submit" variante="secundario" cargando={pwd.formState.isSubmitting}>
                  Actualizar contraseña
                </Boton>
              </div>
            </form>
          </Tarjeta>

          <DosPasos />
          <CerrarSesiones />
        </div>
      )}

      {actual === "dispositivo" && (
        <div className="max-w-3xl space-y-4">
          <Impresion />
          <Tarjeta className="flex items-center gap-4 p-6">
            <span className="grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
              <MonitorDown className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">MEDORA para Windows</p>
              <p className="text-xs text-texto-3">{enEscritorio ? `Versión ${version ?? __VERSION_APP__}` : `Versión ${__VERSION_APP__} · modo navegador`}</p>
            </div>
            {notasDeVersion(__VERSION_APP__) && (
              <Boton variante="fantasma" onClick={() => setNovedades(true)}>
                Novedades
              </Boton>
            )}
            {enEscritorio && (
              <Boton
                variante="secundario"
                icono={<RefreshCw className={`size-4 ${buscando ? "animate-spin" : ""}`} />}
                onClick={() => {
                  setBuscando(true);
                  enviar("buscar-actualizacion");
                }}
              >
                Buscar actualizaciones
              </Boton>
            )}
          </Tarjeta>
        </div>
      )}

      {actual === "soporte" && <Soporte />}
        </motion.div>
      </AnimatePresence>
      {notasDeVersion(__VERSION_APP__) && <VentanaNovedades abierto={novedades} onCerrar={() => setNovedades(false)} notas={notasDeVersion(__VERSION_APP__)!} />}
    </>
  );
}


/** Grupo de ajustes al estilo de iOS: título pequeño, filas separadas por líneas finas y una nota al pie. */
function GrupoAjustes({ titulo, pie, children }: { titulo: string; pie?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-4 text-[0.75rem] font-medium tracking-wide text-texto-3 uppercase">{titulo}</h2>
      <Tarjeta className="divide-y divide-borde/70 overflow-hidden">{children}</Tarjeta>
      {pie && <p className="mt-1.5 px-4 text-xs text-texto-3">{pie}</p>}
    </section>
  );
}

function FilaAjuste({ etiqueta, valor, tenue }: { etiqueta: string; valor: ReactNode; tenue?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-[0.9375rem]">
      <span>{etiqueta}</span>
      <span className={cn("min-w-0 truncate text-right", tenue ? "text-texto-3" : "text-texto-2")}>{valor}</span>
    </div>
  );
}
