import { useId } from 'react';
import { LogoMark } from '../brand/Logo';
import './tutorial.css';

/* QR 7x7 fijo: F = esquina (buscador), 1 = módulo, 0 = vacío. */
const QR = [
  'FFF0FFF',
  'FFF1FFF',
  'FFF0FFF',
  '1011010',
  'FFF1101',
  'FFF0010',
  'FFF1101',
];
const PITCH = 14;
const CELL = 11;

const ARC = 'M415 92 Q330 -8 235 46';

function QrGlyph() {
  const out: React.ReactNode[] = [];
  QR.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '1') {
        out.push(<rect key={`${x}-${y}`} x={x * PITCH} y={y * PITCH} width={CELL} height={CELL} rx={3.5} fill="var(--c-ink)" />);
      }
    });
  });
  const finder = (fx: number, fy: number) => {
    const x = fx * PITCH;
    const y = fy * PITCH;
    return (
      <g key={`f${fx}${fy}`}>
        <rect x={x} y={y} width={39} height={39} rx={11} fill="var(--c-ink)" />
        <rect x={x + 7} y={y + 7} width={25} height={25} rx={7} fill="var(--c-peach)" />
        <rect x={x + 13} y={y + 13} width={13} height={13} rx={4} fill="var(--c-ink)" />
      </g>
    );
  };
  out.push(finder(0, 0), finder(4, 0), finder(0, 4));
  return <>{out}</>;
}

const STEPS = ['Escanea', 'Conecta', 'Envía'];

export function TutorialAnimation({ playing = true }: { playing?: boolean }) {
  const maskId = `tut-arc-${useId().replace(/:/g, '')}`;
  return (
    <div className={`tut-root${playing ? '' : ' tut-paused'}`}>
      <svg viewBox="0 16 560 298" width="100%" fill="none" aria-hidden="true" className="tut-svg">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="560" height="340">
            <path d={ARC} pathLength={1} stroke="#fff" strokeWidth={10} className="tut-arc-reveal" />
          </mask>
        </defs>

        {/* Laptop */}
        <rect x={80} y={222} width={310} height={12} rx={6} fill="var(--c-surface)" stroke="var(--c-ink)" strokeWidth={2.5} />
        <rect x={100} y={50} width={270} height={170} rx={16} fill="var(--c-surface)" stroke="var(--c-ink)" strokeWidth={2.5} />
        <g transform="translate(118 64)" style={{ color: 'var(--c-ink)' }}>
          <LogoMark size={18} />
        </g>

        {/* Pantalla: QR */}
        <g className="tut-qr">
          <rect x={173} y={73} width={124} height={124} rx={26} fill="var(--c-peach)" />
          <g transform="translate(187.5 87.5)">
            <QrGlyph />
          </g>
        </g>

        {/* Pantalla: conectado */}
        <g className="tut-pill">
          <rect x={175} y={120} width={120} height={30} rx={15} fill="var(--c-mint)" />
          <circle cx={194} cy={135} r={9} fill="var(--c-mint-ink)" className="tut-live" />
          <circle cx={194} cy={135} r={4} fill="var(--c-mint-ink)" />
          <rect x={209} y={132} width={62} height={6} rx={3} fill="var(--c-mint-ink)" opacity={0.45} />
        </g>

        {/* Pantalla: fila de archivo */}
        <g className="tut-row">
          <rect x={125} y={126} width={220} height={68} rx={20} fill="var(--c-paper)" stroke="var(--c-line)" strokeWidth={1.5} />
          <rect x={139} y={144} width={32} height={32} rx={11} fill="var(--c-peach)" />
          <rect x={183} y={141} width={84} height={7} rx={3.5} fill="var(--c-muted)" opacity={0.6} />
          <rect x={183} y={164} width={146} height={8} rx={4} fill="var(--c-line)" className="tut-track" />
          <rect x={183} y={164} width={146} height={8} rx={4} fill="var(--c-brand)" className="tut-fill" />
          <g className="tut-button">
            <rect x={183} y={157} width={146} height={22} rx={11} fill="var(--c-ink)" />
            <text x={256} y={172} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--c-on-ink)" style={{ fontFamily: 'var(--font-sans)' }}>
              Descargar
            </text>
          </g>
        </g>

        {/* Arco punteado */}
        <g className="tut-arc">
          <path d={ARC} stroke="var(--c-muted)" strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 9" mask={`url(#${maskId})`} />
        </g>

        {/* Teléfono */}
        <g className="tut-phone">
          <rect x={360} y={95} width={110} height={210} rx={22} fill="var(--c-surface)" stroke="var(--c-ink)" strokeWidth={2.5} />
          <rect x={402} y={108} width={26} height={5} rx={2.5} fill="var(--c-ink)" opacity={0.22} />
          <g className="tut-brackets" stroke="var(--c-ink)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5}>
            <path d="M385 187v-12h12M445 187v-12h-12M385 223v12h12M445 223v12h-12" />
          </g>
          <rect x={378} y={118} width={74} height={3} rx={1.5} fill="var(--c-brand)" className="tut-scan" />
          <g className="tut-chip">
            <rect x={375} y={140} width={80} height={44} rx={14} fill="var(--c-peach)" />
            <rect x={388} y={154} width={44} height={6} rx={3} fill="var(--c-muted)" opacity={0.6} />
            <rect x={388} y={167} width={28} height={6} rx={3} fill="var(--c-muted)" opacity={0.35} />
          </g>
        </g>

        {/* Mensaje en camino */}
        {/* El chaski corre con el archivo del celular a la PC (mirando a la izquierda). */}
        <g className="tut-dot" style={{ offsetPath: `path("${ARC}")` }}>
          <g className="tut-runner">
            <g transform="scale(-0.62 0.62) translate(-32 -40)" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M27 7.5 L15 4.5 M27 10.5 L17 12.5" stroke="var(--c-brand)" strokeWidth={3.6} />
              <circle cx={33} cy={9} r={6} fill="var(--c-ink)" />
              <path d="M31 20 L16 56 M22 36 L41 24 M22 36 L40 54" stroke="var(--c-ink)" strokeWidth={8} />
              <path
                d="M42 15h6l2.2 2.5H58a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H42a2.5 2.5 0 0 1-2.5-2.5V17.5A2.5 2.5 0 0 1 42 15z"
                fill="var(--c-brand)"
              />
            </g>
          </g>
        </g>
      </svg>

      <ol className="tut-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={`tut-step tut-step-${i + 1}`}>
            <span className="tut-step-dot" />
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
