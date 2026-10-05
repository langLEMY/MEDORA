import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Camera, Check, MonitorDown, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DosPasos } from "@/components/DosPasos";
import { Impresion } from "@/components/Impresion";
import { notasDeVersion, VentanaNovedades } from "@/components/Novedades";
import { Personalizacion } from "@/components/Personalizacion";
import { RestablecerContrasenas } from "@/components/RestablecerContrasenas";
import { Soporte } from "@/components/Soporte";
import { Boton } from "@/components/ui/boton";
import { Entrada, EntradaClave } from "@/components/ui/campos";
import { Avatar, EncabezadoPagina, Insignia, Tarjeta } from "@/components/ui/superficies";
import { enEscritorio, enviar, escuchar } from "@/lib/escritorio";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { mensajeError, supabase } from "@/lib/supabase";
import { cn, CORREO_RE, correoVisible, telefonoRd } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { actualizarPassword, esquemaPassword, RequisitosClave } from "./acceso/CambiarPassword";

export default function Perfil() {
  const { perfil, sistema, roles, esSuperadmin, recargar } = useSesion();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [novedades, setNovedades] = useState(false);

  useEffect(() => {
    setNombre(perfil?.nombre_completo ?? "");
    setTelefono(perfil?.telefono ?? "");
    setCorreo(perfil?.correo_contacto ?? "");
    setWhatsapp(!!perfil?.recibir_whatsapp);
  }, [perfil]);

  const telefonoOk = !telefono.trim() || !!telefonoRd(telefono);
  const correoOk = !correo.trim() || CORREO_RE.test(correo.trim());

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

  const guardar = useMutation({
    mutationFn: async () => {
      const tel = telefono.trim() ? telefonoRd(telefono) : null;
      const mail = correo.trim().toLowerCase() || null;
      const { error } = await supabase
        .from("perfiles")
        .update({
          nombre_completo: nombre.trim(),
          telefono: tel,
          correo_contacto: mail,
          recibir_whatsapp: whatsapp && !!tel,
        })
        .eq("id", perfil!.id);
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
      <EncabezadoPagina titulo="Mi perfil" acciones={esSuperadmin ? <RestablecerContrasenas /> : undefined} />
      {/* Dos columnas que crecen por separado (items-start): izquierda la cuenta y su
          seguridad; derecha cómo se ve y se imprime. Así ninguna queda con huecos. */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
        <Tarjeta className="p-6">
          <div className="mb-6 flex items-center gap-4">
            <FotoPerfil />
            <div>
              <p className="text-lg font-semibold">{perfil?.nombre_completo}</p>
              <p className="text-sm text-texto-3">
                {[perfil?.nombre_usuario && `Usuario: ${perfil.nombre_usuario}`, correoVisible(perfil?.email)].filter(Boolean).join(" · ")}
              </p>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Entrada
                etiqueta="Teléfono celular"
                inputMode="tel"
                placeholder="809-000-0000"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                onBlur={() => telefonoRd(telefono) && setTelefono(telefonoRd(telefono)!)}
                error={telefonoOk ? undefined : "Número dominicano de 10 dígitos (809, 829 u 849)."}
              />
              <Entrada
                etiqueta="Correo de contacto"
                type="email"
                placeholder="nombre@correo.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                error={correoOk ? undefined : "Revisa el correo."}
              />
            </div>
            <div className="space-y-2.5 rounded-xl border border-borde p-4">
              <p className="text-[0.8125rem] font-medium text-texto-2">Avisos de MEDORA</p>
              <Casilla
                marcada={whatsapp}
                onChange={setWhatsapp}
                deshabilitada={!telefono.trim() || !telefonoOk}
                etiqueta="Recibir avisos por WhatsApp"
                ayuda={!telefono.trim() ? "Escribe tu celular para activarlo." : `Al ${telefonoRd(telefono) ?? telefono}`}
              />
              <p className="text-xs text-texto-3">Pocos avisos del hospital. Puedes desactivarlos cuando quieras.</p>
            </div>
            <div className="flex justify-end">
              <Boton cargando={guardar.isPending} disabled={nombre.trim().length < 3 || !telefonoOk || !correoOk} onClick={() => guardar.mutate()}>
                Guardar
              </Boton>
            </div>
          </div>
        </Tarjeta>

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

        <div className="space-y-4">
          <Personalizacion />
          <Impresion />
        </div>
      </div>
      <div className="mt-4">
        <Soporte />
      </div>
      {notasDeVersion(__VERSION_APP__) && <VentanaNovedades abierto={novedades} onCerrar={() => setNovedades(false)} notas={notasDeVersion(__VERSION_APP__)!} />}
    </>
  );
}

/** Casilla con check (consentimientos): toda la fila es clicable. */
function Casilla({
  marcada,
  onChange,
  etiqueta,
  ayuda,
  deshabilitada,
}: {
  marcada: boolean;
  onChange: (v: boolean) => void;
  etiqueta: string;
  ayuda?: string;
  deshabilitada?: boolean;
}) {
  const activa = marcada && !deshabilitada;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activa}
      disabled={deshabilitada}
      onClick={() => onChange(!marcada)}
      className="flex w-full items-start gap-3 rounded-lg text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={cn(
          "mt-0.5 grid size-[1.125rem] shrink-0 place-items-center rounded-[5px] border transition-colors duration-150",
          activa ? "border-marca bg-marca text-white" : "border-borde-fuerte bg-superficie",
        )}
      >
        {activa && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{etiqueta}</span>
        {ayuda && <span className="block truncate text-xs text-texto-3">{ayuda}</span>}
      </span>
    </button>
  );
}

/** Recorta al centro y reduce a 256×256 JPEG: la foto se guarda en el perfil (≈15-25 KB). */
async function fotoCuadrada(archivo: File): Promise<string> {
  const img = await createImageBitmap(archivo);
  const lado = Math.min(img.width, img.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 256;
  const ctx = lienzo.getContext("2d")!;
  ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
  img.close();
  return lienzo.toDataURL("image/jpeg", 0.85);
}

/** Foto de perfil con botón de cámara para cambiarla y opción de quitarla. */
function FotoPerfil() {
  const { perfil, recargar } = useSesion();
  const m = useMutation({
    mutationFn: async (foto: string | null) => {
      const { error } = await supabase.from("perfiles").update({ foto }).eq("id", perfil!.id);
      if (error) throw error;
    },
    onSuccess: async (_, foto) => {
      toast.success(foto ? "Foto actualizada" : "Foto quitada");
      await recargar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });
  return (
    <div className="group relative shrink-0">
      <Avatar nombre={perfil?.nombre_completo} foto={perfil?.foto} tamano={64} className={cn(m.isPending && "opacity-50")} />
      <label
        title="Cambiar foto"
        className="absolute -right-1 -bottom-1 grid size-7 cursor-pointer place-items-center rounded-full border-2 border-superficie bg-marca text-white shadow-md transition-transform duration-150 active:scale-95"
      >
        <Camera className="size-3.5" />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = "";
            if (archivo)
              void fotoCuadrada(archivo)
                .then((url) => m.mutate(url))
                .catch(() => toast.error("No se pudo leer la imagen."));
          }}
        />
      </label>
      {perfil?.foto && (
        <button
          type="button"
          title="Quitar foto"
          onClick={() => m.mutate(null)}
          className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full border-2 border-superficie bg-superficie-2 text-texto-3 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 hover:text-peligro"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}
