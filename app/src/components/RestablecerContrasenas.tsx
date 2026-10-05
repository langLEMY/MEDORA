import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, KeyRound, Printer, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Documento, TablaDocumento } from "@/components/Documento";
import { Boton } from "@/components/ui/boton";
import { Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { exportarExcel } from "@/lib/excel";
import { datos, invocar, mensajeError, supabase } from "@/lib/supabase";
import { fechaHora } from "@/lib/utils";

/**
 * Restablecer las contraseñas de todo el personal de un sistema (solo superadmin,
 * con 2FA en la sesión y la frase RESTABLECER). Cada persona recibe una contraseña
 * temporal distinta y debe cambiarla al entrar; se cierran sus sesiones abiertas.
 * La lista se muestra una sola vez: imprimirla o exportarla para repartirla.
 */
interface Fila {
  nombre: string;
  usuario: string | null;
  password: string | null;
  error?: string;
}
interface Resultado {
  sistema: string;
  restablecidas: number;
  sesiones_cerradas: number;
  lista: Fila[];
}

export function RestablecerContrasenas() {
  const [abierto, setAbierto] = useState(false);
  const [sistemaId, setSistemaId] = useState("");
  const [frase, setFrase] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [imprimir, setImprimir] = useState(false);

  const sistemas = useQuery({
    queryKey: ["plataforma-sistemas"],
    enabled: abierto,
    queryFn: async () => datos(await supabase.from("sistemas").select("id, nombre, es_pruebas").order("nombre")) ?? [],
  });
  useEffect(() => {
    if (abierto && !sistemaId && sistemas.data?.length) setSistemaId(sistemas.data.find((s) => !s.es_pruebas)?.id ?? sistemas.data[0].id);
  }, [abierto, sistemaId, sistemas.data]);

  // Exige que esta sesión haya pasado el código de 2FA (el servidor también lo verifica).
  const nivel = useQuery({
    queryKey: ["aal-actual"],
    enabled: abierto,
    queryFn: async () => (await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel ?? "aal1",
  });
  const con2fa = nivel.data === "aal2";

  const m = useMutation({
    mutationFn: async () => invocar<Resultado>("plataforma-usuarios", { accion: "restablecer_sistema", sistema_id: sistemaId, confirmacion: frase }),
    onSuccess: (r) => {
      setResultado(r);
      setFrase("");
      toast.success(`${r.restablecidas} contraseñas restablecidas en ${r.sistema}`);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const cerrar = () => {
    setAbierto(false);
    setFrase("");
    setResultado(null);
  };

  const excel = () =>
    void exportarExcel(`Contraseñas temporales ${resultado!.sistema}`, [
      {
        nombre: "Contraseñas temporales",
        columnas: [
          { titulo: "Nombre", valor: (f: Fila) => f.nombre },
          { titulo: "Usuario", valor: (f: Fila) => f.usuario ?? "" },
          { titulo: "Contraseña temporal", valor: (f: Fila) => f.password ?? `Error: ${f.error ?? ""}` },
        ],
        filas: resultado!.lista,
      },
    ]);

  return (
    <>
      <Boton variante="secundario" icono={<KeyRound className="size-4" />} onClick={() => setAbierto(true)}>
        Restablecer contraseñas
      </Boton>

      <Modal
        abierto={abierto}
        onCerrar={cerrar}
        ancho={resultado ? "lg" : "sm"}
        titulo={resultado ? `Contraseñas temporales · ${resultado.sistema}` : "Restablecer contraseñas del personal"}
        descripcion={
          resultado
            ? "Esta lista solo se muestra ahora: imprímela o expórtala y repártela en persona. Cada quien debe cambiarla al entrar."
            : "Cada persona del hospital recibe una contraseña temporal distinta y deberá cambiarla al entrar. Se cierran sus sesiones abiertas."
        }
        pie={
          resultado ? (
            <>
              <Boton variante="secundario" icono={<FileSpreadsheet className="size-4" />} onClick={excel}>
                Excel
              </Boton>
              <Boton variante="secundario" icono={<Printer className="size-4" />} onClick={() => setImprimir(true)}>
                Imprimir
              </Boton>
              <Boton onClick={cerrar}>Listo</Boton>
            </>
          ) : (
            <>
              <Boton variante="secundario" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton variante="peligro" cargando={m.isPending} disabled={!con2fa || !sistemaId || frase.trim().toUpperCase() !== "RESTABLECER"} onClick={() => m.mutate()}>
                Restablecer
              </Boton>
            </>
          )
        }
      >
        {resultado ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-borde">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-superficie-2 text-left text-xs text-texto-3">
                <tr>
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Usuario</th>
                  <th className="px-4 py-2 font-medium">Contraseña temporal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {resultado.lista.map((f, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{f.nombre}</td>
                    <td className="px-4 py-2 font-mono text-xs">{f.usuario ?? "—"}</td>
                    <td className="px-4 py-2 font-mono">{f.password ?? <span className="text-peligro">{f.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            {nivel.isFetched && !con2fa && (
              <p className="flex items-start gap-2 rounded-xl bg-[color-mix(in_oklab,var(--aviso)_10%,transparent)] px-3 py-2.5 text-sm">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-aviso" />
                Para hacerlo, activa la verificación en dos pasos (más abajo en Mi perfil), cierra sesión y vuelve a entrar con tu código.
              </p>
            )}
            <Selector etiqueta="Hospital" value={sistemaId} onChange={(e) => setSistemaId(e.target.value)}>
              {(sistemas.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <p className="text-xs text-texto-3">No se tocan las cuentas de superadmin, las de quiosco ni las inactivas.</p>
            <Entrada etiqueta='Escribe "RESTABLECER" para confirmar' autoComplete="off" value={frase} onChange={(e) => setFrase(e.target.value)} disabled={!con2fa} />
          </div>
        )}
      </Modal>

      {resultado && (
        <Documento abierto={imprimir} onCerrar={() => setImprimir(false)} titulo="Contraseñas temporales" nombreArchivo={`Contraseñas temporales ${resultado.sistema}`}>
          <div className="mb-4 border-b-2 border-[#101828] pb-3">
            <p className="text-[1rem] font-bold">{resultado.sistema} · Contraseñas temporales</p>
            <p className="text-[0.6875rem] text-[#475467]">
              Generado el {fechaHora(new Date())}. Entrégala en persona; al entrar, MEDORA pedirá cambiarla. Destruye esta hoja después.
            </p>
          </div>
          <TablaDocumento
            encabezados={["Nombre", "Usuario", "Contraseña temporal"]}
            filas={resultado.lista.map((f) => [f.nombre, f.usuario ?? "—", <span className="font-mono">{f.password ?? "(error)"}</span>])}
          />
        </Documento>
      )}
    </>
  );
}
