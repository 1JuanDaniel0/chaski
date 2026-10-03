/**
 * Marca de Chasqui: una "c" abierta (el relevo) y un punto que sale por la abertura
 * (el mensaje en camino, que nadie retiene).
 */
export function LogoMark({ size = 28, animated = false, className = '' }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M23.07 8.93A10 10 0 1 0 23.07 23.07"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={4.2}
        strokeLinecap="round"
        className={animated ? 'logo-arc' : undefined}
      />
      <circle cx={27.2} cy={16} r={3.3} fill="var(--c-brand)" className={animated ? 'logo-dot' : undefined} />
    </svg>
  );
}

export function Logo({ animated = false }: { animated?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <LogoMark size={26} animated={animated} />
      <span className="font-display text-[28px] leading-none tracking-[-0.01em]">chasqui</span>
    </span>
  );
}
