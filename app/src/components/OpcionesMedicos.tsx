import { porEspecialidad, type Miembro } from "@/lib/consultas";

/**
 * Opciones de un <select> de médicos agrupadas por especialidad. Con
 * `especialidades`, cada grupo empieza con una opción para toda la especialidad
 * (valor "esp:<nombre>"); `etiquetaEspecialidad` cambia su texto.
 */
export function OpcionesMedicos({
  medicos,
  especialidades = false,
  etiquetaEspecialidad = (esp) => `Todos · ${esp}`,
}: {
  medicos: Miembro[];
  especialidades?: boolean;
  etiquetaEspecialidad?: (esp: string) => string;
}) {
  return porEspecialidad(medicos).map(([esp, ms]) => (
    <optgroup key={esp} label={esp}>
      {especialidades && ms.length > 1 && <option value={`esp:${esp}`}>{etiquetaEspecialidad(esp)}</option>}
      {ms.map((m) => (
        <option key={m.usuario_id} value={m.usuario_id}>
          {m.perfil?.nombre_completo}
        </option>
      ))}
    </optgroup>
  ));
}
