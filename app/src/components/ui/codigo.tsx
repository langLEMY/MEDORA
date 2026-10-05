import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Código de N dígitos en casillas: avanza solo, Retroceso vuelve a la anterior,
 * acepta pegar el código completo y avisa al completarse (para verificar sin botón).
 */
export function CodigoDigitos({
  valor,
  onChange,
  onCompleto,
  digitos = 6,
  deshabilitado,
  error,
  autoFocus,
}: {
  valor: string;
  onChange: (v: string) => void;
  onCompleto?: (v: string) => void;
  digitos?: number;
  deshabilitado?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const casillas = useRef<(HTMLInputElement | null)[]>([]);
  const enfocar = (i: number) => casillas.current[Math.max(0, Math.min(digitos - 1, i))]?.focus();

  useEffect(() => {
    if (autoFocus) enfocar(0);
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Tras un error se borra el código: volver a la primera casilla.
  useEffect(() => {
    if (valor === "" && error) enfocar(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, error]);

  const poner = (nuevo: string) => {
    const limpio = nuevo.replace(/\D/g, "").slice(0, digitos);
    onChange(limpio);
    if (limpio.length === digitos) onCompleto?.(limpio);
    return limpio;
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label={`Código de ${digitos} números`}>
      {Array.from({ length: digitos }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            casillas.current[i] = el;
          }}
          value={valor[i] ?? ""}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={digitos}
          disabled={deshabilitado}
          aria-label={`Número ${i + 1}`}
          aria-invalid={error}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const escrito = e.target.value.replace(/\D/g, "");
            if (!escrito) return;
            // Pegado o autocompletado del sistema: varios dígitos de una vez.
            if (escrito.length > 1) {
              const limpio = poner(valor.slice(0, i) + escrito);
              enfocar(limpio.length);
              return;
            }
            const arr = valor.padEnd(digitos, " ").split("");
            arr[i] = escrito;
            poner(arr.join("").replace(/\s+$/, "").replace(/ /g, ""));
            enfocar(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (valor[i]) poner(valor.slice(0, i) + valor.slice(i + 1));
              else if (i > 0) {
                poner(valor.slice(0, i - 1) + valor.slice(i));
                enfocar(i - 1);
              }
            } else if (e.key === "ArrowLeft") enfocar(i - 1);
            else if (e.key === "ArrowRight") enfocar(i + 1);
          }}
          className={cn(
            "h-13 w-full min-w-0 rounded-xl border bg-superficie text-center font-mono text-xl font-semibold text-texto shadow-sm transition-[border-color,box-shadow] duration-150 outline-none tabular",
            "focus:border-marca focus:[box-shadow:0_0_0_4px_var(--anillo)] disabled:opacity-60",
            error ? "border-peligro" : valor[i] ? "border-borde-fuerte" : "border-borde",
          )}
        />
      ))}
    </div>
  );
}
