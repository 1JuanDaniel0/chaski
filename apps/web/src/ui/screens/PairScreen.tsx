import { AnimatePresence, m } from 'motion/react';
import { LockSimple, Play } from '@phosphor-icons/react';
import { QrCode } from '../QrCode';
import { LogoMark } from '../brand/Logo';
import { fast, rise, stagger } from '../motion';

/** PC esperando: el QR manda; todo lo demás es secundario por tamaño. */
export function PairScreen({ shareUrl, onTutorial }: { shareUrl: string | null; onTutorial: () => void }) {
  if (!shareUrl) return <Connecting />;
  return (
    <m.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-12">
      <m.section
        variants={rise}
        className="tile order-2 flex items-center justify-center bg-peach p-5 sm:p-10 md:order-none md:col-span-7 md:min-h-[540px]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={shareUrl}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={fast}
            className="rounded-md bg-[#fff] p-7"
          >
            <QrCode text={shareUrl} className="block h-auto w-[min(58vw,300px)]" />
          </m.div>
        </AnimatePresence>
      </m.section>

      <div className="contents md:col-span-5 md:flex md:flex-col md:justify-between md:gap-3">
      <m.section variants={rise} className="order-1 flex flex-col gap-6 px-1 pt-2 md:order-none md:px-4 md:pt-8">
        <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] sm:text-[64px]">
          Escanea con
          <br />
          tu celular
        </h1>
        <p className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-muted">
          <span className="live-dot text-brand" aria-hidden="true" />
          Esperando
        </p>
      </m.section>

      <m.section variants={rise} className="order-3 grid grid-cols-2 gap-3 md:order-none">
        <div className="tile flex min-h-[148px] flex-col justify-between bg-mint p-5 text-mint-ink">
          <LockSimple size={26} weight="bold" aria-hidden="true" />
          <p className="text-[15px] font-semibold leading-snug">
            Directo y cifrado.
            <br />
            Nada se guarda.
          </p>
        </div>
        <button
          type="button"
          onClick={onTutorial}
          className="tile press group flex min-h-[148px] flex-col justify-between bg-sky p-5 text-left hover:brightness-[0.98]"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-ink text-on-ink transition-transform duration-200 group-hover:scale-105">
            <Play size={16} weight="fill" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold">Cómo funciona</span>
        </button>
      </m.section>
      </div>
    </m.div>
  );
}

/** Dispositivo que escaneó: solo hay que esperar un instante. */
function Connecting() {
  return (
    <m.div variants={rise} initial="hidden" animate="show" className="tile flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-surface">
      <m.span
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="text-ink"
      >
        <LogoMark size={64} />
      </m.span>
      <p className="font-display text-[36px] leading-none">Conectando</p>
    </m.div>
  );
}
