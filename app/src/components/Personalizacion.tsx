import { Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import { NAVEGACION } from "@/components/layout/navegacion";
import { Boton } from "@/components/ui/boton";
import { Interruptor, Segmentado, Selector } from "@/components/ui/campos";
import { Tarjeta } from "@/components/ui/superficies";
import { puede } from "@/lib/permisos";
import { cambiarPreferencias, PREFERENCIAS_DEFECTO, usePreferencias, type Preferencias } from "@/lib/preferencias";
import { soloLoPropio, useSesion } from "@/sesion/SesionProvider";

/** Ajustes de interfaz de cada usuario (se guardan en su perfil y lo siguen a cualquier PC). */
export function Personalizacion() {
  const { perfil, roles, permisos, esSuperadmin } = useSesion();
  const p = usePreferencias();
  const cambiar = (c: Partial<Preferencias>) => cambiarPreferencias(c, perfil?.id);
  const propio = soloLoPropio(roles);
  const paginas = NAVEGACION.filter((i) => !i.soloSuperadmin && !(i.ocultoPropio && propio) && (!i.modulo || puede(roles, i.modulo, esSuperadmin, permisos)));
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
