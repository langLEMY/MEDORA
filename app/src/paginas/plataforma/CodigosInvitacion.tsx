import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, Copy, ShieldCheck, Ticket, TicketPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Entrada, Segmentado, Selector } from "@/components/ui/campos";
import { Modal } from "@/components/ui/modal";
import { contenedorEscalonado, itemEscalonado } from "@/components/ui/movimiento";
import { FilasEsqueleto, Insignia, Tarjeta, Vacio, type Tono } from "@/components/ui/superficies";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { datos, mensajeError, supabase, type Rol } from "@/lib/supabase";
import { cn, fecha, fechaHora } from "@/lib/utils";
import { SelectorRoles } from "../Personal";

interface Codigo {
  id: string;
  pista: string;
  descripcion: string | null;
  roles: Rol[];
  otorga_superadmin: boolean;
  usos: number;
  usos_maximos: number;
  expira_en: string;
  revocado_en: string | null;
  creado_en: string;
  sistema: { nombre: string } | null;
  autor: { nombre_completo: string } | null;
}

function estado(c: Codigo): { etiqueta: string; tono: Tono; vigente: boolean } {
  if (c.revocado_en) return { etiqueta: "Revocado", tono: "peligro", vigente: false };
  if (c.usos >= c.usos_maximos) return { etiqueta: "Usado", tono: "neutro", vigente: false };
  if (new Date(c.expira_en) <= new Date()) return { etiqueta: "Vencido", tono: "aviso", vigente: false };
  return { etiqueta: "Vigente", tono: "exito", vigente: true };
}

const CLAVE = ["codigos-invitacion"];

/**
 * Códigos para que alguien cree su propia cuenta desde el login ("Tengo un código").
 * Solo se guarda el hash: el código se ve una única vez, al generarlo.
 */
export function CodigosInvitacion() {
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);
  const [generado, setGenerado] = useState<string | null>(null);

  const q = useQuery({
    queryKey: CLAVE,
    queryFn: async () =>
      datos(
        await supabase
          .from("codigos_invitacion")
          .select(
            "id, pista, descripcion, roles, otorga_superadmin, usos, usos_maximos, expira_en, revocado_en, creado_en, sistema:sistemas(nombre), autor:perfiles!codigos_invitacion_creado_por_fkey(nombre_completo)",
          )
          .order("creado_en", { ascending: false }),
      ) as unknown as Codigo[],
  });

  const revocar = useMutation({
    mutationFn: async (id: string) => datos(await supabase.rpc("revocar_codigo_invitacion", { p_id: id })),
    onSuccess: () => {
      toast.success("Código revocado");
      void qc.invalidateQueries({ queryKey: CLAVE });
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-texto-2">
          La persona elige <span className="font-medium text-texto">"Crear cuenta"</span> en el inicio de sesión y escribe el código.
        </p>
        <Boton icono={<TicketPlus className="size-4" />} onClick={() => setNuevo(true)}>
          Generar código
        </Boton>
      </div>

      <Tarjeta className="overflow-hidden">
        {q.isLoading ? (
          <FilasEsqueleto />
        ) : (q.data?.length ?? 0) === 0 ? (
          <Vacio icono={<Ticket />} titulo="Aún no hay códigos" descripcion="Genera uno para invitar personal a un sistema o a otro superadmin." />
        ) : (
          <motion.ul variants={contenedorEscalonado} initial="inicial" animate="visible" className="divide-y divide-borde">
            {q.data!.map((c) => {
              const e = estado(c);
              return (
                <motion.li key={c.id} variants={itemEscalonado} className={cn("flex items-center gap-4 px-5 py-3.5", !e.vigente && "opacity-60")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-marca-suave text-marca">
                    {c.otorga_superadmin ? <ShieldCheck className="size-4" /> : <Ticket className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-texto-3">INV-····-····-{c.pista}</span>
                      {c.descripcion && <span className="truncate font-medium">{c.descripcion}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {c.otorga_superadmin && <Insignia tono="marca">Superadmin</Insignia>}
                      {c.sistema && <Insignia tono="info">{c.sistema.nombre}</Insignia>}
                      {c.roles.map((r) => (
                        <Insignia key={r}>{ETIQUETA_ROL[r]}</Insignia>
                      ))}
                    </div>
                  </div>
                  <span className="w-20 text-right text-xs text-texto-2 tabular">
                    {c.usos}/{c.usos_maximos} usos
                  </span>
                  <span className="w-32 text-right text-xs text-texto-3" title={fechaHora(c.expira_en)}>
                    {e.vigente ? `Vence ${fecha(c.expira_en)}` : `Creado ${fecha(c.creado_en)}`}
                  </span>
                  <span className="w-20">
                    <Insignia tono={e.tono} punto>
                      {e.etiqueta}
                    </Insignia>
                  </span>
                  <span className="w-9">
                    {e.vigente && (
                      <button
                        title="Revocar"
                        onClick={() => revocar.mutate(c.id)}
                        className="grid size-8 place-items-center rounded-lg text-texto-3 transition-colors hover:bg-superficie-2 hover:text-peligro"
                      >
                        <Ban className="size-4" />
                      </button>
                    )}
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </Tarjeta>

      <GenerarCodigo
        abierto={nuevo}
        onCerrar={() => setNuevo(false)}
        onGenerado={(codigo) => {
          void qc.invalidateQueries({ queryKey: CLAVE });
          setGenerado(codigo);
        }}
      />
      <CodigoGenerado codigo={generado} onCerrar={() => setGenerado(null)} />
    </>
  );
}

function GenerarCodigo({ abierto, onCerrar, onGenerado }: { abierto: boolean; onCerrar: () => void; onGenerado: (c: string) => void }) {
  const [tipo, setTipo] = useState<"sistema" | "superadmin">("sistema");
  const [sistema, setSistema] = useState("");
  const [roles, setRoles] = useState<Rol[]>([]);
  const [usos, setUsos] = useState("1");
  const [dias, setDias] = useState("7");
  const [descripcion, setDescripcion] = useState("");

  const sistemas = useQuery({
    queryKey: ["plataforma-lista-sistemas"],
    enabled: abierto,
    queryFn: async () => datos(await supabase.from("sistemas").select("id, nombre").eq("activo", true).order("nombre")) ?? [],
  });

  useEffect(() => {
    if (!abierto) return;
    setTipo("sistema");
    setRoles([]);
    setUsos("1");
    setDias("7");
    setDescripcion("");
  }, [abierto]);

  useEffect(() => {
    if (!sistema && sistemas.data?.length) setSistema(sistemas.data[0].id);
  }, [sistemas.data, sistema]);

  const m = useMutation({
    mutationFn: async () =>
      datos(
        await supabase.rpc("generar_codigo_invitacion", {
          p_descripcion: descripcion,
          p_sistema: tipo === "sistema" ? sistema : (null as unknown as string),
          p_roles: tipo === "sistema" ? roles : [],
          p_superadmin: tipo === "superadmin",
          p_usos: Number(usos) || 1,
          p_dias: Number(dias) || 7,
        }),
      ) as string,
    onSuccess: (codigo) => {
      onCerrar();
      onGenerado(codigo);
    },
    onError: (e) => toast.error(mensajeError(e)),
  });

  const valido = tipo === "superadmin" || (!!sistema && roles.length > 0);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Generar código de invitación"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton cargando={m.isPending} disabled={!valido} onClick={() => m.mutate()}>
            Generar
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Segmentado
          id="tipo-codigo"
          valor={tipo}
          onChange={setTipo}
          opciones={[
            { valor: "sistema", etiqueta: "Acceso a un sistema" },
            { valor: "superadmin", etiqueta: "Superadministración" },
          ]}
        />
        <AnimatePresence mode="wait" initial={false}>
          {tipo === "sistema" ? (
            <motion.div key="s" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="space-y-4">
              <Selector etiqueta="Sistema hospitalario" value={sistema} onChange={(e) => setSistema(e.target.value)}>
                {sistemas.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Selector>
              <SelectorRoles valor={roles} onChange={setRoles} />
            </motion.div>
          ) : (
            <motion.p
              key="a"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="rounded-xl bg-[color-mix(in_oklab,var(--aviso)_10%,var(--superficie))] px-4 py-3 text-sm text-aviso"
            >
              Quien use este código tendrá control total de la plataforma: sistemas, usuarios y códigos. Úsalo con un solo uso y poca vigencia.
            </motion.p>
          )}
        </AnimatePresence>
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Usos máximos" type="number" min={1} max={500} value={usos} onChange={(e) => setUsos(e.target.value)} ayuda="Cuántas cuentas se pueden crear con él." />
          <Selector etiqueta="Vigencia" value={dias} onChange={(e) => setDias(e.target.value)}>
            {[
              ["1", "1 día"],
              ["3", "3 días"],
              ["7", "7 días"],
              ["15", "15 días"],
              ["30", "30 días"],
              ["90", "90 días"],
            ].map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </Selector>
        </div>
        <AreaTexto etiqueta="Descripción (para identificarlo)" className="min-h-16" placeholder="Ej. Médicos nuevos del Hospital Central" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
    </Modal>
  );
}

function CodigoGenerado({ codigo, onCerrar }: { codigo: string | null; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [ultimo, setUltimo] = useState(codigo);
  useEffect(() => {
    if (codigo) setUltimo(codigo);
  }, [codigo]);

  const copiar = async () => {
    await navigator.clipboard.writeText(codigo ?? ultimo ?? "");
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  };

  return (
    <Modal
      abierto={!!codigo}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Código generado"
      descripcion="Cópialo ahora: por seguridad no se volverá a mostrar."
      pie={<Boton onClick={onCerrar}>Listo</Boton>}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.2, delay: 0.05 }}
        className="rounded-2xl border border-dashed border-marca bg-marca-suave px-4 py-6 text-center"
      >
        <p className="font-mono text-2xl font-semibold tracking-[0.12em] text-marca-texto select-all">{codigo ?? ultimo}</p>
      </motion.div>
      <Boton variante="secundario" className="mt-4 w-full justify-center" onClick={copiar}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copiado ? "ok" : "c"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="inline-flex items-center gap-2"
          >
            {copiado ? <Check className="size-4 text-exito" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar código"}
          </motion.span>
        </AnimatePresence>
      </Boton>
    </Modal>
  );
}
