import { cn } from "@/lib/utils";

export function Isotipo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="medora-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#0E7490" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#medora-g)" />
      <path
        d="M16 44V22l10 12 6-8 6 8 10-12v22"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logotipo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Isotipo />
      <span className="text-[17px] font-semibold tracking-[0.08em] text-texto">MEDORA</span>
    </div>
  );
}
