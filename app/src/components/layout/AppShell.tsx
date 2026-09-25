import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { puede } from "@/lib/permisos";
import { aplicarTema, temaGuardado, type Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";
import { useSesion } from "@/sesion/SesionProvider";
import { ItemMenu, Menu, SeparadorMenu } from "../ui/menu";
import { pagina } from "../ui/movimiento";
import { Avatar, Kbd } from "../ui/superficies";
import { AvisoActualizacion } from "./AvisoActualizacion";
import { Isotipo } from "./Logo";
import { NAVEGACION } from "./navegacion";
import { PaletaComandos } from "./PaletaComandos";

const CLAVE_COLAPSADO = "medora.nav-colapsada";

export function AppShell() {
  const { roles, esSuperadmin } = useSesion();
  const location = useLocation();
  const [colapsada, setColapsada] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_COLAPSADO) === "1";
    } catch {
      return false;
    }
  });
  const [paleta, setPaleta] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_COLAPSADO, colapsada ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  }, [colapsada]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibles = NAVEGACION.filter((i) =>
    i.soloSuperadmin ? esSuperadmin : i.modulo ? puede(roles, i.modulo, esSuperadmin) : true,
  );
  const grupos = [...new Set(visibles.map((i) => i.grupo))];
  const seccion = "/" + (location.pathname.split("/")[1] ?? "");

  return (
    <div className="flex h-full">
      <motion.aside
        animate={{ width: colapsada ? 68 : 248 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
        className="no-imprimir relative flex shrink-0 flex-col border-r border-borde bg-superficie"
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Isotipo className="size-7 shrink-0" />
          <AnimatePresence initial={false}>
            {!colapsada && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                className="text-[15px] font-semibold tracking-[0.08em]"
              >
                MEDORA
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <SelectorSistema colapsada={colapsada} />

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
          {grupos.map((g) => (
            <div key={g} className="mt-4 first:mt-2">
              <div
                className={cn(
                  "mb-1 h-5 px-2.5 text-[11px] font-medium tracking-wide text-texto-3 uppercase transition-opacity",
                  colapsada && "opacity-0",
                )}
              >
                {g}
              </div>
              {visibles
                .filter((i) => i.grupo === g)
                .map((i) => {
                  const activo = i.ruta === "/" ? seccion === "/" : seccion === i.ruta;
                  return (
                    <NavLink
                      key={i.ruta}
                      to={i.ruta}
                      title={colapsada ? i.etiqueta : undefined}
                      className={cn(
                        "relative mb-0.5 flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-sm font-medium transition-colors duration-150",
                        activo ? "text-texto" : "text-texto-2 hover:bg-superficie-2 hover:text-texto",
                      )}
                    >
                      {activo && (
                        <motion.span
                          layoutId="nav-activo"
                          className="absolute inset-0 rounded-[10px] border border-borde bg-superficie-2 shadow-sm"
                          transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                        />
                      )}
                      <i.icono
                        className={cn("relative size-[18px] shrink-0 transition-colors", activo && "text-marca")}
                        strokeWidth={activo ? 2.2 : 1.8}
                      />
                      <span className={cn("relative truncate transition-opacity", colapsada && "opacity-0")}>
                        {i.etiqueta}
                      </span>
                    </NavLink>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="border-t border-borde p-3">
          <button
            onClick={() => setColapsada((c) => !c)}
            className="flex h-9 w-full items-center gap-3 rounded-[10px] px-2.5 text-sm text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto"
          >
            {colapsada ? <PanelLeftOpen className="size-[18px] shrink-0" /> : <PanelLeftClose className="size-[18px] shrink-0" />}
            <span className={cn("truncate transition-opacity", colapsada && "opacity-0")}>Contraer menú</span>
          </button>
        </div>
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior onBuscar={() => setPaleta(true)} />
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={seccion}
            variants={pagina}
            initial="inicial"
            animate="visible"
            className="mx-auto w-full max-w-[1400px] px-6 py-6 lg:px-8"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <PaletaComandos abierta={paleta} onCerrar={() => setPaleta(false)} />
      <AvisoActualizacion />
    </div>
  );
}

function SelectorSistema({ colapsada }: { colapsada: boolean }) {
  const { sistemas, sistema, cambiarSistema } = useSesion();
  const navigate = useNavigate();
  if (!sistema) return null;

  return (
    <div className="px-3">
      <Menu
        ancho={264}
        disparador={(abierto) => (
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border border-borde bg-superficie p-1.5 text-left shadow-sm transition-colors hover:border-borde-fuerte",
              abierto && "border-borde-fuerte",
            )}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
              style={{ background: sistema.color_marca }}
            >
              {sistema.nombre.slice(0, 2).toUpperCase()}
            </span>
            {!colapsada && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight">{sistema.nombre}</span>
                  <span className="block truncate text-[11px] text-texto-3">
                    {sistemas.length > 1 ? `${sistemas.length} sistemas` : "Sistema hospitalario"}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-texto-3" />
              </>
            )}
          </button>
        )}
      >
        {(cerrar) => (
          <>
            <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-texto-3 uppercase">
              Sistemas hospitalarios
            </div>
            <div className="max-h-72 overflow-y-auto">
              {sistemas.map((s) => (
                <ItemMenu
                  key={s.id}
                  activo={s.id === sistema.id}
                  onClick={() => {
                    cambiarSistema(s.id);
                    cerrar();
                    navigate("/");
                  }}
                  icono={<span className="size-2.5 rounded-full" style={{ background: s.color_marca }} />}
                  derecha={s.id === sistema.id ? <Check className="size-4 text-marca" /> : null}
                >
                  {s.nombre}
                </ItemMenu>
              ))}
            </div>
          </>
        )}
      </Menu>
    </div>
  );
}

function BarraSuperior({ onBuscar }: { onBuscar: () => void }) {
  const { perfil, cerrarSesion } = useSesion();
  const navigate = useNavigate();
  const [tema, setTema] = useState<Tema>(temaGuardado);

  const cambiarTema = (t: Tema) => {
    setTema(t);
    aplicarTema(t);
  };

  return (
    <header className="no-imprimir relative isolate flex h-14 shrink-0 items-center gap-3 border-b border-borde px-6 lg:px-8">
      {/* El desenfoque va en una capa hermana: si el header mismo tuviera backdrop-filter,
          WebView2 deja restos del menú (que desborda el header) al cerrarse. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-superficie/80 backdrop-blur-md" />
      <button
        onClick={onBuscar}
        className="flex h-9 w-full max-w-sm items-center gap-2.5 rounded-[10px] border border-borde bg-superficie-2 px-3 text-sm text-texto-3 transition-colors hover:border-borde-fuerte"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar pacientes, módulos…</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>
      <div className="flex-1" />
      <Menu
        alinear="derecha"
        ancho={248}
        disparador={() => (
          <button className="flex items-center gap-2.5 rounded-full p-0.5 pr-3 transition-colors hover:bg-superficie-2">
            <Avatar nombre={perfil?.nombre_completo || perfil?.email} tamano={30} />
            <span className="hidden max-w-40 truncate text-sm font-medium md:block">
              {perfil?.nombre_completo || perfil?.email}
            </span>
          </button>
        )}
      >
        {(cerrar) => (
          <>
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-semibold">{perfil?.nombre_completo}</p>
              <p className="truncate text-xs text-texto-3">{perfil?.email}</p>
            </div>
            <SeparadorMenu />
            <ItemMenu
              icono={<UserRound />}
              onClick={() => {
                cerrar();
                navigate("/perfil");
              }}
            >
              Mi perfil
            </ItemMenu>
            <div className="flex items-center gap-1 px-2.5 py-1.5">
              <span className="flex-1 text-sm text-texto-2">Tema</span>
              {(
                [
                  ["claro", Sun],
                  ["oscuro", Moon],
                  ["sistema", Monitor],
                ] as const
              ).map(([t, Icono]) => (
                <button
                  key={t}
                  onClick={() => cambiarTema(t)}
                  title={t}
                  className={cn(
                    "grid size-7 place-items-center rounded-md transition-colors",
                    tema === t ? "bg-superficie-2 text-texto" : "text-texto-3 hover:text-texto",
                  )}
                >
                  <Icono className="size-4" />
                </button>
              ))}
            </div>
            <SeparadorMenu />
            <ItemMenu icono={<LogOut />} peligro onClick={() => void cerrarSesion()}>
              Cerrar sesión
            </ItemMenu>
          </>
        )}
      </Menu>
    </header>
  );
}
