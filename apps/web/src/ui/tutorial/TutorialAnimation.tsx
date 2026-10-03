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

        {/* Pantalla: chat conectado */}
        <g className="tut-chat">
          <rect x={203} y={92} width={64} height={7} rx={3.5} fill="var(--c-muted)" opacity={0.3} />
          <rect x={114} y={190} width={242} height={22} rx={11} fill="var(--c-soft, #f3f3f5)" stroke="var(--c-line)" strokeWidth={1} />
          <circle cx={126} cy={201} r={6} fill="var(--c-ink)" />
          <rect x={141} y={199} width={58} height={4} rx={2} fill="var(--c-muted)" opacity={0.4} />
          <circle cx={344} cy={201} r={6} fill="var(--c-brand)" />
        </g>

        {/* Pantalla: burbuja recibida */}
        <g className="tut-row">
          <path d="M128 118h126a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12H120a4 4 0 0 1-4-4V130a12 12 0 0 1 12-12z" fill="var(--c-soft, #f3f3f5)" stroke="var(--c-line)" strokeWidth={1} />
          <rect x={127} y={128} width={32} height={32} rx={9} fill="var(--c-peach)" />
          <rect x={169} y={131} width={72} height={7} rx={3.5} fill="var(--c-muted)" opacity={0.6} />
          <rect x={169} y={144} width={44} height={6} rx={3} fill="var(--c-muted)" opacity={0.35} />
          <rect x={127} y={167} width={128} height={6} rx={3} fill="var(--c-line)" className="tut-track" />
          <rect x={127} y={167} width={128} height={6} rx={3} fill="var(--c-brand)" className="tut-fill" />
          <g className="tut-button">
            <circle cx={245} cy={170} r={9} fill="var(--c-ink)" />
            <path d="M245 165.5v7M241.5 169.5l3.5 3.5 3.5-3.5" stroke="var(--c-on-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
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
          <g className="tut-chat">
            <rect x={368} y={278} width={94} height={18} rx={9} fill="var(--c-soft, #f3f3f5)" stroke="var(--c-line)" strokeWidth={1} />
            <circle cx={378} cy={287} r={5} fill="var(--c-ink)" />
            <circle cx={452} cy={287} r={5} fill="var(--c-brand)" />
          </g>
          <g className="tut-chip">
            <path d="M406 236h42a10 10 0 0 1 10 10v16a4 4 0 0 1-4 4h-48a10 10 0 0 1-10-10v-10a10 10 0 0 1 10-10z" fill="var(--c-ink)" />
            <rect x={400} y={244} width={14} height={14} rx={4} fill="var(--c-peach)" />
            <rect x={420} y={245} width={28} height={4} rx={2} fill="var(--c-on-ink)" opacity={0.8} />
            <rect x={420} y={253} width={18} height={4} rx={2} fill="var(--c-on-ink)" opacity={0.45} />
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
