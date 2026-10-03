import type { ReactNode } from 'react';

/** Card protagonista: fondo oscuro con dos formas orgánicas planas que derivan lento. */
export function HeroBlobs() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        className="blob"
        fill="var(--c-brand)"
        d="M260 -70c92-16 186 46 192 138s-58 146-140 142-136-64-130-142 6-122 78-138z"
      />
      <path
        className="blob"
        fill="var(--c-blob)"
        d="M-56 18c4-52 52-82 100-70s72 58 52 98-66 58-104 44-52-26-48-72z"
      />
    </svg>
  );
}

export function HeroCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden rounded-lg bg-hero text-on-hero ${className}`}>
      <HeroBlobs />
      <div className="relative min-h-[inherit]">{children}</div>
    </div>
  );
}
