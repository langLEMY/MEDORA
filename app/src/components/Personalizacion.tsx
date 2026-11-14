import { Building2, Check, Monitor, Moon, Palette, Pipette, RotateCcw, Sun } from "lucide-react";
import { NAVEGACION, puedeVer } from "@/components/layout/navegacion";
import { Boton } from "@/components/ui/boton";
import { Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Tarjeta } from "@/components/ui/superficies";
import { cambiarPreferencias, PREFERENCIAS_DEFECTO, usePreferencias, type Preferencias } from "@/lib/preferencias";
import { soloLoPropio, useSesion, useSistema } from "@/sesion/SesionProvider";
import { cn } from "@/lib/utils";

/** Ajustes de interfaz de cada usuario (se guardan en su perfil y lo siguen a cualquier PC). */
export function Personalizacion() {
  const { perfil, roles, permisos, esSuperadmin, sede, capacidades, naturaleza } = useSesion();
  const { sistema } = useSistema();
  const p = usePreferencias();
  const cambiar = (c: Partial<Preferencias>) => cambiarPreferencias(c, perfil?.id);
  const propio = soloLoPropio(roles);
  const paginas = NAVEGACION.filter((i) => !i.soloBusqueda && !i.soloSuperadmin && puedeVer(i, roles, esSuperadmin, permisos, propio, sede ? capacidades : undefined, naturaleza));
  const modificado = JSON.stringify(p) !== JSON.stringify(PREFERENCIAS_DEFECTO);

  const fila = (titulo: string, ayuda: string, control: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-texto-3">{ayuda}</p>
      </div>
      {control}
    </div>
  );

  return (
    <Tarjeta className="p-6">
      <div className="mb-1 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-marca-suave text-marca">
          <Palette className="size-[1.125rem]" />
        </span>
        <div className="flex-1">
          <h2 className="text-[0.9375rem] font-semibold">Personalización</h2>
          <p className="text-xs text-texto-3">Solo para ti; te sigue en cualquier computadora.</p>
        </div>
        {modificado && (
          <Boton variante="fantasma" tamano="sm" icono={<RotateCcw className="size-3.5" />} onClick={() => cambiar(PREFERENCIAS_DEFECTO)}>
            Restablecer
          </Boton>
        )}
      </div>

      <div className="divide-y divide-borde">
        {fila(
          "Tema",
          "«Sistema» cambia solo cuando Windows pasa a claro u oscuro.",
          <Segmentado
            id="pref-tema"
            valor={p.tema}
            onChange={(tema) => cambiar({ tema })}
            opciones={[
              { valor: "claro", etiqueta: <Etiqueta icono={<Sun />} texto="Claro" /> },
              { valor: "oscuro", etiqueta: <Etiqueta icono={<Moon />} texto="Oscuro" /> },
              { valor: "sistema", etiqueta: <Etiqueta icono={<Monitor />} texto="Sistema" /> },
            ]}
          />,
        )}
        <div className="py-3.5">
          <p className="text-sm font-medium">Estilo de color</p>
          <p className="mb-3 text-xs text-texto-3">Uno para el modo claro y otro para el oscuro. El color del hospital se mantiene.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-texto-2">
                <Sun className="size-3.5" /> Claro
              </p>
              <div className="flex flex-wrap gap-2">
                {ESTILOS_CLAROS.map((e) => (
                  <Muestra key={e.clave} estilo={e} activo={p.claro === e.clave} onClick={() => cambiar({ claro: e.clave, ...(p.tema === "oscuro" ? { tema: "claro" as const } : {}) })} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-texto-2">
                <Moon className="size-3.5" /> Oscuro
              </p>
              <div className="flex flex-wrap gap-2">
                {ESTILOS_OSCUROS.map((e) => (
                  <Muestra key={e.clave} estilo={e} activo={p.oscuro === e.clave} onClick={() => cambiar({ oscuro: e.clave, ...(p.tema === "claro" ? { tema: "oscuro" as const } : {}) })} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <AcentoColor valor={p.acento} colorHospital={sistema?.color_marca} onChange={(acento) => cambiar({ acento })} />
        {fila(
          "Tamaño del texto",
          "Agranda toda la interfaz en proporción. No cambia lo que se imprime.",
          <Segmentado
            id="pref-texto"
            valor={p.texto}
            onChange={(texto) => cambiar({ texto })}
            opciones={[
              { valor: "normal", etiqueta: <span className="text-[0.8125rem]">Aa</span> },
              { valor: "grande", etiqueta: <span className="text-[0.9375rem]">Aa</span> },
              { valor: "muy-grande", etiqueta: <span className="text-[1.0625rem]">Aa</span> },
            ]}
          />,
        )}
        {fila(
          "Densidad",
          "Compacta muestra más filas en pantallas pequeñas.",
          <Segmentado
            id="pref-densidad"
            valor={p.densidad}
            onChange={(densidad) => cambiar({ densidad })}
            opciones={[
              { valor: "comoda", etiqueta: "Cómoda" },
              { valor: "compacta", etiqueta: "Compacta" },
            ]}
          />,
        )}
        {fila(
          "Alto contraste",
          "Textos secundarios y bordes más oscuros; útil con mucha luz o poca visión.",
          <Interruptor activo={p.contraste === "alto"} onChange={(v) => cambiar({ contraste: v ? "alto" : "normal" })} />,
        )}
        {fila(
          "Reducir animaciones",
          "Quita los movimientos de la interfaz; los cambios son instantáneos.",
          <Interruptor activo={p.movimiento === "reducido"} onChange={(v) => cambiar({ movimiento: v ? "reducido" : "completo" })} />,
        )}
        {fila(
          "Al entrar, abrir",
          "La primera pantalla al iniciar MEDORA.",
          <Selector value={p.inicio} onChange={(e) => cambiar({ inicio: e.target.value })} contenedor="w-52">
            <option value="auto">Según mi rol (recomendado)</option>
            {paginas.map((i) => (
              <option key={i.ruta} value={i.ruta}>
                {propio && i.etiquetaPropia ? i.etiquetaPropia : i.etiqueta}
              </option>
            ))}
          </Selector>,
        )}
        {fila(
          "Bloqueo por inactividad",
          "Pide tu contraseña tras un rato sin usar MEDORA, sin cerrar la sesión ni perder lo que estés haciendo.",
          <Selector value={p.bloqueo} onChange={(e) => cambiar({ bloqueo: e.target.value as typeof p.bloqueo })} contenedor="w-52">
            <option value="nunca">Nunca</option>
            <option value="15">A los 15 minutos</option>
            <option value="25">A los 25 minutos</option>
            <option value="30">A los 30 minutos</option>
          </Selector>,
        )}
      </div>
    </Tarjeta>
  );
}

// Acentos sugeridos (se ven bien en claro y oscuro; todo lo demás se deriva con color-mix).
const ACENTOS = [
  { nombre: "Verde azulado", color: "#0F766E" },
  { nombre: "Océano", color: "#0E7490" },
  { nombre: "Añil", color: "#4F46E5" },
  { nombre: "Violeta", color: "#7A5AF8" },
  { nombre: "Magenta", color: "#C026D3" },
  { nombre: "Rosa", color: "#E11D48" },
  { nombre: "Ámbar", color: "#D97706" },
  { nombre: "Esmeralda", color: "#059669" },
];

/** Acento personal: pisa el color del hospital solo para este usuario. */
function AcentoColor({ valor, colorHospital, onChange }: { valor: string; colorHospital?: string | null; onChange: (v: string) => void }) {
  const personalizado = valor !== "hospital" && !ACENTOS.some((a) => a.color.toLowerCase() === valor.toLowerCase());
  return (
    <div className="py-3.5">
      <p className="text-sm font-medium">Color de acento</p>
      <p className="mb-3 text-xs text-texto-3">Tiñe botones, enlaces y detalles. Solo para ti; no cambia el color del hospital para los demás.</p>
      <div className="flex flex-wrap items-center gap-2">
        {/* Volver al color del hospital */}
        <button
          type="button"
          onClick={() => onChange("hospital")}
          aria-pressed={valor === "hospital"}
          title="Usar el color del hospital"
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-shadow",
            valor === "hospital" ? "border-marca ring-2 ring-marca" : "border-borde text-texto-2 hover:border-borde-fuerte",
          )}
        >
          <span className="size-4 rounded-full ring-1 ring-black/10" style={{ background: colorHospital ?? "#0f766e" }} />
          <Building2 className="size-3.5" /> Hospital
        </button>
        {ACENTOS.map((a) => {
          const activo = valor.toLowerCase() === a.color.toLowerCase();
          return (
            <button
              key={a.color}
              type="button"
              onClick={() => onChange(a.color)}
              aria-pressed={activo}
              title={a.nombre}
              className={cn(
                "grid size-9 place-items-center rounded-xl ring-1 transition-transform hover:scale-105 active:scale-95",
                activo ? "ring-2 ring-offset-2 ring-offset-superficie" : "ring-black/10",
              )}
              style={{ background: a.color, ...(activo ? { ["--tw-ring-color" as string]: a.color } : {}) }}
            >
              {activo && <Check className="size-4 text-white drop-shadow" />}
            </button>
          );
        })}
        {/* Color a la medida */}
        <label
          className={cn(
            "relative grid size-9 cursor-pointer place-items-center rounded-xl text-texto-2 ring-1 transition-transform hover:scale-105",
            personalizado ? "ring-2 ring-marca" : "ring-borde",
          )}
          style={personalizado ? { background: valor } : undefined}
          title="Elegir otro color"
        >
          <Pipette className={cn("size-4", personalizado && "text-white drop-shadow")} />
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={personalizado ? valor : (colorHospital ?? "#0f766e")}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
        </label>
      </div>
    </div>
  );
}

function Etiqueta({ icono, texto }: { icono: React.ReactElement<{ className?: string }>; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 [&>svg]:size-3.5">
      {icono}
      {texto}
    </span>
  );
}

interface Estilo<K extends string> {
  clave: K;
  nombre: string;
  fondo: string;
  superficie: string;
  borde: string;
  texto: string;
  suave: string;
}

// Colores de muestra (los reales viven en index.css: data-claro / data-oscuro).
const ESTILOS_CLAROS: Estilo<Preferencias["claro"]>[] = [
  { clave: "nieve", nombre: "Nieve", fondo: "#e9ecf0", superficie: "#f5f6f8", borde: "#d8dde4", texto: "#171d29", suave: "#8b94a4" },
  { clave: "marfil", nombre: "Marfil", fondo: "#ebe6dc", superficie: "#f6f2eb", borde: "#dcd4c6", texto: "#221e1a", suave: "#978f84" },
  { clave: "niebla", nombre: "Niebla", fondo: "#e2e7ee", superficie: "#eff2f6", borde: "#d0d8e3", texto: "#131b2e", suave: "#8793a6" },
];
const ESTILOS_OSCUROS: Estilo<Preferencias["oscuro"]>[] = [
  { clave: "grafito", nombre: "Grafito", fondo: "#0b0d12", superficie: "#12151c", borde: "#232834", texto: "#f2f4f7", suave: "#6b7383" },
  { clave: "medianoche", nombre: "Medianoche", fondo: "#080d1a", superficie: "#0e1628", borde: "#1e2a44", texto: "#eef2f8", suave: "#647189" },
  { clave: "carbon", nombre: "Carbón", fondo: "#000000", superficie: "#0c0c0d", borde: "#212124", texto: "#f5f5f5", suave: "#6e6e6e" },
];

/** Miniatura de una pantalla con ese estilo y el color del hospital. */
function Muestra<K extends string>({ estilo: e, activo, onClick }: { estilo: Estilo<K>; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "group w-[6.5rem] rounded-xl p-1 text-left transition-shadow",
        activo ? "ring-2 ring-marca" : "ring-1 ring-borde hover:ring-borde-fuerte",
      )}
    >
      <span className="block h-14 overflow-hidden rounded-lg p-1.5" style={{ background: e.fondo }}>
        <span className="flex h-full flex-col gap-1 rounded-md border p-1.5" style={{ background: e.superficie, borderColor: e.borde }}>
          <span className="h-1.5 w-8 rounded-full" style={{ background: e.texto }} />
          <span className="h-1.5 w-12 rounded-full" style={{ background: e.suave }} />
          <span className="mt-auto h-2 w-6 rounded-sm bg-marca" />
        </span>
      </span>
      <span className="block px-1 pt-1 pb-0.5 text-xs font-medium">{e.nombre}</span>
    </button>
  );
}
