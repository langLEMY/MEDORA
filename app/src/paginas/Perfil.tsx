import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { MonitorDown, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Soporte } from "@/components/Soporte";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Avatar, EncabezadoPagina, Insignia, Tarjeta } from "@/components/ui/superficies";
import { enEscritorio, enviar, escuchar } from "@/lib/escritorio";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { mensajeError, supabase } from "@/lib/supabase";
import { useSesion } from "@/sesion/SesionProvider";
import { actualizarPassword, esquemaPassword } from "./acceso/CambiarPassword";

export default function Perfil() {
  const { perfil, sistema, roles, esSuperadmin, recargar } = useSesion();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [version, setVersion] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    setNombre(perfil?.nombre_completo ?? "");
    setTelefono(perfil?.telefono ?? "");
  }, [perfil]);

  useEffect(() => {
    const quitar = escuchar((m) => {
      if (m.tipo === "info") setVersion(m.version);
      if (m.tipo === "sin-actualizacion") {
        setBuscando(false);
        toast.success("Ya tienes la versión más reciente");
      }
      if (m.tipo === "actualizacion") setBuscando(false);
    });
    enviar("info");
    return quitar;
  }, []);

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("perfiles").update({ nombre_completo: nombre.trim(), telefono: telefono.trim() || null }).eq("id", perfil!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Perfil actualizado");
      await recargar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

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

  return (
    <>
      <EncabezadoPagina titulo="Mi perfil" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Tarjeta className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <Avatar nombre={perfil?.nombre_completo} tamano={56} />
            <div>
              <p className="text-lg font-semibold">{perfil?.nombre_completo}</p>
              <p className="text-sm text-texto-3">{perfil?.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {esSuperadmin && <Insignia tono="marca">Superadministración</Insignia>}
                {roles.map((r) => (
                  <Insignia key={r}>{ETIQUETA_ROL[r]}</Insignia>
                ))}
                {sistema && <Insignia tono="info">{sistema.nombre}</Insignia>}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <Entrada etiqueta="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Entrada etiqueta="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            <div className="flex justify-end">
              <Boton cargando={guardar.isPending} disabled={nombre.trim().length < 3} onClick={() => guardar.mutate()}>
                Guardar
              </Boton>
            </div>
          </div>
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta className="p-6">
            <h2 className="mb-4 text-[15px] font-semibold">Cambiar contraseña</h2>
            <form onSubmit={cambiar} className="space-y-4" noValidate>
              <Entrada etiqueta="Nueva contraseña" type="password" autoComplete="new-password" error={pwd.formState.errors.password?.message as string} {...pwd.register("password")} />
              <Entrada etiqueta="Confirmar" type="password" autoComplete="new-password" error={pwd.formState.errors.confirmar?.message as string} {...pwd.register("confirmar")} />
              <div className="flex justify-end">
                <Boton type="submit" variante="secundario" cargando={pwd.formState.isSubmitting}>
                  Actualizar contraseña
                </Boton>
              </div>
            </form>
          </Tarjeta>

          <Tarjeta className="flex items-center gap-4 p-6">
            <span className="grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
              <MonitorDown className="size-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">MEDORA para Windows</p>
              <p className="text-xs text-texto-3">{enEscritorio ? `Versión ${version ?? __VERSION_APP__}` : `Versión ${__VERSION_APP__} · modo navegador`}</p>
            </div>
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
      </div>
      <div className="mt-4">
        <Soporte />
      </div>
    </>
  );
}
