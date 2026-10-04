import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Plus, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Boton } from "@/components/ui/boton";
import { Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, EncabezadoPagina, FilasEsqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, useAseguradoras } from "@/lib/consultas";
import { puedeEscribir } from "@/lib/permisos";
import { supabase } from "@/lib/supabase";
import { edad, fecha, patronBusqueda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { useAccionUrl } from "@/lib/accionUrl";
import { AccionesDatos, obtenerTodo, type ColumnaDatos } from "@/components/AccionesDatos";
import { IMPORTACIONES } from "@/lib/importaciones";
import { BandejaLaboratorio } from "@/components/ResultadosLaboratorio";
import { useQueryClient } from "@tanstack/react-query";
import { FormPaciente } from "./FormPaciente";

interface PacienteExport {
  expediente: string;
  nombres: string;
  apellidos: string;
  documento_tipo: string;
  documento: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  tipo_sangre: string | null;
  alergias: string | null;
  condiciones_cronicas: string | null;
  numero_afiliado: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  creado_en: string;
  aseguradora: { nombre: string } | null;
}

const COLUMNAS_PACIENTES: ColumnaDatos<PacienteExport>[] = [
  { titulo: "Expediente", valor: (p) => p.expediente },
  { titulo: "Nombres", valor: (p) => p.nombres },
  { titulo: "Apellidos", valor: (p) => p.apellidos },
  { titulo: "Cédula", valor: (p) => p.documento },
  { titulo: "Fecha de nacimiento", valor: (p) => p.fecha_nacimiento, tipo: "fecha" },
  { titulo: "Sexo", valor: (p) => p.sexo },
  { titulo: "Teléfono", valor: (p) => p.telefono },
  { titulo: "Correo", valor: (p) => p.email, soloExcel: true },
  { titulo: "Dirección", valor: (p) => p.direccion, soloExcel: true },
  { titulo: "Tipo de sangre", valor: (p) => p.tipo_sangre, soloExcel: true },
  { titulo: "Alergias", valor: (p) => p.alergias, soloExcel: true },
  { titulo: "Condiciones crónicas", valor: (p) => p.condiciones_cronicas, soloExcel: true },
  { titulo: "Aseguradora", valor: (p) => p.aseguradora?.nombre },
  { titulo: "No. afiliado", valor: (p) => p.numero_afiliado, soloExcel: true },
  { titulo: "Contacto de emergencia", valor: (p) => p.contacto_emergencia_nombre, soloExcel: true },
  { titulo: "Teléfono de emergencia", valor: (p) => p.contacto_emergencia_telefono, soloExcel: true },
  { titulo: "Registrado", valor: (p) => p.creado_en, tipo: "fechaHora", soloExcel: true },
];

const POR_PAGINA = 25;

export default function Pacientes() {
  const { sistemaId, roles, soloPropio } = useSistema();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [orden, setOrden] = useState<"alfabetico" | "recientes">("alfabetico");
  // "" = todos · "privado" = sin seguro · uuid = esa aseguradora
  const [seguro, setSeguro] = useState("");
  const [sexo, setSexo] = useState("");
  const [nuevo, setNuevo] = useState(params.get("nuevo") === "1");
  useAccionUrl({ nuevo: () => setNuevo(true) });
  const qc = useQueryClient();
  const aseguradoras = useAseguradoras(sistemaId);

  const filtrar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(0);
  };
  const hayFiltros = !!seguro || !!sexo;

  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 220);
    return () => clearTimeout(t);
  }, [texto]);

  const q = useQuery({
    queryKey: [...claves.pacientes(sistemaId), busqueda, pagina, orden, seguro, sexo],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let consulta = supabase
        .from("pacientes")
        .select("id, expediente, nombres, apellidos, documento, fecha_nacimiento, sexo, telefono, creado_en, aseguradora:aseguradoras!pacientes_sistema_id_aseguradora_id_fkey(nombre)", {
          count: "exact",
        })
        .eq("sistema_id", sistemaId)
        .is("eliminado_en", null);
      consulta =
        orden === "alfabetico"
          ? consulta.order("nombres").order("apellidos").order("id")
          : consulta.order("creado_en", { ascending: false }).order("id");
      consulta = consulta.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (busqueda.trim().length >= 2) consulta = consulta.ilike("busqueda", patronBusqueda(busqueda));
      if (seguro === "privado") consulta = consulta.is("aseguradora_id", null);
      else if (seguro) consulta = consulta.eq("aseguradora_id", seguro);
      if (sexo) consulta = consulta.eq("sexo", sexo);
      const { data, error, count } = await consulta;
      if (error) throw error;
      return { filas: data, total: count ?? 0 };
    },
  });

  const total = q.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <EncabezadoPagina
        titulo={soloPropio ? "Mis pacientes" : "Pacientes"}
        descripcion={q.data ? `${total.toLocaleString("es-DO")} pacientes registrados` : " "}
        acciones={
          <>
            <AccionesDatos
              titulo="Pacientes"
              columnas={COLUMNAS_PACIENTES}
              importaciones={puedeEscribir.pacientes(roles) ? [IMPORTACIONES.pacientes] : []}
              onImportado={() => void qc.invalidateQueries({ queryKey: claves.pacientes(sistemaId) })}
              obtener={() =>
                obtenerTodo<PacienteExport>((d, h) =>
                  supabase
                    .from("pacientes")
                    .select("expediente, nombres, apellidos, documento_tipo, documento, fecha_nacimiento, sexo, telefono, email, direccion, tipo_sangre, alergias, condiciones_cronicas, numero_afiliado, contacto_emergencia_nombre, contacto_emergencia_telefono, creado_en, aseguradora:aseguradoras!pacientes_sistema_id_aseguradora_id_fkey(nombre)")
                    .eq("sistema_id", sistemaId)
                    .is("eliminado_en", null)
                    .order("apellidos")
                    .range(d, h) as unknown as PromiseLike<{ data: PacienteExport[] | null; error: unknown }>,
                )
              }
            />
            {puedeEscribir.pacientes(roles) && (
              <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>
                Nuevo paciente
              </Boton>
            )}
          </>
        }
      />

      {puedeEscribir.verHistorial(roles) && !soloPropio && <BandejaLaboratorio />}

      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-borde p-3">
          <Entrada
            icono={<Search />}
            placeholder="Buscar por nombre, documento o expediente…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            contenedor="w-full max-w-md"
          />
          <Selector value={seguro} onChange={(e) => filtrar(setSeguro)(e.target.value)} contenedor="w-52" aria-label="Filtrar por seguro">
            <option value="">Todos los seguros</option>
            <option value="privado">Privado (sin seguro)</option>
            {aseguradoras.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
          <Selector value={sexo} onChange={(e) => filtrar(setSexo)(e.target.value)} contenedor="w-36" aria-label="Filtrar por sexo">
            <option value="">Todo sexo</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="X">Otro</option>
          </Selector>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                setSeguro("");
                setSexo("");
                setPagina(0);
              }}
              className="text-xs font-medium text-texto-3 hover:text-texto"
            >
              Quitar filtros
            </button>
          )}
          <div className="ml-auto">
            <Segmentado
              id="orden-pacientes"
              valor={orden}
              onChange={filtrar(setOrden)}
              opciones={[
                { valor: "alfabetico", etiqueta: "A–Z" },
                { valor: "recientes", etiqueta: "Recientes" },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-4 border-b border-borde bg-superficie-2/60 px-5 py-2.5 text-xs font-medium text-texto-3">
          <span>Paciente</span>
          <span>Documento</span>
          <span>Edad</span>
          <span>Seguro</span>
          <span>Registrado</span>
        </div>

        {q.isLoading ? (
          <FilasEsqueleto />
        ) : (q.data?.filas.length ?? 0) === 0 ? (
          <Vacio
            icono={<Users />}
            titulo={busqueda || hayFiltros ? "Sin coincidencias" : "Aún no hay pacientes"}
            descripcion={
              busqueda || hayFiltros ? "Prueba con otro nombre, cédula o expediente, o quita los filtros." : "Registra el primer paciente del sistema."
            }
          />
        ) : (
          <motion.div
            key={`${busqueda}-${pagina}-${orden}-${seguro}-${sexo}`}
            variants={contenedorEscalonado}
            initial="inicial"
            animate="visible"
            className={q.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}
          >
            {q.data!.filas.map((p) => (
              <motion.button
                key={p.id}
                variants={itemEscalonado}
                onClick={() => navigate(`/pacientes/${p.id}`)}
                className="grid w-full grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] items-center gap-4 border-b border-borde px-5 py-3 text-left text-sm transition-colors last:border-0 hover:bg-superficie-2/60"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar nombre={`${p.nombres} ${p.apellidos}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p.nombres} {p.apellidos}
                    </span>
                    <span className="block text-xs text-texto-3 tabular">{p.expediente}</span>
                  </span>
                </span>
                <span className="truncate text-texto-2 tabular">{p.documento ?? "—"}</span>
                <span className="text-texto-2">{edad(p.fecha_nacimiento) !== null ? `${edad(p.fecha_nacimiento)} años` : "—"}</span>
                <span>
                  {p.aseguradora ? <Insignia tono="info">{p.aseguradora.nombre}</Insignia> : <span className="text-texto-3">Privado</span>}
                </span>
                <span className="text-texto-2">{fecha(p.creado_en)}</span>
              </motion.button>
            ))}
          </motion.div>
        )}

        {total > POR_PAGINA && (
          <div className="flex items-center justify-between border-t border-borde px-5 py-3 text-sm text-texto-2">
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <div className="flex gap-1.5">
              <Boton variante="secundario" tamano="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Boton>
              <Boton variante="secundario" tamano="sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Boton>
            </div>
          </div>
        )}
      </Tarjeta>

      <FormPaciente
        abierto={nuevo}
        onCerrar={() => {
          setNuevo(false);
          if (params.has("nuevo")) setParams({}, { replace: true });
        }}
        onGuardado={(id) => navigate(`/pacientes/${id}`)}
      />
    </>
  );
}
