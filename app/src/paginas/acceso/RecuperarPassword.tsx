import { AnimatePresence, motion } from "motion/react";
import { KeyRound, Lock, Mail, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { mensajeError, supabase } from "@/lib/supabase";

/**
 * Recuperar la contraseña con un código de 6 dígitos que llega al correo
 * (Supabase Auth, plantilla "Reset password" con {{ .Token }}). Se usa código y
 * no enlace porque MEDORA vive dentro del programa de escritorio: el enlace se
 * abriría en el navegador. Quien no tiene correo real se lo pide a la administración.
 */
type Paso = "usuario" | "codigo" | "sin-correo";

const enmascarar = (correo: string) => {
  const [u, d] = correo.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
};

export function RecuperarPassword({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [paso, setPaso] = useState<Paso>("usuario");
  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setPaso("usuario");
    setCodigo("");
    setClave("");
    setClave2("");
    setError(null);
  }, [abierto]);

  const enviar = async () => {
    setError(null);
    if (usuario.trim().length < 2) return setError("Escribe tu usuario.");
    setCargando(true);
    try {
      const { data, error: e } = await supabase.rpc("correo_de_acceso", { p_usuario: usuario.trim() });
      if (e || !data) throw new Error("No encontramos ese usuario.");
      if (data.endsWith(".invalid")) {
        setPaso("sin-correo");
        return;
      }
      const { error: e2 } = await supabase.auth.resetPasswordForEmail(data);
      if (e2) throw e2;
      setCorreo(data);
      setPaso("codigo");
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  };

  const cambiar = async () => {
    setError(null);
    if (!/^\d{6}$/.test(codigo.trim())) return setError("El código tiene 6 números.");
    if (clave.length < 10) return setError("La nueva contraseña necesita al menos 10 caracteres.");
    if (clave !== clave2) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    try {
      const { error: e } = await supabase.auth.verifyOtp({ email: correo, token: codigo.trim(), type: "recovery" });
      if (e) throw new Error("El código no es válido o ya venció. Pide uno nuevo.");
      const { error: e2 } = await supabase.auth.updateUser({ password: clave });
      if (e2) throw e2;
      await supabase.rpc("marcar_password_actualizada");
      toast.success("Contraseña cambiada", { description: "Ya estás dentro de MEDORA." });
      onCerrar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Recuperar contraseña"
      pie={
        paso === "sin-correo" ? (
          <Boton onClick={onCerrar}>Entendido</Boton>
        ) : (
          <>
            <Boton variante="secundario" onClick={paso === "codigo" ? () => setPaso("usuario") : onCerrar}>
              {paso === "codigo" ? "Atrás" : "Cancelar"}
            </Boton>
            <Boton cargando={cargando} onClick={() => void (paso === "usuario" ? enviar() : cambiar())}>
              {paso === "usuario" ? "Enviarme un código" : "Cambiar contraseña"}
            </Boton>
          </>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={paso}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="space-y-4"
        >
          {paso === "usuario" && (
            <>
              <p className="text-sm text-texto-2">Escribe tu usuario y te enviaremos un código de 6 números al correo de tu cuenta.</p>
              <Entrada
                etiqueta="Usuario"
                icono={<User />}
                autoFocus
                placeholder="nombre.apellido"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void enviar()}
              />
            </>
          )}
          {paso === "codigo" && (
            <>
              <div className="flex items-start gap-3 rounded-xl bg-marca-suave p-3 text-sm">
                <Mail className="mt-0.5 size-4 shrink-0 text-marca" />
                <span>
                  Enviamos un código a <b>{enmascarar(correo)}</b>. Revisa también la carpeta de spam.
                </span>
              </div>
              <Entrada
                etiqueta="Código"
                icono={<KeyRound />}
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="font-mono tracking-[0.4em]"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
              <Entrada etiqueta="Nueva contraseña" icono={<Lock />} type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
              <Entrada
                etiqueta="Repítela"
                icono={<Lock />}
                type="password"
                autoComplete="new-password"
                value={clave2}
                onChange={(e) => setClave2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void cambiar()}
              />
            </>
          )}
          {paso === "sin-correo" && (
            <p className="text-sm leading-relaxed text-texto-2">
              Tu cuenta no tiene un correo registrado, así que no podemos enviarte el código. Pide a la administración de tu hospital que te asigne una
              contraseña nueva desde <b>Personal</b>.
            </p>
          )}
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-peligro">
              {error}
            </motion.p>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
