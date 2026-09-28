import { Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import { NAVEGACION, puedeVer } from "@/components/layout/navegacion";
import { Boton } from "@/components/ui/boton";
import { Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Tarjeta } from "@/components/ui/superficies";
import { cambiarPreferencias, PREFERENCIAS_DEFECTO, usePreferencias, type Preferencias } from "@/lib/preferencias";
import { soloLoPropio, useSesion } from "@/sesion/SesionProvider";
import { cn } from "@/lib/utils";

/** Ajustes de interfaz de cada usuario (se guardan en su perfil y lo siguen a cualquier PC). */
export function Personalizacion() {
  const { perfil, roles, permisos, esSuperadmin } = useSesion();
  const p = usePreferencias();
  const cambiar = (c: Partial<Preferencias>) => cambiarPreferencias(c, perfil?.id);
  const propio = soloLoPropio(roles);
  const paginas = NAVEGACION.filter((i) => !i.soloBusqueda && !i.soloSuperadmin && puedeVer(i, roles, esSuperadmin, permisos, propio));
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
      </div>
    </Tarjeta>
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
  { clave: "nieve", nombre: "Nieve", fondo: "#f6f7f9", superficie: "#ffffff", borde: "#e4e7ec", texto: "#101828", suave: "#98a2b3" },
  { clave: "marfil", nombre: "Marfil", fondo: "#f6f4ef", superficie: "#fffdf9", borde: "#e5dfd3", texto: "#1c1917", suave: "#a39c93" },
  { clave: "niebla", nombre: "Niebla", fondo: "#eef2f7", superficie: "#fbfcfe", borde: "#d9e0ea", texto: "#0f172a", suave: "#94a3b8" },
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
