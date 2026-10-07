import { AnimatePresence, m } from 'motion/react';
import { ArrowClockwise, LockSimple, PlayCircle, Scan } from '@phosphor-icons/react';
import { coarse } from '../chat/Composer';
import { QrCode } from '../QrCode';
import { LogoMark } from '../brand/Logo';
import { fast, rise, stagger } from '../motion';

// En el celular el flujo es al revés: abrir Chaski en la PC y escanear su QR desde aquí.
const STEPS = canScanHere()
  ? ['Abre chaski.me en la PC', 'Escanea su QR', 'Elige qué enviar']
  : ['Abre la cámara del celular', 'Apunta al código', 'Elige qué enviar'];

function canScanHere(): boolean {
  return coarse && typeof window !== 'undefined' && !!window.BarcodeDetector;
}

/** En el celular, escanear desde la app (BarcodeDetector: Chrome en Android). */
const canScan = canScanHere();

/** PC esperando: un título que dice qué hacer, tres pasos y el QR grande. */
export function PairScreen({
  shareUrl,
  error,
  onRetry,
  onScan,
  onTutorial,
}: {
  shareUrl: string | null;
  error: string | null;
  onRetry: () => void;
  onScan: () => void;
  onTutorial: () => void;
}) {
  if (error) return <Offline message={error} onRetry={onRetry} />;
  if (!shareUrl) return <Connecting />;
  return (
    <m.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="flex flex-1 flex-col justify-center gap-10 py-6 md:flex-row md:items-center md:justify-between md:gap-16"
    >
      <m.section variants={rise} className="flex flex-col gap-8 md:gap-11">
        <h1 className="text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[64px] lg:text-[88px]">
          {canScan ? (
            <>
              Pasa archivos
              <br />a una PC
            </>
          ) : (
            <>
              Pasa archivos
              <br />a esta PC
            </>
          )}
        </h1>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-4 text-[18px] sm:text-[21px]">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink text-[15px] font-semibold">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        {canScan && (
          <button
            type="button"
            onClick={onScan}
            className="press inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-semibold text-on-ink"
          >
            <Scan size={20} weight="bold" aria-hidden="true" />
            Escanear el QR de la PC
          </button>
        )}
        <button type="button" onClick={onTutorial} className="press inline-flex w-fit items-center gap-2 text-[16px] font-semibold text-brand">
          <PlayCircle size={22} weight="fill" aria-hidden="true" />
          Ver cómo funciona
        </button>
      </m.section>

      <m.section variants={rise} className="flex flex-col items-center gap-5">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={shareUrl}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={fast}
            className="rounded-[20px] bg-[#fff] p-4 dark:p-6"
          >
            <QrCode text={shareUrl} className="block h-auto w-[min(78vw,400px)]" />
          </m.div>
        </AnimatePresence>
        <p className="flex items-center gap-2.5 text-[16px] font-medium text-muted">
          <span className="live-dot text-brand" aria-hidden="true" />
          Esperando a tu celular
        </p>
        <p className="flex items-center gap-2 text-[14px] text-muted md:hidden">
          <LockSimple size={15} aria-hidden="true" />
          Cifrado de extremo a extremo
        </p>
      </m.section>
    </m.div>
  );
}

/** Dispositivo que escaneó: el chaski corre mientras se conectan. */
function Connecting() {
  return (
    <m.div variants={rise} initial="hidden" animate="show" className="flex flex-1 flex-col items-center justify-center gap-6">
      <LogoMark size={88} running />
      <p className="text-[24px] font-semibold tracking-[-0.03em]">Conectando</p>
    </m.div>
  );
}

/** Sin servidor o sin red: el chaski se detiene, el motivo y un solo botón. */
function Offline({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <m.div variants={rise} initial="hidden" animate="show" role="alert" className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <LogoMark size={88} className="text-muted" />
      <p className="text-[24px] font-semibold tracking-[-0.03em]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="press inline-flex h-14 items-center gap-2 rounded-full bg-ink px-7 text-[16px] font-semibold text-on-ink"
      >
        <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
        Reintentar
      </button>
    </m.div>
  );
}
