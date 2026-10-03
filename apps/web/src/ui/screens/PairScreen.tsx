import { AnimatePresence, m } from 'motion/react';
import { LockSimple, PlayCircle } from '@phosphor-icons/react';
import { QrCode } from '../QrCode';
import { LogoMark } from '../brand/Logo';
import { fast, rise, stagger } from '../motion';

const STEPS = ['Abre la cámara del celular', 'Apunta al código', 'Elige qué enviar'];

/** PC esperando: un título que dice qué hacer, tres pasos y el QR grande. */
export function PairScreen({ shareUrl, onTutorial }: { shareUrl: string | null; onTutorial: () => void }) {
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
          Pasa archivos
          <br />a esta PC
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
