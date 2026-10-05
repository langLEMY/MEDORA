import { Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Boton } from "@/components/ui/boton";
import { Modal } from "@/components/ui/modal";

/**
 * "Qué hay de nuevo": al abrir una versión nueva por primera vez se muestran sus notas
 * (notas-version/vX.Y.Z.md, las mismas de la release de GitHub). Se recuerda por
 * computadora la última versión vista; si la versión no tiene notas, no aparece nada.
 */
const NOTAS = import.meta.glob("../../../notas-version/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const CLAVE = "medora.novedades-vistas";

export function notasDeVersion(version: string): string | null {
  const entrada = Object.entries(NOTAS).find(([ruta]) => ruta.endsWith(`/v${version}.md`));
  return entrada?.[1] ?? null;
}

/** Montado en AppShell: se abre solo una vez por versión. */
export function NovedadesAlActualizar() {
  const [abierto, setAbierto] = useState(false);
  const notas = notasDeVersion(__VERSION_APP__);
  useEffect(() => {
    if (!notas) return;
    try {
      const vista = localStorage.getItem(CLAVE);
      // Instalación nueva (nunca vio ninguna): no se interrumpe; queda marcada.
      if (vista === null) localStorage.setItem(CLAVE, __VERSION_APP__);
      else if (vista !== __VERSION_APP__) setAbierto(true);
    } catch {
      /* sin almacenamiento: no se muestra */
    }
  }, [notas]);

  const cerrar = () => {
    setAbierto(false);
    try {
      localStorage.setItem(CLAVE, __VERSION_APP__);
    } catch {
      /* nada */
    }
  };
  if (!notas) return null;
  return <VentanaNovedades abierto={abierto} onCerrar={cerrar} notas={notas} />;
}

export function VentanaNovedades({ abierto, onCerrar, notas }: { abierto: boolean; onCerrar: () => void; notas: string }) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 text-marca" /> Qué hay de nuevo en MEDORA {__VERSION_APP__}
        </span>
      }
      pie={<Boton onClick={onCerrar}>Entendido</Boton>}
    >
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <Markdown texto={notas} />
      </div>
    </Modal>
  );
}

/** Markdown mínimo de las notas: títulos, listas, citas, separadores, **negrita** y `código`. */
function Markdown({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: string[] = [];
  const cerrarLista = () => {
    if (!lista.length) return;
    bloques.push(
      <ul key={bloques.length} className="mb-4 space-y-1.5 pl-1">
        {lista.map((l, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-texto-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-texto-3" />
            <span>{enLinea(l)}</span>
          </li>
        ))}
      </ul>,
    );
    lista = [];
  };
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    if (/^[-*] /.test(t)) {
      lista.push(t.slice(2));
      continue;
    }
    cerrarLista();
    if (!t) continue;
    if (t === "---") bloques.push(<hr key={bloques.length} className="my-4 border-borde" />);
    else if (t.startsWith("### ")) bloques.push(<h3 key={bloques.length} className="mt-4 mb-2 text-[0.9375rem] font-semibold">{enLinea(t.slice(4))}</h3>);
    else if (t.startsWith("## ")) bloques.push(<h2 key={bloques.length} className="mb-3 text-lg font-semibold">{enLinea(t.slice(3))}</h2>);
    else if (t.startsWith("> ")) bloques.push(<p key={bloques.length} className="mb-4 rounded-xl bg-marca-suave px-4 py-3 text-sm text-marca-texto">{enLinea(t.slice(2))}</p>);
    else bloques.push(<p key={bloques.length} className="mb-3 text-sm leading-relaxed text-texto-2">{enLinea(t)}</p>);
  }
  cerrarLista();
  return <>{bloques}</>;
}

function enLinea(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? (
      <strong key={i} className="font-semibold text-texto">
        {parte.slice(2, -2)}
      </strong>
    ) : parte.startsWith("`") && parte.endsWith("`") ? (
      <code key={i} className="rounded bg-superficie-2 px-1 font-mono text-[0.8125rem]">
        {parte.slice(1, -1)}
      </code>
    ) : (
      parte
    ),
  );
}
