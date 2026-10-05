import { AnimatePresence, motion } from "motion/react";
import { Lock, Mail, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, EntradaClave } from "@/components/ui/campos";
import { CodigoDigitos } from "@/components/ui/codigo";
import { RequisitosClave } from "./CambiarPassword";
import { Modal } from "@/components/ui/modal";
import { invocar, mensajeError, supabase } from "@/lib/supabase";

/**
 * Recuperar la contraseña con un código de 6 dígitos que llega al correo
 * (Supabase Auth, plantilla "Reset password" con {{ .Token }}). Se usa código y
 * no enlace porque MEDORA vive dentro del programa de escritorio: el enlace se
 * abriría en el navegador. Quien no tiene correo real se lo pide a la administración.
 */
type Paso = "usuario" | "codigo" | "sin-correo";

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
      // El servidor busca el correo y envía el código sin revelarlo (llega enmascarado).
      const r = await invocar<{ estado: "enviado" | "sin_correo"; correo?: string }>("recuperar", {
        accion: "solicitar",
        usuario: usuario.trim(),
      });
      if (r.estado === "sin_correo") {
        setPaso("sin-correo");
        return;
      }
      setCorreo(r.correo ?? "");
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
      const tokens = await invocar<{ access_token: string; refresh_token: string }>("recuperar", {
        accion: "confirmar",
        usuario: usuario.trim(),
        codigo: codigo.trim(),
        password: clave,
      });
      const { error: e } = await supabase.auth.setSession(tokens);
      if (e) throw e;
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
                  Enviamos un código a <b>{correo}</b>. Revisa también la carpeta de spam.
                </span>
              </div>
              <div>
                <p className="mb-1.5 text-[0.8125rem] font-medium text-texto-2">Código del correo</p>
                <CodigoDigitos autoFocus valor={codigo} onChange={setCodigo} onCompleto={() => document.getElementById("recuperar-clave")?.focus()} />
              </div>
              <EntradaClave id="recuperar-clave" etiqueta="Nueva contraseña" icono={<Lock />} autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
              <EntradaClave
                etiqueta="Repítela"
                icono={<Lock />}
                autoComplete="new-password"
                value={clave2}
                onChange={(e) => setClave2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void cambiar()}
              />
              {clave && <RequisitosClave password={clave} confirmar={clave2} usuario={usuario.trim()} />}
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
