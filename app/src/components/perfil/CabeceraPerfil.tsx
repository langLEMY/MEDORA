import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ImagePlus, Lock, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RecorteFoto } from "@/components/RecorteFoto";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Interruptor } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Avatar, Insignia, Tarjeta } from "@/components/ui/superficies";
import { ETIQUETA_ROL } from "@/lib/permisos";
import type { TablesUpdate } from "@/lib/database.types";
import { mensajeError, supabase } from "@/lib/supabase";
import { cn, CORREO_RE, correoVisible, telefonoRd } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";

/*
 * Cabecera de Mi perfil con portada (banner) y foto, y la hoja «Editar perfil».
 * La portada vive en perfiles_portada (no en perfiles: la sesión carga perfiles al entrar
 * y no debe arrastrar la imagen); la foto, en perfiles.foto. Ambas se recortan en la app.
 */

const MAX_BIO = 180;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

function usePortada(perfilId: string | undefined) {
  return useQuery({
    queryKey: ["perfil-portada", perfilId],
    enabled: !!perfilId,
    staleTime: Infinity,
    // Si la tabla aún no existe (migración pendiente), se queda con la portada de color.
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfiles_portada").select("imagen").eq("perfil_id", perfilId!).maybeSingle();
      if (error) throw error;
      return data?.imagen ?? null;
    },
  });
}

/** Portada por defecto: el color del hospital con un brillo suave. */
const PORTADA_COLOR =
  "radial-gradient(120% 140% at 85% 0%, color-mix(in oklab, white 22%, transparent) 0%, transparent 55%), linear-gradient(120deg, var(--marca), color-mix(in oklab, var(--marca) 55%, #0a84ff))";

const elegirImagen = (f: File | undefined | null, listo: (f: File) => void) => {
  if (!f) return;
  if (!TIPOS.includes(f.type)) return toast.error("Elige una imagen JPG, PNG o WebP.");
  listo(f);
};

/** Botón redondo translúcido sobre una imagen (cambiar / quitar). */
function BotonSobreImagen({ etiqueta, onClick, children, className }: { etiqueta: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md transition-[transform,background-color] duration-150 hover:bg-black/70 active:scale-95 focus-visible:outline-2 focus-visible:outline-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

export function CabeceraPerfil({ onEditar, acciones }: { onEditar: () => void; acciones?: ReactNode }) {
  const { perfil, sistema, roles, esSuperadmin } = useSesion();
  const portada = usePortada(perfil?.id);
  const bio = perfil?.biografia;

  return (
    <Tarjeta className="mb-5 overflow-hidden">
      <div className="relative h-36 sm:h-48">
        {portada.data ? (
          <img src={portada.data} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full" style={{ background: PORTADA_COLOR }} />
        )}
        {/* Velo inferior: separa la foto y el nombre de una portada clara. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      <div className="px-6 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* relative z-10: la portada está posicionada y, sin esto, se pinta encima de la foto. */}
          <div className="relative z-10 -mt-12 rounded-full ring-4 ring-superficie">
            <Avatar nombre={perfil?.nombre_completo} foto={perfil?.foto} tamano={96} className="shadow-md" />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            {acciones}
            <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={onEditar}>
              Editar perfil
            </Boton>
          </div>
        </div>

        <h2 className="mt-3 text-[1.625rem] leading-tight font-bold tracking-[-0.025em]">{perfil?.nombre_completo}</h2>
        <p className="mt-0.5 text-sm text-texto-3">
          {[perfil?.nombre_usuario && `@${perfil.nombre_usuario}`, correoVisible(perfil?.correo_contacto ?? perfil?.email)].filter(Boolean).join(" · ")}
        </p>
        {bio ? (
          <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-texto-2">{bio}</p>
        ) : (
          <button type="button" onClick={onEditar} className="mt-3 text-sm font-medium text-marca-texto hover:underline">
            Agrega unas palabras sobre ti
          </button>
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {esSuperadmin && <Insignia tono="marca">Superadministración</Insignia>}
          {roles.map((r) => (
            <Insignia key={r}>{ETIQUETA_ROL[r]}</Insignia>
          ))}
          {sistema && <Insignia tono="info">{sistema.nombre}</Insignia>}
        </div>
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Hoja «Editar perfil»
// ---------------------------------------------------------------------------

/** Imagen pendiente: sin cambios (undefined), nueva (data URL) o quitada (null). */
type Pendiente = string | null | undefined;

export function EditarPerfil({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { perfil, recargar } = useSesion();
  const qc = useQueryClient();
  const portada = usePortada(perfil?.id);
  const bioActual = perfil?.biografia ?? "";

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [bio, setBio] = useState("");
  const [foto, setFoto] = useState<Pendiente>(undefined);
  const [nuevaPortada, setNuevaPortada] = useState<Pendiente>(undefined);
  const [recortar, setRecortar] = useState<{ archivo: File; forma: "circulo" | "portada" } | null>(null);
  const archivoPortada = useRef<HTMLInputElement>(null);
  const archivoFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setNombre(perfil?.nombre_completo ?? "");
    setTelefono(perfil?.telefono ?? "");
    setCorreo(perfil?.correo_contacto ?? "");
    setWhatsapp(!!perfil?.recibir_whatsapp);
    setBio(bioActual);
    setFoto(undefined);
    setNuevaPortada(undefined);
  }, [abierto, perfil, bioActual]);

  const telefonoOk = !telefono.trim() || !!telefonoRd(telefono);
  const correoOk = !correo.trim() || CORREO_RE.test(correo.trim());
  const valido = nombre.trim().length >= 3 && telefonoOk && correoOk;
  const fotoVista = foto === undefined ? perfil?.foto : foto;
  const portadaVista = nuevaPortada === undefined ? portada.data : nuevaPortada;

  const guardar = useMutation({
    mutationFn: async () => {
      const tel = telefono.trim() ? telefonoRd(telefono) : null;
      const cambios: TablesUpdate<"perfiles"> = {
        nombre_completo: nombre.trim(),
        telefono: tel,
        correo_contacto: correo.trim().toLowerCase() || null,
        recibir_whatsapp: whatsapp && !!tel,
      };
      if (foto !== undefined) cambios.foto = foto;
      // Solo si cambió: así el perfil se guarda aunque la base aún no tenga la columna.
      if (bio.trim() !== bioActual) cambios.biografia = bio.trim() || null;
      const { error } = await supabase.from("perfiles").update(cambios).eq("id", perfil!.id);
      if (error) throw error;
      if (nuevaPortada !== undefined) {
        const r = nuevaPortada
          ? await supabase.from("perfiles_portada").upsert({ perfil_id: perfil!.id, imagen: nuevaPortada, actualizado_en: new Date().toISOString() })
          : await supabase.from("perfiles_portada").delete().eq("perfil_id", perfil!.id);
        if (r.error) throw r.error;
      }
    },
    onSuccess: async () => {
      toast.success("Perfil actualizado");
      if (nuevaPortada !== undefined) qc.setQueryData(["perfil-portada", perfil?.id], nuevaPortada);
      await recargar();
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <>
      <Modal
        abierto={abierto && !recortar}
        onCerrar={onCerrar}
        titulo="Editar perfil"
        ancho="md"
        sinRelleno
        pie={
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={onCerrar} disabled={guardar.isPending}>
              Cancelar
            </Boton>
            <Boton onClick={() => guardar.mutate()} cargando={guardar.isPending} disabled={!valido}>
              Guardar cambios
            </Boton>
          </div>
        }
      >
        {/* Portada */}
        <div
          className="relative h-32 bg-superficie-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            elegirImagen(e.dataTransfer.files?.[0], (archivo) => setRecortar({ archivo, forma: "portada" }));
          }}
        >
          {portadaVista ? (
            <img src={portadaVista} alt="Portada" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: PORTADA_COLOR }} />
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <BotonSobreImagen etiqueta={portadaVista ? "Cambiar la portada" : "Subir una portada"} onClick={() => archivoPortada.current?.click()}>
              <ImagePlus className="size-4" />
            </BotonSobreImagen>
            {portadaVista && (
              <BotonSobreImagen etiqueta="Quitar la portada" onClick={() => setNuevaPortada(null)}>
                <X className="size-4" />
              </BotonSobreImagen>
            )}
          </div>
          <input
            ref={archivoPortada}
            type="file"
            accept={TIPOS.join(",")}
            className="hidden"
            onChange={(e) => {
              elegirImagen(e.target.files?.[0], (archivo) => setRecortar({ archivo, forma: "portada" }));
              e.target.value = "";
            }}
          />
        </div>

        {/* Foto */}
        <div className="relative z-10 -mt-10 flex items-end gap-2 px-6">
          <div className="relative rounded-full ring-4 ring-superficie">
            <Avatar nombre={nombre || perfil?.nombre_completo} foto={fotoVista} tamano={80} />
            <button
              type="button"
              onClick={() => archivoFoto.current?.click()}
              aria-label="Cambiar la foto de perfil"
              title="Cambiar la foto de perfil"
              className="absolute inset-0 grid place-items-center rounded-full bg-black/35 text-white opacity-90 transition-[background-color,opacity] duration-150 hover:bg-black/50 hover:opacity-100"
            >
              <Camera className="size-5" />
            </button>
            <input
              ref={archivoFoto}
              type="file"
              accept={TIPOS.join(",")}
              className="hidden"
              onChange={(e) => {
                elegirImagen(e.target.files?.[0], (archivo) => setRecortar({ archivo, forma: "circulo" }));
                e.target.value = "";
              }}
            />
          </div>
          {fotoVista && (
            <button type="button" onClick={() => setFoto(null)} className="mb-1 text-xs font-medium text-peligro hover:underline">
              Quitar foto
            </button>
          )}
        </div>

        {/* Datos */}
        <div className="space-y-4 px-6 pt-4 pb-6">
          <Entrada etiqueta="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required />
          <Entrada
            etiqueta="Usuario"
            value={perfil?.nombre_usuario ?? ""}
            readOnly
            disabled
            icono={<Lock className="size-4" />}
            accion={<Check className="mr-3 size-4 text-exito" aria-hidden />}
            ayuda="Lo usas para entrar. Solo un administrador puede cambiarlo."
          />
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
          <div>
            <AreaTexto
              etiqueta="Sobre mí"
              placeholder="Unas palabras sobre ti y tu trabajo"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={MAX_BIO}
              rows={3}
            />
            <p className="mt-1.5 text-right text-xs text-texto-3" role="status" aria-live="polite">
              Quedan <span className="tabular-nums">{MAX_BIO - bio.length}</span> caracteres
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-2/70 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Avisos por WhatsApp</p>
              <p className="truncate text-xs text-texto-3">
                {!telefono.trim() || !telefonoOk ? "Escribe tu celular para activarlos." : `Pocos avisos del hospital, al ${telefonoRd(telefono) ?? telefono}.`}
              </p>
            </div>
            <Interruptor activo={whatsapp && telefonoOk && !!telefono.trim()} onChange={setWhatsapp} disabled={!telefono.trim() || !telefonoOk} />
          </div>
        </div>
      </Modal>

      <RecorteFoto
        archivo={recortar?.archivo ?? null}
        forma={recortar?.forma}
        onCancelar={() => setRecortar(null)}
        onListo={(img) => {
          if (recortar?.forma === "portada") setNuevaPortada(img);
          else setFoto(img);
          setRecortar(null);
        }}
      />
    </>
  );
}
