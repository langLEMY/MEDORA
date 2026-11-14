import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ChevronDown, Droplet, HeartPulse, Pencil, Stethoscope, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Menu } from "@/components/ui/menu";
import { Insignia } from "@/components/ui/superficies";
import { supabase } from "@/lib/supabase";
import { cn, edad, fechaHora, relativo } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { ANTECEDENTES, ETIQUETA_CONDICION, habitosActivos, listaAlergias, type Antecedentes } from "./catalogoClinico";

export interface DatosCabecera {
  alergias: string | null;
  tipo_sangre: string | null;
  condiciones_cronicas: string | null;
  habitos: unknown;
  antecedentes: unknown;
  condiciones_especiales: string[] | null;
  fecha_nacimiento: string | null;
  medico_cabecera?: { nombre_completo: string } | null;
}

// Signos que se muestran en la cabecera, en este orden.
const SIGNOS: [string, string, string?][] = [
  ["pa", "PA"],
  ["fc", "FC", "lpm"],
  ["fr", "FR"],
  ["temp", "T", "°C"],
  ["sat", "SatO₂", "%"],
  ["peso", "Peso", "kg"],
  ["glucosa", "Glucosa", "mg/dL"],
];

/**
 * Lo clínico que debe verse de un vistazo: alergias (siempre visibles), tipo de
 * sangre, condiciones especiales, hábitos, antecedentes, médico de cabecera y los
 * últimos signos vitales.
 */
export function CabeceraClinica({ pacienteId, p, verHistorial, onEditar }: { pacienteId: string; p: DatosCabecera; verHistorial: boolean; onEditar?: () => void }) {
  const { sistemaId } = useSistema();
  const signos = useQuery({
    queryKey: ["cabecera-clinica", sistemaId, pacienteId],
    enabled: verHistorial,
    queryFn: async () => {
      const { data } = await supabase
        .from("historial_clinico")
        .select("datos, creado_en")
        .eq("sistema_id", sistemaId)
        .eq("paciente_id", pacienteId)
        .in("tipo", ["signos_vitales", "triaje"])
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { datos: Record<string, unknown>; creado_en: string } | null;
    },
  });

  const alergias = listaAlergias(p.alergias);
  const habitos = habitosActivos(p.habitos);
  const antecedentes = ANTECEDENTES.map((a) => ({ ...a, texto: ((p.antecedentes as Antecedentes | null)?.[a.clave] ?? "").trim() })).filter((a) => a.texto);
  const mayor = (edad(p.fecha_nacimiento) ?? 0) >= 65;
  const condiciones = [...(p.condiciones_especiales ?? []).map((c) => ETIQUETA_CONDICION[c] ?? c), ...(mayor ? ["Adulto mayor"] : [])];
  const s = signos.data;
  const valores = s ? SIGNOS.filter(([k]) => s.datos?.[k] !== undefined && s.datos?.[k] !== "") : [];

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {p.tipo_sangre && (
          <Insignia tono="peligro">
            <Droplet className="size-3" /> {p.tipo_sangre}
          </Insignia>
        )}
        {alergias.length ? (
          alergias.map((a) => (
            <Insignia key={a} tono="peligro">
              <AlertTriangle className="size-3" /> {a}
            </Insignia>
          ))
        ) : (
          <span className="text-xs text-texto-3">Sin alergias registradas</span>
        )}
        {condiciones.map((c) => (
          <Insignia key={c} tono="violeta">
            {c}
          </Insignia>
        ))}
        {p.condiciones_cronicas && <Insignia tono="aviso">{p.condiciones_cronicas}</Insignia>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Desplegable titulo="Hábitos tóxicos" icono={Activity} cuenta={habitos.length} vacio="Sin hábitos registrados" onEditar={onEditar}>
          {habitos.map((h) => (
            <div key={h.clave} className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
              <span>{h.etiqueta}</span>
              <Insignia tono={h.nivel === "Lo dejó" ? "neutro" : h.nivel === "Ocasional" ? "info" : "aviso"}>{h.nivel}</Insignia>
            </div>
          ))}
        </Desplegable>
        <Desplegable titulo="Antecedentes" icono={HeartPulse} cuenta={antecedentes.length} vacio="Sin antecedentes registrados" onEditar={onEditar} ancho={340}>
          {antecedentes.map((a) => (
            <div key={a.clave} className="px-2.5 py-1.5">
              <p className="text-[0.6875rem] font-medium text-texto-3">{a.etiqueta}</p>
              <p className="text-sm whitespace-pre-wrap">{a.texto}</p>
            </div>
          ))}
        </Desplegable>
        {p.medico_cabecera && (
          <span className="inline-flex items-center gap-1.5 text-xs text-texto-2">
            <Stethoscope className="size-3.5 text-texto-3" /> Médico de cabecera: <b className="font-medium text-texto">{p.medico_cabecera.nombre_completo}</b>
          </span>
        )}
      </div>

      {verHistorial && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-superficie-2/70 px-3.5 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-texto-2">
            <HeartPulse className="size-3.5 text-marca" /> Últimos signos vitales
          </span>
          {signos.isLoading ? (
            <span className="h-3 w-40 animate-pulse rounded bg-superficie-2" />
          ) : valores.length ? (
            <>
              {valores.map(([k, etiqueta, unidad]) => (
                <span key={k} className="tabular">
                  <span className="text-texto-3">{etiqueta}</span> <b className="font-semibold">{String(s!.datos[k])}</b>
                  {unidad && <span className="text-texto-3"> {unidad}</span>}
                </span>
              ))}
              <span className="ml-auto text-texto-3" title={fechaHora(s!.creado_en)}>
                {relativo(s!.creado_en)}
              </span>
            </>
          ) : (
            <span className="text-texto-3">Sin registro todavía (Enfermería → Signos vitales)</span>
          )}
        </div>
      )}
    </div>
  );
}

function Desplegable({
  titulo,
  icono: Icono,
  cuenta,
  vacio,
  children,
  onEditar,
  ancho = 280,
}: {
  titulo: string;
  icono: LucideIcon;
  cuenta: number;
  vacio: string;
  children: ReactNode;
  onEditar?: () => void;
  ancho?: number;
}) {
  return (
    <Menu
      ancho={ancho}
      disparador={(abierto) => (
        <button
          type="button"
          aria-expanded={abierto}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
            cuenta ? "border-aviso/40 bg-[color-mix(in_oklab,var(--aviso)_8%,var(--superficie))] text-texto" : "border-borde bg-superficie text-texto-2 hover:text-texto",
          )}
        >
          <Icono className="size-3.5" />
          {titulo}
          {cuenta > 0 && <span className="rounded-full bg-aviso/15 px-1.5 text-[0.6875rem] text-aviso tabular">{cuenta}</span>}
          <ChevronDown className={cn("size-3 transition-transform duration-200", abierto && "rotate-180")} />
        </button>
      )}
    >
      {(cerrar) => (
        <div className="py-1">
          {cuenta ? children : <p className="px-2.5 py-2 text-sm text-texto-3">{vacio}</p>}
          {onEditar && (
            <button
              type="button"
              onClick={() => {
                cerrar();
                onEditar();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-marca-texto transition-colors hover:bg-marca-suave"
            >
              <Pencil className="size-3.5" /> Editar en la ficha
            </button>
          )}
        </div>
      )}
    </Menu>
  );
}
