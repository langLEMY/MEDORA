import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { useAseguradoras } from "@/lib/consultas";
import { mensajeError, supabase, type Fila } from "@/lib/supabase";
import { useSistema } from "@/sesion/SesionProvider";

const opcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const esquema = z.object({
  nombres: z.string().trim().min(1, "Requerido"),
  apellidos: z.string().trim().min(1, "Requerido"),
  documento_tipo: z.enum(["cedula", "pasaporte", "menor", "otro"]),
  documento: opcional,
  fecha_nacimiento: opcional,
  sexo: opcional,
  telefono: opcional,
  email: opcional,
  direccion: opcional,
  tipo_sangre: opcional,
  alergias: opcional,
  condiciones_cronicas: opcional,
  aseguradora_id: opcional,
  numero_afiliado: opcional,
  contacto_emergencia_nombre: opcional,
  contacto_emergencia_telefono: opcional,
  notas: opcional,
});
type Entrada_ = z.input<typeof esquema>;
type Salida = z.output<typeof esquema>;

const vacio: Entrada_ = {
  nombres: "",
  apellidos: "",
  documento_tipo: "cedula",
  documento: "",
  fecha_nacimiento: "",
  sexo: "",
  telefono: "",
  email: "",
  direccion: "",
  tipo_sangre: "",
  alergias: "",
  condiciones_cronicas: "",
  aseguradora_id: "",
  numero_afiliado: "",
  contacto_emergencia_nombre: "",
  contacto_emergencia_telefono: "",
  notas: "",
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-[11px] font-semibold tracking-wide text-texto-3 uppercase">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function FormPaciente({
  abierto,
  onCerrar,
  paciente,
  onGuardado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  paciente?: Fila<"pacientes"> | null;
  onGuardado?: (id: string) => void;
}) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const aseguradoras = useAseguradoras(sistemaId);
  const { register, handleSubmit, reset, formState } = useForm<Entrada_, unknown, Salida>({
    resolver: zodResolver(esquema),
    defaultValues: vacio,
  });
  const e = formState.errors;

  useEffect(() => {
    if (!abierto) return;
    if (paciente) {
      const valores = Object.fromEntries(
        Object.keys(vacio).map((k) => [k, (paciente as Record<string, unknown>)[k] ?? ""]),
      ) as Entrada_;
      reset(valores);
    } else reset(vacio);
  }, [abierto, paciente, reset]);

  const guardar = useMutation({
    mutationFn: async (d: Salida) => {
      if (paciente) {
        const { error } = await supabase.from("pacientes").update(d).eq("id", paciente.id);
        if (error) throw error;
        return paciente.id;
      }
      const { data, error } = await supabase
        .from("pacientes")
        .insert({ ...d, sistema_id: sistemaId, expediente: "" })
        .select("id, expediente")
        .single();
      if (error) throw error;
      toast.success(`Paciente registrado · ${data.expediente}`);
      return data.id;
    },
    onSuccess: (id) => {
      if (paciente) toast.success("Cambios guardados");
      void qc.invalidateQueries({ queryKey: ["pacientes", sistemaId] });
      void qc.invalidateQueries({ queryKey: ["paciente", sistemaId, id] });
      onGuardado?.(id);
      onCerrar();
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Modal
      lateral
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={paciente ? "Editar paciente" : "Nuevo paciente"}
      descripcion={paciente ? paciente.expediente : "El número de expediente se asigna automáticamente."}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={guardar.isPending} onClick={handleSubmit((d) => guardar.mutate(d))}>
            {paciente ? "Guardar cambios" : "Registrar paciente"}
          </Boton>
        </>
      }
    >
      <form className="space-y-8" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <Seccion titulo="Identificación">
          <div className="grid grid-cols-2 gap-4">
            <Entrada etiqueta="Nombres" error={e.nombres?.message} {...register("nombres")} />
            <Entrada etiqueta="Apellidos" error={e.apellidos?.message} {...register("apellidos")} />
            <Selector etiqueta="Tipo de documento" {...register("documento_tipo")}>
              <option value="cedula">Cédula</option>
              <option value="pasaporte">Pasaporte</option>
              <option value="menor">Menor de edad</option>
              <option value="otro">Otro</option>
            </Selector>
            <Entrada etiqueta="Número de documento" placeholder="000-0000000-0" {...register("documento")} />
            <Entrada etiqueta="Fecha de nacimiento" type="date" {...register("fecha_nacimiento")} />
            <Selector etiqueta="Sexo" {...register("sexo")}>
              <option value="">—</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="X">Otro</option>
            </Selector>
          </div>
        </Seccion>

        <Seccion titulo="Contacto">
          <div className="grid grid-cols-2 gap-4">
            <Entrada etiqueta="Teléfono" type="tel" {...register("telefono")} />
            <Entrada etiqueta="Correo" type="email" {...register("email")} />
          </div>
          <Entrada etiqueta="Dirección" {...register("direccion")} />
          <div className="grid grid-cols-2 gap-4">
            <Entrada etiqueta="Contacto de emergencia" {...register("contacto_emergencia_nombre")} />
            <Entrada etiqueta="Teléfono de emergencia" type="tel" {...register("contacto_emergencia_telefono")} />
          </div>
        </Seccion>

        <Seccion titulo="Clínico">
          <div className="grid grid-cols-2 gap-4">
            <Selector etiqueta="Tipo de sangre" {...register("tipo_sangre")}>
              <option value="">—</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Selector>
          </div>
          <AreaTexto etiqueta="Alergias" className="min-h-16" placeholder="Ninguna conocida" {...register("alergias")} />
          <AreaTexto etiqueta="Condiciones crónicas" className="min-h-16" {...register("condiciones_cronicas")} />
        </Seccion>

        <Seccion titulo="Seguro médico">
          <div className="grid grid-cols-2 gap-4">
            <Selector etiqueta="Aseguradora (ARS)" {...register("aseguradora_id")}>
              <option value="">Sin seguro</option>
              {aseguradoras.data
                ?.filter((a) => a.activo || a.id === paciente?.aseguradora_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </Selector>
            <Entrada etiqueta="Número de afiliado" {...register("numero_afiliado")} />
          </div>
        </Seccion>

        <AreaTexto etiqueta="Notas administrativas" className="min-h-16" {...register("notas")} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
