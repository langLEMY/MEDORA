import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Building2, ShieldCheck, Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Insignia } from "@/components/ui/superficies";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { invocar, mensajeError, supabase, type Rol } from "@/lib/supabase";

interface InfoCodigo {
  otorga_superadmin: boolean;
  roles: Rol[];
  sistema: string | null;
}

/** Crear cuenta con un código de invitación (generado en Plataforma → Códigos). */
export function Registro({ onVolver }: { onVolver: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [info, setInfo] = useState<InfoCodigo | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      setInfo(await invocar<InfoCodigo>("registro-invitacion", { accion: "verificar", codigo }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError("La contraseña debe tener al menos 10 caracteres.");
    if (password !== confirmar) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    try {
      await invocar("registro-invitacion", { accion: "registrar", codigo, nombre_completo: nombre, email, password });
      const { error: errLogin } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (errLogin) throw errLogin;
      void supabase.rpc("registrar_evento", { p_accion: "LOGIN" });
      toast.success("Cuenta creada. ¡Bienvenido a MEDORA!");
    } catch (err) {
      setError(mensajeError(err));
      setCargando(false);
    }
  };

  return (
    <>
      <button onClick={onVolver} className="mb-6 inline-flex items-center gap-1.5 text-sm text-texto-2 transition-colors hover:text-texto">
        <ArrowLeft className="size-4" /> Iniciar sesión
      </button>
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-marca-suave text-marca">
        <Ticket className="size-5" />
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Crear cuenta</h2>
      <p className="mt-1.5 text-sm text-texto-2">Usa el código de invitación que te entregó la administración.</p>

      <AnimatePresence mode="wait" initial={false}>
        {!info ? (
          <motion.form
            key="codigo"
            onSubmit={verificar}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="mt-8 space-y-4"
          >
            <Entrada
              etiqueta="Código de invitación"
              placeholder="INV-XXXX-XXXX-XXXX"
              autoComplete="off"
              className="font-mono uppercase tracking-wider"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              error={error ?? undefined}
            />
            <Boton type="submit" tamano="lg" className="w-full justify-center" cargando={cargando} disabled={codigo.trim().length < 8}>
              Continuar
            </Boton>
          </motion.form>
        ) : (
          <motion.form
            key="datos"
            onSubmit={registrar}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="mt-6 space-y-4"
          >
            <div className="flex items-start gap-3 rounded-xl border border-borde bg-superficie-2 p-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-marca-suave text-marca">
                {info.otorga_superadmin ? <ShieldCheck className="size-4" /> : <Building2 className="size-4" />}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{info.otorga_superadmin ? "Superadministración de la plataforma" : info.sistema}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {info.otorga_superadmin && info.sistema && <Insignia tono="info">{info.sistema}</Insignia>}
                  {info.roles.map((r) => (
                    <Insignia key={r} tono="marca">
                      {ETIQUETA_ROL[r]}
                    </Insignia>
                  ))}
                </div>
              </div>
            </div>
            <Entrada etiqueta="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Entrada etiqueta="Correo electrónico" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Entrada etiqueta="Contraseña" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} ayuda="Mínimo 10 caracteres." />
            <Entrada etiqueta="Confirmar contraseña" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            {error && <p className="rounded-lg bg-[color-mix(in_oklab,var(--peligro)_8%,transparent)] px-3 py-2 text-sm text-peligro">{error}</p>}
            <Boton type="submit" tamano="lg" className="w-full justify-center" cargando={cargando} disabled={nombre.trim().length < 3 || !email.includes("@")}>
              Crear mi cuenta
            </Boton>
          </motion.form>
        )}
      </AnimatePresence>
    </>
  );
}
