import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeft, CalendarDays, Droplet, FileText, Pencil, Phone, Receipt, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Boton } from "@/components/ui/boton";
import { Segmentado } from "@/components/ui/campos";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { Avatar, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, ESTADO_CITA, SELECT_CITA, type CitaConRelaciones } from "@/lib/consultas";
import { puede, puedeEscribir } from "@/lib/permisos";
import { datos, supabase } from "@/lib/supabase";
import { edad, fecha, fechaHora, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";
import { FormPaciente } from "./FormPaciente";
import { HistorialClinico } from "./HistorialClinico";

type Pestana = "historial" | "citas" | "cobros" | "datos";

export default function PacienteDetalle() {
  const { id = "" } = useParams();
  const { sistema, sistemaId, roles } = useSistema();
  const verHistorial = puedeEscribir.verHistorial(roles);
  const verCobros = puede(roles, "caja");
  const [pestana, setPestana] = useState<Pestana>(verHistorial ? "historial" : "citas");
  const [editar, setEditar] = useState(false);

  const paciente = useQuery({
    queryKey: claves.paciente(sistemaId, id),
    queryFn: async () =>
      datos(
        await supabase
          .from("pacientes")
          .select("*, aseguradora:aseguradoras!pacientes_sistema_id_aseguradora_id_fkey(nombre)")
          .eq("id", id)
          .eq("sistema_id", sistemaId)
          .single(),
      ),
  });

  const citas = useQuery({
    queryKey: ["citas-paciente", sistemaId, id],
    enabled: pestana === "citas",
    queryFn: async () =>
      datos(await supabase.from("citas").select(SELECT_CITA).eq("paciente_id", id).order("inicio", { ascending: false }).limit(50)) as unknown as CitaConRelaciones[],
  });

  const cobros = useQuery({
    queryKey: ["cobros-paciente", sistemaId, id],
    enabled: pestana === "cobros",
    queryFn: async () =>
      datos(
        await supabase
          .from("cobros")
          .select("id, numero, total, metodo, creado_en, anulacion:anulaciones_cobro(id)")
          .eq("paciente_id", id)
          .order("creado_en", { ascending: false })
          .limit(50),
      ),
  });

  if (paciente.isLoading)
    return (
      <div className="space-y-4">
        <Esqueleto className="h-5 w-24" />
        <Esqueleto className="h-36 rounded-2xl" />
        <Esqueleto className="h-80 rounded-2xl" />
      </div>
    );
  if (!paciente.data) return <Vacio icono={<FileText />} titulo="Paciente no encontrado" />;

  const p = paciente.data;
  const nombre = `${p.nombres} ${p.apellidos}`;
  const opciones = [
    ...(verHistorial ? [{ valor: "historial" as const, etiqueta: "Historia clínica" }] : []),
    { valor: "citas" as const, etiqueta: "Citas" },
    ...(verCobros ? [{ valor: "cobros" as const, etiqueta: "Cobros" }] : []),
    { valor: "datos" as const, etiqueta: "Datos" },
  ];

  return (
    <>
      <Link to="/pacientes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-texto-2 transition-colors hover:text-texto">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>

      <Tarjeta className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-marca-suave to-transparent" />
        <div className="relative flex flex-wrap items-start gap-5">
          <Avatar nombre={nombre} tamano={64} className="ring-4 ring-superficie" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{nombre}</h1>
              <Insignia tono="marca">{p.expediente}</Insignia>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-texto-2">
              {edad(p.fecha_nacimiento) !== null && (
                <span>
                  {edad(p.fecha_nacimiento)} años · {p.sexo === "F" ? "Femenino" : p.sexo === "M" ? "Masculino" : "—"}
                </span>
              )}
              {p.documento && <span className="tabular">{p.documento}</span>}
              {p.telefono && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {p.telefono}
                </span>
              )}
              {p.aseguradora && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> {p.aseguradora.nombre}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.tipo_sangre && (
                <Insignia tono="peligro">
                  <Droplet className="size-3" /> {p.tipo_sangre}
                </Insignia>
              )}
              {p.alergias && (
                <Insignia tono="aviso">
                  <AlertTriangle className="size-3" /> Alergias: {p.alergias}
                </Insignia>
              )}
            </div>
          </div>
          {puedeEscribir.pacientes(roles) && (
            <Boton variante="secundario" icono={<Pencil className="size-3.5" />} onClick={() => setEditar(true)}>
              Editar
            </Boton>
          )}
        </div>
      </Tarjeta>

      <div className="mt-6 mb-4">
        <Segmentado id="paciente" opciones={opciones} valor={pestana} onChange={setPestana} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          {pestana === "historial" && <HistorialClinico pacienteId={id} />}

          {pestana === "citas" && (
            <Tarjeta className="overflow-hidden">
              {citas.isLoading ? (
                <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10" />)}</div>
              ) : (citas.data?.length ?? 0) === 0 ? (
                <Vacio icono={<CalendarDays />} titulo="Sin citas registradas" />
              ) : (
                <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
                  {citas.data!.map((c) => (
                    <motion.li key={c.id} variants={itemEscalonado} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                      <span className="w-44 text-texto-2 tabular">{fechaHora(c.inicio)}</span>
                      <span className="flex-1 truncate">{c.servicio?.nombre ?? c.motivo ?? "Consulta"}</span>
                      <span className="w-48 truncate text-texto-2">{c.medico?.nombre_completo}</span>
                      <Insignia tono={ESTADO_CITA[c.estado].tono}>{ESTADO_CITA[c.estado].etiqueta}</Insignia>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </Tarjeta>
          )}

          {pestana === "cobros" && (
            <Tarjeta className="overflow-hidden">
              {cobros.isLoading ? (
                <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10" />)}</div>
              ) : (cobros.data?.length ?? 0) === 0 ? (
                <Vacio icono={<Receipt />} titulo="Sin cobros registrados" />
              ) : (
                <ul className="divide-y divide-borde">
                  {cobros.data!.map((c) => (
                    <li key={c.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                      <span className="w-32 font-medium tabular">{c.numero}</span>
                      <span className="flex-1 text-texto-2">{fechaHora(c.creado_en)}</span>
                      <span className="capitalize text-texto-2">{c.metodo}</span>
                      {c.anulacion && c.anulacion.length > 0 && <Insignia tono="peligro">Anulado</Insignia>}
                      <span className="w-32 text-right font-medium tabular">{moneda(c.total, sistema.moneda)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {pestana === "datos" && (
            <Tarjeta className="grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Fecha de nacimiento", fecha(p.fecha_nacimiento)],
                  ["Correo", p.email],
                  ["Dirección", p.direccion],
                  ["Contacto de emergencia", [p.contacto_emergencia_nombre, p.contacto_emergencia_telefono].filter(Boolean).join(" · ")],
                  ["Número de afiliado", p.numero_afiliado],
                  ["Condiciones crónicas", p.condiciones_cronicas],
                  ["Notas", p.notas],
                  ["Registrado", fechaHora(p.creado_en)],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-medium text-texto-3">{k}</dt>
                  <dd className="mt-1 text-sm whitespace-pre-line">{v || "—"}</dd>
                </div>
              ))}
            </Tarjeta>
          )}
        </motion.div>
      </AnimatePresence>

      <FormPaciente abierto={editar} onCerrar={() => setEditar(false)} paciente={p} />
    </>
  );
}
