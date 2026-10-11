import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { Insignia, Tarjeta } from "@/components/ui/superficies";
import { mensajeError, supabase } from "@/lib/supabase";
import { useSesion } from "@/sesion/SesionProvider";

interface Alta {
  factorId: string;
  qr: string;
  secreto: string;
}

/**
 * Verificación en dos pasos (TOTP) en Mi perfil. Funciona con cualquier app de
 * autenticación (Google Authenticator, Microsoft Authenticator, Authy…). Una vez
 * activa, cada inicio de sesión pide el código, y Postgres no trata la sesión
 * como verificada (privado.mfa_ok) hasta que se pasa.
 */
export function DosPasos() {
  const { esSuperadmin, actualizarVerificacion } = useSesion();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigo, setCodigo] = useState("");
  const [quitar, setQuitar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp[0]?.id ?? null);
    setCargando(false);
  }, []);

  useEffect(() => {
    void leer();
  }, [leer]);

  const empezar = async () => {
    setOcupado(true);
    try {
      // Un alta a medias (sin verificar) bloquea otra con el mismo nombre: se limpia.
      const { data: todos } = await supabase.auth.mfa.listFactors();
      for (const f of todos?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      // issuer = el nombre que muestra la app autenticadora (sin él, Supabase pone la URL del sitio).
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MEDORA", issuer: "MEDORA" });
      if (error) throw error;
      setCodigo("");
      setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!alta) return;
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: alta.factorId, code: codigo });
      if (error) throw new Error("Código incorrecto. Escribe el que muestra ahora tu aplicación.");
      void supabase.rpc("registrar_evento", { p_accion: "ACTIVAR_2FA" });
      setAlta(null);
      await Promise.all([leer(), actualizarVerificacion()]);
      toast.success("Verificación en dos pasos activada", { description: "Desde ahora, MEDORA te pedirá el código al entrar." });
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    if (!factorId) return;
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await supabase.auth.refreshSession();
      void supabase.rpc("registrar_evento", { p_accion: "DESACTIVAR_2FA" });
      setQuitar(false);
      await Promise.all([leer(), actualizarVerificacion()]);
      toast.success("Verificación en dos pasos desactivada");
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const activa = !!factorId;

  return (
    <Tarjeta className="p-6">
      <div className="flex items-start gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${activa ? "bg-marca-suave text-marca" : "bg-superficie-2 text-texto-3"}`}>
          {activa ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[0.9375rem] font-semibold">Verificación en dos pasos</h2>
            {!cargando && (activa ? <Insignia tono="exito">Activa</Insignia> : esSuperadmin && <Insignia tono="aviso">Recomendada</Insignia>)}
          </div>
          <p className="mt-1 text-sm text-texto-2">
            {activa
              ? "Al entrar, además de tu contraseña, MEDORA te pide el código de tu aplicación de autenticación."
              : "Protege tu cuenta aunque alguien conozca tu contraseña: al entrar se pide un código de 6 números de tu teléfono."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        {activa ? (
          <Boton variante="secundario" disabled={cargando} onClick={() => setQuitar(true)}>
            Desactivar
          </Boton>
        ) : (
          <Boton cargando={ocupado && !alta} disabled={cargando} onClick={() => void empezar()}>
            Activar
          </Boton>
        )}
      </div>

      <Modal
        abierto={!!alta}
        onCerrar={() => setAlta(null)}
        ancho="sm"
        titulo="Activar verificación en dos pasos"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAlta(null)}>
              Cancelar
            </Boton>
            <Boton cargando={ocupado} disabled={codigo.length !== 6} onClick={() => void confirmar()}>
              Activar
            </Boton>
          </>
        }
      >
        {alta && (
          <div className="space-y-4">
            <p className="text-sm text-texto-2">
              1. Abre tu aplicación de autenticación (Google Authenticator, Microsoft Authenticator…) y escanea este código.
            </p>
            <div className="mx-auto w-fit rounded-xl bg-white p-3">
              <img src={alta.qr} alt="Código QR para la aplicación de autenticación" className="size-44" />
            </div>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(alta.secreto).then(() => toast.success("Clave copiada"))}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-superficie-2 px-3 py-2 font-mono text-xs break-all text-texto-2 hover:text-texto"
              title="Copiar la clave para escribirla a mano"
            >
              <Copy className="size-3.5 shrink-0" />
              {alta.secreto}
            </button>
            <Entrada
              etiqueta="2. Escribe el código de 6 números que aparece"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center font-mono tracking-[0.5em]"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && codigo.length === 6 && void confirmar()}
            />
          </div>
        )}
      </Modal>

      <Modal
        abierto={quitar}
        onCerrar={() => setQuitar(false)}
        ancho="sm"
        titulo="¿Desactivar la verificación en dos pasos?"
        descripcion="Tu cuenta quedará protegida solo con la contraseña."
        pie={
          <>
            <Boton variante="secundario" onClick={() => setQuitar(false)}>
              Mantenerla
            </Boton>
            <Boton variante="peligro" cargando={ocupado} onClick={() => void desactivar()}>
              Desactivar
            </Boton>
          </>
        }
      >
        {null}
      </Modal>
    </Tarjeta>
  );
}
