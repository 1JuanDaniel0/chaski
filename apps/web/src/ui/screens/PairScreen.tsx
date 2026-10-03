import type { ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { LockSimple, PlayCircle } from '@phosphor-icons/react';
import { QrCode } from '../QrCode';
import { LogoMark } from '../brand/Logo';
import { HeroCard } from '../brand/HeroCard';
import { fast, rise, stagger } from '../motion';

/** Contenido de card pastel al estilo iO: título en negrita arriba, ícono de línea a la derecha. */
export function CardHead({ title, sub, icon, iconClass = '' }: { title: string; sub?: string; icon: ReactNode; iconClass?: string }) {
  return (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-[19px] font-semibold leading-tight tracking-[-0.02em]">{title}</span>
        <span className={iconClass}>{icon}</span>
      </span>
      {sub && <span className="text-[15px] text-muted">{sub}</span>}
    </>
  );
}

/** PC esperando: el QR va en la card protagonista; lo demás es secundario por tamaño. */
export function PairScreen({ shareUrl, onTutorial }: { shareUrl: string | null; onTutorial: () => void }) {
  if (!shareUrl) return <Connecting />;
  return (
    <m.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-12">
      <div className="contents md:col-span-5 md:flex md:flex-col md:justify-between md:gap-4">
        <m.section variants={rise} className="order-1 px-1 pt-2 md:order-none md:pt-10">
          <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[56px]">Escanea con tu celular</h1>
          <p className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-mint px-4 text-[15px] font-medium text-mint-ink">
            <span className="live-dot" aria-hidden="true" />
            Esperando conexión
          </p>
        </m.section>

        <m.section variants={rise} className="order-3 grid grid-cols-2 gap-4 md:order-none">
          <div className="flex min-h-[150px] flex-col justify-between rounded-lg bg-mint p-5">
            <CardHead title="Cifrado" sub="Directo, nada se guarda" icon={<LockSimple size={24} />} iconClass="text-mint-ink" />
          </div>
          <button
            type="button"
            onClick={onTutorial}
            className="press flex min-h-[150px] flex-col justify-between rounded-lg bg-sky p-5 text-left hover:brightness-[0.98]"
          >
            <CardHead title="Cómo funciona" sub="Míralo en 7 s" icon={<PlayCircle size={26} />} />
          </button>
        </m.section>
      </div>

      <m.div variants={rise} className="order-2 md:order-none md:col-span-7">
        <HeroCard className="min-h-[400px] md:min-h-[500px]">
          <div className="flex h-full min-h-[inherit] items-center justify-center p-6 sm:p-10">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={shareUrl}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={fast}
                className="rounded-lg bg-[#fff] p-6 sm:p-7"
              >
                <QrCode text={shareUrl} className="block h-auto w-[min(58vw,280px)]" />
              </m.div>
            </AnimatePresence>
          </div>
        </HeroCard>
      </m.div>
    </m.div>
  );
}

/** Dispositivo que escaneó: el chaski corre mientras se conectan. */
function Connecting() {
  return (
    <m.div variants={rise} initial="hidden" animate="show">
      <HeroCard className="min-h-[62vh]">
        <div className="flex h-full min-h-[inherit] flex-col items-center justify-center gap-6 p-8">
          <LogoMark size={96} running className="text-on-hero" />
          <p className="text-[28px] font-semibold tracking-[-0.03em]">Conectando</p>
        </div>
      </HeroCard>
    </m.div>
  );
}
