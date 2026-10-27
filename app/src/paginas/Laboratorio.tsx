import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SelectorPaciente, type PacienteBreve } from "@/components/SelectorPaciente";
import { Boton } from "@/components/ui/boton";
import { Entrada } from "@/components/ui/campos";
import { Segmentado } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { EncabezadoPagina, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui/superficies";
import { datos, mensajeError, supabase } from "@/lib/supabase";
import { fechaHora, moneda } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

interface Orden {
  id: string;
  numero: string;
  estado: string;
  creado_en: string;
  medico_nombre: string | null;
  paciente_id: string;
}
interface Prueba {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  ref_min: number | null;
  ref_max: number | null;
  ref_texto: string | null;
  precio: number;
  activo: boolean;
}
interface Item {
  id: string;
  prueba_nombre: string;
  unidad: string | null;
  ref_texto: string | null;
  ref_min: number | null;
  ref_max: number | null;
  resultado_valor: number | null;
  resultado_texto: string | null;
  fuera_rango: boolean | null;
  bioanalista: string | null;
  firmado_en: string | null;
}

const ESTADO: Record<string, { etiqueta: string; tono: "info" | "aviso" | "exito" | "peligro" }> = {
  pendiente: { etiqueta: "Pendiente", tono: "aviso" },
  procesando: { etiqueta: "Procesando", tono: "info" },
  completada: { etiqueta: "Completada", tono: "exito" },
  anulada: { etiqueta: "Anulada", tono: "peligro" },
};

export default function Laboratorio() {
  const [vista, setVista] = useState<"ordenes" | "catalogo">("ordenes");
  return (
    <>
      <EncabezadoPagina
        titulo="Laboratorio"
        acciones={
          <Segmentado
            id="lab-vista"
            valor={vista}
            onChange={setVista}
            opciones={[
              { valor: "ordenes", etiqueta: "Órdenes" },
              { valor: "catalogo", etiqueta: "Catálogo" },
            ]}
          />
        }
      />
      {vista === "ordenes" ? <Ordenes /> : <Catalogo />}
    </>
  );
}

// ---------------------------------------------------------------------------
function Ordenes() {
  const { sistemaId } = useSistema();
  const [nueva, setNueva] = useState(false);
  const [resultados, setResultados] = useState<Orden | null>(null);

  const q = useQuery({
    queryKey: ["lab-ordenes", sistemaId],
    queryFn: async () =>
      (datos(await supabase.from("laboratorio_ordenes").select("id, numero, estado, creado_en, medico_nombre, paciente_id").eq("sistema_id", sistemaId).order("creado_en", { ascending: false }).limit(100)) ?? []) as Orden[],
  });
  const ids = [...new Set((q.data ?? []).map((o) => o.paciente_id))];
  const pacientes = useQuery({
    queryKey: ["lab-ordenes-pac", sistemaId, ids.length],
    enabled: ids.length > 0,
    queryFn: async () => {
      const d = (datos(await supabase.from("pacientes").select("id, nombres, apellidos").in("id", ids)) ?? []) as { id: string; nombres: string; apellidos: string }[];
      return new Map(d.map((p) => [p.id, `${p.nombres} ${p.apellidos}`.trim()]));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Boton icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>
          Nueva orden
        </Boton>
      </div>
      <Tarjeta className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-12 rounded-xl" />)}</div>
        ) : !q.data?.length ? (
          <Vacio icono={<FlaskConical />} titulo="Sin órdenes" descripcion="Crea la primera orden de laboratorio." />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data.map((o) => (
              <li key={o.id}>
                <button onClick={() => setResultados(o)} className="flex w-full items-center gap-4 px-5 py-3 text-left text-sm hover:bg-superficie-2">
                  <span className="font-mono text-texto-2">{o.numero}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{pacientes.data?.get(o.paciente_id) ?? "…"}</span>
                  <span className="hidden text-xs text-texto-3 sm:block">{fechaHora(o.creado_en)}</span>
                  <Insignia tono={ESTADO[o.estado]?.tono ?? "info"}>{ESTADO[o.estado]?.etiqueta ?? o.estado}</Insignia>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <NuevaOrden abierto={nueva} onCerrar={() => setNueva(false)} />
      <Resultados orden={resultados} onCerrar={() => setResultados(null)} />
    </div>
  );
}

function NuevaOrden({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [paciente, setPaciente] = useState<PacienteBreve | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [medico, setMedico] = useState("");
  const [notas, setNotas] = useState("");

  const pruebas = useQuery({
    queryKey: ["lab-pruebas-activas", sistemaId],
    enabled: abierto,
    queryFn: async () => (datos(await supabase.from("laboratorio_pruebas").select("id, nombre, categoria, unidad").eq("sistema_id", sistemaId).eq("activo", true).order("nombre")) ?? []) as Prueba[],
  });

  const crear = useMutation({
    mutationFn: async () =>
      datos(await supabase.rpc("crear_orden_lab", { p_sistema: sistemaId, p_paciente: paciente!.id, p_pruebas: [...sel], p_medico: medico || undefined, p_notas: notas || undefined })),
    onSuccess: () => {
      toast.success("Orden creada");
      setPaciente(null);
      setSel(new Set());
      setMedico("");
      setNotas("");
      void qc.invalidateQueries({ queryKey: ["lab-ordenes", sistemaId] });
      onCerrar();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const alternar = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva orden de laboratorio"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton cargando={crear.isPending} disabled={!paciente || sel.size === 0} onClick={() => crear.mutate()}>Crear orden</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectorPaciente valor={paciente} onChange={setPaciente} />
        <Entrada etiqueta="Médico que solicita (opcional)" value={medico} onChange={(e) => setMedico(e.target.value)} />
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-texto-2">Pruebas</p>
          {!pruebas.data?.length ? (
            <p className="rounded-xl bg-superficie-2 px-3 py-4 text-center text-xs text-texto-3">No hay pruebas en el catálogo. Agrégalas en la pestaña «Catálogo».</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-borde p-2">
              {pruebas.data.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-superficie-2">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} className="size-4 accent-[var(--marca)]" />
                  <span className="flex-1">{p.nombre}</span>
                  {p.categoria && <span className="text-xs text-texto-3">{p.categoria}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        <Entrada etiqueta="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
    </Modal>
  );
}

function Resultados({ orden, onCerrar }: { orden: Orden | null; onCerrar: () => void }) {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const items = useQuery({
    queryKey: ["lab-items", orden?.id],
    enabled: !!orden,
    queryFn: async () => (datos(await supabase.from("laboratorio_orden_items").select("*").eq("orden_id", orden!.id)) ?? []) as Item[],
  });

  const refrescar = () => {
    void items.refetch();
    void qc.invalidateQueries({ queryKey: ["lab-ordenes", sistemaId] });
  };

  return (
    <Modal abierto={!!orden} onCerrar={onCerrar} titulo={`Orden ${orden?.numero ?? ""}`} ancho="lg">
      {items.isLoading ? (
        <Esqueleto className="h-40 rounded-xl" />
      ) : (
        <ul className="space-y-3">
          {(items.data ?? []).map((it) => (
            <li key={it.id} className="rounded-xl border border-borde p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{it.prueba_nombre}</span>
                {it.firmado_en ? (
                  <Insignia tono={it.fuera_rango ? "peligro" : "exito"}>{it.fuera_rango ? "Fuera de rango" : "Normal"}</Insignia>
                ) : (
                  <Insignia tono="aviso">Pendiente</Insignia>
                )}
              </div>
              <p className="mt-0.5 text-xs text-texto-3">
                Referencia: {it.ref_texto ?? (it.ref_min != null || it.ref_max != null ? `${it.ref_min ?? ""}–${it.ref_max ?? ""} ${it.unidad ?? ""}` : "—")}
              </p>
              {it.firmado_en ? (
                <p className="mt-1 text-sm">
                  <b>{it.resultado_valor ?? it.resultado_texto ?? "—"}</b> {it.unidad} · firmado por {it.bioanalista}
                </p>
              ) : (
                <FormResultado item={it} onListo={refrescar} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function FormResultado({ item, onListo }: { item: Item; onListo: () => void }) {
  const [valor, setValor] = useState("");
  const [texto, setTexto] = useState("");
  const [bio, setBio] = useState("");
  const [exe, setExe] = useState("");

  const firmar = useMutation({
    mutationFn: async () =>
      datos(await supabase.rpc("registrar_resultado_lab", { p_item: item.id, p_valor: valor ? Number(valor) : (null as unknown as number), p_texto: texto || (null as unknown as string), p_bioanalista: bio, p_exequatur: exe || undefined })),
    onSuccess: () => {
      toast.success("Resultado firmado");
      onListo();
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <Entrada etiqueta="Resultado (número)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      <Entrada etiqueta="Resultado (texto, opcional)" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Entrada etiqueta="Bioanalista que firma" value={bio} onChange={(e) => setBio(e.target.value)} />
      <Entrada etiqueta="Exequátur (opcional)" value={exe} onChange={(e) => setExe(e.target.value)} />
      <div className="sm:col-span-2 flex justify-end">
        <Boton tamano="sm" cargando={firmar.isPending} disabled={bio.trim().length < 3 || (!valor && !texto)} onClick={() => firmar.mutate()}>
          Firmar resultado
        </Boton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Catalogo() {
  const { sistemaId } = useSistema();
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState({ nombre: "", codigo: "", categoria: "", unidad: "", ref_min: "", ref_max: "", ref_texto: "", precio: "" });

  const q = useQuery({
    queryKey: ["lab-pruebas", sistemaId],
    queryFn: async () => (datos(await supabase.from("laboratorio_pruebas").select("*").eq("sistema_id", sistemaId).order("nombre")) ?? []) as Prueba[],
  });

  const crear = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.from("laboratorio_pruebas").insert({
          sistema_id: sistemaId,
          nombre: f.nombre.trim(),
          codigo: f.codigo || null,
          categoria: f.categoria || null,
          unidad: f.unidad || null,
          ref_min: f.ref_min ? Number(f.ref_min) : null,
          ref_max: f.ref_max ? Number(f.ref_max) : null,
          ref_texto: f.ref_texto || null,
          precio: Number(f.precio) || 0,
        }),
      ),
    onSuccess: () => {
      toast.success("Prueba agregada");
      setF({ nombre: "", codigo: "", categoria: "", unidad: "", ref_min: "", ref_max: "", ref_texto: "", precio: "" });
      setNueva(false);
      void qc.invalidateQueries({ queryKey: ["lab-pruebas", sistemaId] });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Boton icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>Nueva prueba</Boton>
      </div>
      <Tarjeta className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-10 rounded-xl" />)}</div>
        ) : !q.data?.length ? (
          <Vacio icono={<FlaskConical />} titulo="Sin pruebas" descripcion="Agrega las pruebas que ofrece el laboratorio." />
        ) : (
          <ul className="divide-y divide-borde">
            {q.data.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="block truncate text-xs text-texto-3">
                    {[p.categoria, p.unidad, p.ref_texto ?? (p.ref_min != null || p.ref_max != null ? `${p.ref_min ?? ""}–${p.ref_max ?? ""}` : null)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="tabular text-texto-2">{moneda(p.precio)}</span>
                {!p.activo && <Insignia tono="peligro">Inactiva</Insignia>}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <Modal
        abierto={nueva}
        onCerrar={() => setNueva(false)}
        titulo="Nueva prueba"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setNueva(false)}>Cancelar</Boton>
            <Boton cargando={crear.isPending} disabled={f.nombre.trim().length < 2} onClick={() => crear.mutate()}>Guardar</Boton>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Entrada etiqueta="Nombre" contenedor="sm:col-span-2" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <Entrada etiqueta="Código" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
          <Entrada etiqueta="Categoría" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} />
          <Entrada etiqueta="Unidad" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} />
          <Entrada etiqueta="Precio (RD$)" inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} />
          <Entrada etiqueta="Ref. mínima" inputMode="decimal" value={f.ref_min} onChange={(e) => setF({ ...f, ref_min: e.target.value })} />
          <Entrada etiqueta="Ref. máxima" inputMode="decimal" value={f.ref_max} onChange={(e) => setF({ ...f, ref_max: e.target.value })} />
          <Entrada etiqueta="Rango de referencia (texto)" contenedor="sm:col-span-2" value={f.ref_texto} onChange={(e) => setF({ ...f, ref_texto: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
