/**
 * Marca de Chaski: un chaski moderno corriendo con un folder. Su cuerpo forma la "k" del nombre
 * y las cintas de su tocado (llauto) ondean hacia atrás por la velocidad.
 */
export function LogoMark({ size = 28, running = false, className = '' }: { size?: number; running?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${running ? 'chaski-run' : ''} ${className}`}
    >
      <path className="chaski-tail" d="M27 7.5 L15 4.5" stroke="var(--c-brand)" strokeWidth={3.6} />
      <path className="chaski-tail" d="M27 10.5 L17 12.5" stroke="var(--c-brand)" strokeWidth={3.6} />
      <circle cx={33} cy={9} r={6} fill="currentColor" />
      <path d="M31 20 L16 56 M22 36 L41 24 M22 36 L40 54" stroke="currentColor" strokeWidth={8} />
      <path
        d="M42 15h6l2.2 2.5H58a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H42a2.5 2.5 0 0 1-2.5-2.5V17.5A2.5 2.5 0 0 1 42 15z"
        fill="var(--c-brand)"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="chaski-enter inline-flex items-center gap-2 text-ink">
      <LogoMark size={34} />
      <span className="text-[28px] font-semibold leading-none tracking-[-0.035em]">chaski</span>
    </span>
  );
}
