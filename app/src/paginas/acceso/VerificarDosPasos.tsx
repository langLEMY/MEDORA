import { motion, useAnimation } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { mensajeError, supabase } from "@/lib/supabase";
import { useSesion } from "@/sesion/SesionProvider";
import { PantallaAcceso } from "./PantallaAcceso";

/**
 * Segundo paso del acceso: la cuenta tiene 2FA (TOTP) y la sesión aún es aal1.
 * Hasta pasar el código, Postgres trata la sesión como de un solo paso
 * (privado.mfa_ok): sin poderes de superadmin ni acciones críticas.
 */
export function VerificarDosPasos() {
  const { actualizarVerificacion, cerrarSesion } = useSesion();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const sacudir = useAnimation();

  const verificar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(codigo)) return setError("El código tiene 6 números.");
    setError(null);
    setCargando(true);
    try {
      const { data: factores, error: errF } = await supabase.auth.mfa.listFactors();
      if (errF) throw errF;
      const factor = factores.totp[0];
      if (!factor) throw new Error("Tu cuenta no tiene un autenticador activo. Contacta a soporte.");
      const { error: errV } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
      if (errV) throw new Error("Código incorrecto o vencido. Usa el que muestra ahora tu aplicación.");
      await actualizarVerificacion();
      void supabase.rpc("registrar_evento", { p_accion: "LOGIN_2FA" });
    } catch (err) {
      setError(mensajeError(err));
      setCodigo("");
      void sacudir.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.4 } });
    } finally {
      setCargando(false);
    }
  };

  return (
    <PantallaAcceso>
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
        <ShieldCheck className="size-5" />
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Verificación en dos pasos</h2>
      <p className="mt-1.5 text-sm text-texto-2">Abre tu aplicación de autenticación y escribe el código de 6 números de MEDORA.</p>

      <motion.form animate={sacudir} onSubmit={verificar} className="mt-8 space-y-4" noValidate>
        <Entrada
          etiqueta="Código"
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="text-center font-mono text-lg tracking-[0.5em]"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
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
        <Boton type="submit" tamano="lg" className="w-full justify-center" cargando={cargando} disabled={codigo.length !== 6}>
          Verificar
        </Boton>
        <Boton variante="fantasma" className="w-full justify-center" onClick={() => void cerrarSesion()}>
          Usar otra cuenta
        </Boton>
      </motion.form>
      <p className="mt-6 text-center text-xs text-texto-3">¿Perdiste el teléfono? Pide a soporte de MEDORA que restablezca tu verificación.</p>
    </PantallaAcceso>
  );
}
