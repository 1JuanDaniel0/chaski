import { useEffect, useMemo, useState, useSyncExternalStore, type DragEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowClockwise, X } from '@phosphor-icons/react';
import { Controller, type Phase } from '../app/controller';
import { Logo } from './brand/Logo';
import { PairScreen } from './screens/PairScreen';
import { RoomScreen } from './screens/RoomScreen';
import { TransferList } from './TransferList';
import { TutorialDialog } from './tutorial/TutorialDialog';
import { EASE, screen } from './motion';

type Stage = 'pair' | 'room' | 'ended';
const STAGE: Record<Phase, Stage> = {
  starting: 'pair',
  waiting: 'pair',
  connecting: 'pair',
  connected: 'room',
  'peer-left': 'ended',
  kicked: 'ended',
  error: 'ended',
};

export function App() {
  const ctl = useMemo(() => new Controller(), []);
  const v = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [drag, setDrag] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const stage = STAGE[v.phase];

  useEffect(() => {
    ctl.init();
  }, [ctl]);

  const dragProps =
    stage === 'room'
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setDrag(true);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDrag(false);
            ctl.sendFiles(e.dataTransfer.files);
          },
        }
      : {};

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1120px] flex-col px-4 sm:px-6" {...dragProps}>
      <header className="flex h-20 items-center justify-between gap-4">
        <Logo animated />
        <AnimatePresence>
          {stage === 'room' && (
            <m.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex h-10 items-center gap-1 rounded-full bg-mint pl-4 pr-1 text-mint-ink"
            >
              <span className="live-dot" aria-hidden="true" />
              <span className="ml-1.5 max-w-[46vw] truncate text-[14px] font-semibold">{v.peerDevice ?? 'Conectado'}</span>
              {v.isOwner ? (
                <button
                  type="button"
                  onClick={() => ctl.kick()}
                  aria-label="Desconectar al otro dispositivo"
                  title="Desconectar"
                  className="press ml-1 flex size-8 items-center justify-center rounded-full hover:bg-surface/60"
                >
                  <X size={14} weight="bold" />
                </button>
              ) : (
                <span className="w-3" />
              )}
            </m.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 pb-6">
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={stage} variants={screen} initial="hidden" animate="show" exit="exit">
            {stage === 'pair' && <PairScreen shareUrl={v.phase === 'connecting' ? null : v.shareUrl} onTutorial={() => setTutorial(true)} />}
            {stage === 'room' && <RoomScreen dragging={drag} onFiles={(f) => ctl.sendFiles(f)} onText={(t) => ctl.sendText(t)} />}
            {stage === 'ended' && <Ended phase={v.phase} error={v.error} onNew={() => ctl.newRoom()} />}
          </m.div>
        </AnimatePresence>
        {stage !== 'pair' && <TransferList items={v.items} onCancel={(i) => ctl.cancel(i)} />}
      </main>

      <footer className="py-6 text-[13px] font-medium text-muted">Cifrado de extremo a extremo. Protege el trayecto, no la PC: borra lo descargado al terminar.</footer>

      <AnimatePresence>
        {v.warning && (
          <m.div
            role="alert"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.16, ease: EASE } }}
            className="fixed inset-x-4 bottom-4 z-10 mx-auto flex max-w-[520px] items-center gap-4 rounded-md bg-ink py-3 pl-5 pr-2 text-[15px] text-on-ink"
          >
            <span className="flex-1">{v.warning}</span>
            <button type="button" onClick={() => ctl.dismissWarning()} className="press h-10 rounded-full bg-on-ink/10 px-4 font-semibold">
              Entendido
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <TutorialDialog open={tutorial} onClose={() => setTutorial(false)} />
    </div>
  );
}

const ENDED: Partial<Record<Phase, string>> = {
  'peer-left': 'Se desconectó',
  kicked: 'Te desconectaron',
};

function Ended({ phase, error, onNew }: { phase: Phase; error: string | null; onNew: () => void }) {
  return (
    <section className="tile flex min-h-[200px] flex-col items-start justify-between gap-8 sm:min-h-[260px] bg-surface p-6 ring-1 ring-line sm:p-8">
      <h1 className="font-display text-[40px] leading-[1.02] tracking-[-0.02em] sm:text-[56px]">{ENDED[phase] ?? error ?? 'Algo falló'}</h1>
      <button type="button" onClick={onNew} className="press inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-on-ink">
        <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
        Nueva sala
      </button>
    </section>
  );
}
