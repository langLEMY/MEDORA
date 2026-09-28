import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { HeartPulse } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { datos, supabase } from "@/lib/supabase";
import { cn, hora } from "@/lib/utils";
import { useSistema } from "@/sesion/SesionProvider";

/**
 * Pantalla de la sala de espera (TV). Muestra el turno que se está llamando y su
 * consultorio —nunca nombres de pacientes—, lo anuncia con un aviso y voz, y
 * cuántos esperan por especialidad. Consulta cada 3 s (pantalla_llamados), así
 * funciona también con la cuenta del quiosco, que no lee citas por RLS.
 */
interface Llamado {
  id: string;
  turno: string;
  estado: string;
  llamado_en: string;
  llamado_veces: number;
  consultorio: string | null;
  medico: string | null;
  especialidad: string | null;
}
interface Datos {
  llamados: Llamado[];
  espera: { especialidad: string; cantidad: number; siguiente: string }[];
}

/** "MG-012" → "Turno M G doce, consultorio 3" (letras separadas para que la voz no las lea como palabra). */
function frase(l: Llamado) {
  const [pref, num] = l.turno.split("-");
  const destino = l.consultorio ? `consultorio ${l.consultorio}` : l.medico ? `con ${l.medico}` : "";
  return `Turno ${pref.split("").join(" ")} ${Number(num)}${destino ? `, ${destino}` : ""}.`;
}

function aviso() {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.55);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* sin audio */
  }
}

function hablar(texto: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(texto);
  const voces = speechSynthesis.getVoices();
  u.voice = voces.find((v) => v.lang === "es-DO") ?? voces.find((v) => v.lang.startsWith("es-US") || v.lang.startsWith("es-MX")) ?? voces.find((v) => v.lang.startsWith("es")) ?? null;
  u.lang = u.voice?.lang ?? "es-ES";
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

export default function Pantalla() {
  const { sistema, sistemaId } = useSistema();
  const [ahora, setAhora] = useState(new Date());
  const navigate = useNavigate();
  const anunciados = useRef<Map<string, number> | null>(null);

  const q = useQuery({
    queryKey: ["pantalla-llamados", sistemaId],
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    queryFn: async () => datos(await supabase.rpc("pantalla_llamados", { p_sistema: sistemaId })) as unknown as Datos,
  });

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 10_000);
    // Esc vuelve a MEDORA (la cuenta del quiosco rebota a su pantalla).
    const salir = (e: KeyboardEvent) => e.key === "Escape" && navigate("/");
    window.addEventListener("keydown", salir);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", salir);
    };
  }, [navigate]);

  // Anuncia cada llamado nuevo (o cada "volver a llamar"); al abrir no repite los de antes.
  useEffect(() => {
    const llamados = q.data?.llamados;
    if (!llamados) return;
    const vistos = anunciados.current;
    const nuevos = vistos ? llamados.filter((l) => l.estado === "llamado" && (vistos.get(l.id) ?? 0) < l.llamado_veces) : [];
    anunciados.current = new Map(llamados.map((l) => [l.id, l.llamado_veces]));
    if (!nuevos.length) return;
    aviso();
    nuevos
      .slice()
      .reverse()
      .forEach((l, i) => setTimeout(() => hablar(frase(l)), 900 + i * 3500));
  }, [q.data]);

  const [actual, ...anteriores] = q.data?.llamados ?? [];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0b0d12] text-white select-none">
      <header className="flex items-center gap-4 px-12 py-7">
        {sistema.logo_url || sistema.logo_factura ? (
          <img src={(sistema.logo_url ?? sistema.logo_factura)!} alt="" className={cn("h-16 w-auto", !sistema.logo_url && "rounded-lg bg-white p-1")} />
        ) : (
          <HeartPulse className="size-14 text-marca" />
        )}
        <span className="text-4xl font-bold">{sistema.nombre}</span>
        <span className="ml-auto flex items-center gap-4 text-4xl font-semibold tabular">
          {hora(ahora.toISOString())}
        </span>
      </header>

      <div className="grid flex-1 grid-cols-[1.6fr_1fr] gap-8 px-12 pb-12">
        <section className="flex flex-col overflow-hidden rounded-[2.5rem] bg-white/[0.04] ring-1 ring-white/10">
          <p className="px-10 pt-8 text-2xl font-medium tracking-[0.3em] text-white/50">TURNO LLAMADO</p>
          <div className="flex flex-1 items-center justify-center">
            <AnimatePresence mode="wait">
              {actual ? (
                <motion.div
                  key={`${actual.id}-${actual.llamado_veces}`}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
                  className="text-center"
                >
                  <p className={cn("font-mono text-[13rem] leading-none font-black", actual.estado === "llamado" && "animate-pulse")} style={{ color: "var(--marca)" }}>
                    {actual.turno}
                  </p>
                  <p className="mt-6 text-6xl font-bold">{actual.consultorio ? `Consultorio ${actual.consultorio}` : (actual.especialidad ?? "")}</p>
                  {actual.medico && <p className="mt-4 text-4xl text-white/60">{actual.medico}</p>}
                </motion.div>
              ) : (
                <motion.p key="nada" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-4xl text-white/40">
                  Espere a ser llamado
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-8">
          <div className="rounded-[2rem] bg-white/[0.04] p-8 ring-1 ring-white/10">
            <p className="mb-4 text-xl font-medium tracking-[0.25em] text-white/50">ANTERIORES</p>
            <ul className="space-y-3">
              {anteriores.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-5xl font-bold">{l.turno}</span>
                  <span className="truncate text-2xl text-white/60">{l.consultorio ? `Consultorio ${l.consultorio}` : l.especialidad}</span>
                </li>
              ))}
              {anteriores.length === 0 && <li className="text-2xl text-white/30">—</li>}
            </ul>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] bg-white/[0.04] p-8 ring-1 ring-white/10">
            <p className="mb-4 text-xl font-medium tracking-[0.25em] text-white/50">EN ESPERA</p>
            <ul className="space-y-3">
              {(q.data?.espera ?? []).map((e) => (
                <li key={e.especialidad} className="flex items-center justify-between gap-4 text-2xl">
                  <span className="truncate">{e.especialidad}</span>
                  <span className="shrink-0 text-white/60">
                    <span className="font-mono font-semibold text-white">{e.siguiente}</span> · {e.cantidad}
                  </span>
                </li>
              ))}
              {(q.data?.espera ?? []).length === 0 && <li className="text-2xl text-white/30">Nadie esperando</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
