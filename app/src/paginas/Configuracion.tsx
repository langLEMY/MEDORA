import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Building2, Check, MapPin, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { Entrada, Interruptor, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { claves, useSedes } from "@/lib/consultas";
import { datos, mensajeError, supabase, type Fila } from "@/lib/supabase";
import { aplicarColorMarca } from "@/lib/tema";
import { cn } from "@/lib/utils";
import { useSesion, useSistema } from "@/sesion/SesionProvider";

export const COLORES_MARCA = ["#0F766E", "#0E7490", "#1D4ED8", "#4F46E5", "#7C3AED", "#BE185D", "#B91C1C", "#C2410C", "#15803D", "#334155"];

export default function Configuracion() {
  const { sistemaId } = useSistema();
  const { recargar } = useSesion();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["sistema", sistemaId],
    queryFn: async () => datos(await supabase.from("sistemas").select("*").eq("id", sistemaId).single()),
  });
  const [f, setF] = useState<Partial<Fila<"sistemas">>>({});

  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);

  // Vista previa en vivo: toda la interfaz se tiñe mientras eliges el color.
  useEffect(() => {
    if (f.color_marca) aplicarColorMarca(f.color_marca);
    return () => aplicarColorMarca(q.data?.color_marca);
  }, [f.color_marca, q.data?.color_marca]);

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("sistemas")
        .update({
          nombre: f.nombre,
          razon_social: f.razon_social || null,
          rnc: f.rnc || null,
          telefono: f.telefono || null,
          email: f.email || null,
          direccion: f.direccion || null,
          color_marca: f.color_marca,
          moneda: f.moneda,
          zona_horaria: f.zona_horaria,
        })
        .eq("id", sistemaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Configuración guardada");
      await qc.invalidateQueries({ queryKey: ["sistema", sistemaId] });
      await recargar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const campo = (k: keyof Fila<"sistemas">) => ({
    value: (f[k] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value })),
  });

  return (
    <>
      <EncabezadoPagina titulo="Sistema y sedes" descripcion="Datos del sistema hospitalario, identidad visual y sus sedes." />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Tarjeta className="p-6">
          {q.isLoading ? (
            <Esqueleto className="h-80" />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Entrada etiqueta="Nombre" contenedor="col-span-2" {...campo("nombre")} />
                <Entrada etiqueta="Razón social" {...campo("razon_social")} />
                <Entrada etiqueta="RNC" {...campo("rnc")} />
                <Entrada etiqueta="Teléfono" {...campo("telefono")} />
                <Entrada etiqueta="Correo" type="email" {...campo("email")} />
                <Entrada etiqueta="Dirección" contenedor="col-span-2" {...campo("direccion")} />
                <Selector etiqueta="Moneda" {...campo("moneda")}>
                  <option value="DOP">Peso dominicano (DOP)</option>
                  <option value="USD">Dólar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="MXN">Peso mexicano (MXN)</option>
                  <option value="COP">Peso colombiano (COP)</option>
                </Selector>
                <Selector etiqueta="Zona horaria" {...campo("zona_horaria")}>
                  {["America/Santo_Domingo", "America/Puerto_Rico", "America/New_York", "America/Mexico_City", "America/Bogota", "America/Caracas", "Europe/Madrid"].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </Selector>
              </div>

              <div>
                <p className="mb-2 text-[13px] font-medium text-texto-2">Color de marca</p>
                <div className="flex flex-wrap gap-2">
                  {COLORES_MARCA.map((c) => {
                    const activo = f.color_marca?.toLowerCase() === c.toLowerCase();
                    return (
                      <motion.button
                        key={c}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setF((x) => ({ ...x, color_marca: c }))}
                        className={cn("grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-superficie transition-shadow", activo && "ring-2")}
                        style={{ background: c, ["--tw-ring-color" as string]: c }}
                        aria-label={c}
                      >
                        {activo && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}>
                            <Check className="size-4 text-white" />
                          </motion.span>
                        )}
                      </motion.button>
                    );
                  })}
                  <label className="relative grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-borde-fuerte text-texto-3">
                    <Plus className="size-4" />
                    <input type="color" className="absolute inset-0 opacity-0" value={f.color_marca ?? "#0F766E"} onChange={(e) => setF((x) => ({ ...x, color_marca: e.target.value.toUpperCase() }))} />
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>
                  Guardar cambios
                </Boton>
              </div>
            </div>
          )}
        </Tarjeta>

        <Sedes />
      </div>
    </>
  );
}

function Sedes() {
  const { sistemaId } = useSistema();
  const sedes = useSedes(sistemaId);
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Fila<"sedes"> | "nueva" | null>(null);
  const e = editar && editar !== "nueva" ? editar : null;
  const [f, setF] = useState({ nombre: "", codigo: "", tipo: "hospital", direccion: "", telefono: "", activo: true });

  useEffect(() => {
    if (editar)
      setF(
        e
          ? { nombre: e.nombre, codigo: e.codigo ?? "", tipo: e.tipo, direccion: e.direccion ?? "", telefono: e.telefono ?? "", activo: e.activo }
          : { nombre: "", codigo: "", tipo: "hospital", direccion: "", telefono: "", activo: true },
      );
  }, [editar, e]);

  const m = useMutation({
    mutationFn: async () => {
      const fila = { nombre: f.nombre.trim(), codigo: f.codigo || null, tipo: f.tipo, direccion: f.direccion || null, telefono: f.telefono || null, activo: f.activo };
      const r = e ? await supabase.from("sedes").update(fila).eq("id", e.id) : await supabase.from("sedes").insert({ ...fila, sistema_id: sistemaId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Sede guardada");
      void qc.invalidateQueries({ queryKey: claves.sedes(sistemaId) });
      setEditar(null);
    },
    onError: (err) => toast.error(mensajeError(err)),
  });

  return (
    <Tarjeta className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-borde px-5 py-4">
        <h2 className="text-[15px] font-semibold">Sedes</h2>
        <Boton tamano="sm" variante="secundario" icono={<Plus className="size-3.5" />} onClick={() => setEditar("nueva")}>
          Nueva sede
        </Boton>
      </div>
      {(sedes.data?.length ?? 0) === 0 ? (
        <Vacio icono={<Building2 />} titulo="Sin sedes" descripcion="Hospitales, clínicas o consultorios de este sistema." />
      ) : (
        <ul className="divide-y divide-borde">
          {sedes.data!.map((s) => (
            <li key={s.id} className={cn("group flex items-center gap-3 px-5 py-3", !s.activo && "opacity-50")}>
              <span className="grid size-9 place-items-center rounded-lg bg-marca-suave text-marca">
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.nombre}</span>
                {s.direccion && (
                  <span className="flex items-center gap-1 truncate text-xs text-texto-3">
                    <MapPin className="size-3" />
                    {s.direccion}
                  </span>
                )}
              </span>
              <Insignia className="capitalize">{s.tipo}</Insignia>
              <button onClick={() => setEditar(s)} className="grid size-8 place-items-center rounded-lg text-texto-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-superficie-2">
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        abierto={!!editar}
        onCerrar={() => setEditar(null)}
        titulo={e ? "Editar sede" : "Nueva sede"}
        pie={
          <>
            <Boton variante="secundario" onClick={() => setEditar(null)}>
              Cancelar
            </Boton>
            <Boton cargando={m.isPending} disabled={f.nombre.trim().length < 2} onClick={() => m.mutate()}>
              Guardar
            </Boton>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Nombre" contenedor="col-span-2" value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} />
          <Selector etiqueta="Tipo" value={f.tipo} onChange={(x) => setF({ ...f, tipo: x.target.value })}>
            {["hospital", "clinica", "consultorio", "laboratorio", "farmacia", "otro"].map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </Selector>
          <Entrada etiqueta="Código" value={f.codigo} onChange={(x) => setF({ ...f, codigo: x.target.value })} />
          <Entrada etiqueta="Dirección" contenedor="col-span-2" value={f.direccion} onChange={(x) => setF({ ...f, direccion: x.target.value })} />
          <Entrada etiqueta="Teléfono" value={f.telefono} onChange={(x) => setF({ ...f, telefono: x.target.value })} />
          {e && <Interruptor activo={f.activo} onChange={(v) => setF({ ...f, activo: v })} etiqueta="Activa" />}
        </div>
      </Modal>
    </Tarjeta>
  );
}
