import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowClockwise, DeviceMobile, DownloadSimple, Laptop, LockSimple, Monitor, Moon, Sun, UploadSimple, X } from '@phosphor-icons/react';
import { Controller, type Phase } from '../app/controller';
import type { Route } from '../signaling/messages';
import { Logo, LogoMark } from './brand/Logo';
import { PairScreen } from './screens/PairScreen';
import { ScanScreen } from './screens/ScanScreen';
import { CodeScreen } from './screens/CodeScreen';
import { Thread, download } from './chat/Thread';
import { useLeaveGuard, useWakeLock } from './hooks';
import { Composer, coarse } from './chat/Composer';
import { ShareChaski } from './chat/ShareChaski';
import { TutorialDialog } from './tutorial/TutorialDialog';
import { InfoDemo } from './tutorial/InfoDemo';
import { EASE, screen } from './motion';
import { NEXT_THEME, THEME_LABEL, getThemePref, setThemePref } from './theme';

type Stage = 'pair' | 'chat';
const STAGE: Record<Phase, Stage> = {
  scan: 'pair',
  code: 'pair',
  starting: 'pair',
  waiting: 'pair',
  connecting: 'pair',
  connected: 'chat',
  reconnecting: 'chat',
  'peer-left': 'chat',
  kicked: 'chat',
  error: 'chat',
};

const ENDED: Partial<Record<Phase, string>> = {
  'peer-left': 'El otro dispositivo se desconectó',
  kicked: 'El otro dispositivo terminó la sesión y se borró el chat',
};

/** Junto a "Conectado con…": por el relevo puede ir más lento, y así no parece que Chaski esté fallando. */
const ROUTE: Record<Exclude<Route, 'failed'>, string> = {
  host: 'Conexión directa',
  srflx: 'Conexión directa',
  relay: 'Por relevo: puede ir más lento. En el mismo wifi va directo',
};

const isPhone = (label: string | null) => !!label && /Android|iOS/.test(label);
const clock = (t: number) => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

export function App() {
  const ctl = useMemo(() => new Controller(), []);
  const v = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const [drag, setDrag] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [theme, setTheme] = useState(getThemePref);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const connectedAt = useRef<number | null>(null);
  // Un error antes de emparejar se muestra en la pantalla de inicio, no en un chat vacío.
  const stage: Stage = v.phase === 'error' && connectedAt.current === null ? 'pair' : STAGE[v.phase];
  const live = v.phase === 'connected';
  // Reconectando, el canal sigue abierto: se puede seguir enviando y lo que esté en curso continúa al volver.
  const usable = live || v.phase === 'reconnecting';
  const busy = v.items.some((i) => i.status === 'pending' || i.status === 'active');
  const received = v.items.filter((i) => i.dir === 'in' && i.kind === 'file' && i.status === 'done' && i.blob);
  const done = v.items.filter((i) => i.status === 'done');
  useWakeLock(busy);
  useLeaveGuard(busy);

  // Varias descargas seguidas: el navegador pide permiso una sola vez.
  const downloadAll = () => received.forEach((item, n) => setTimeout(() => download(item), n * 350));

  useEffect(() => {
    ctl.init();
  }, [ctl]);

  // La sección estática de index.html (qué es Chaski y preguntas frecuentes) solo va debajo del QR.
  const showInfo = stage === 'pair' && v.phase !== 'scan' && v.phase !== 'code';
  useEffect(() => {
    const info = document.getElementById('info');
    if (info) info.hidden = !showInfo;
  }, [showInfo]);
  if (live && connectedAt.current === null) connectedAt.current = Date.now();
  if (stage === 'pair') connectedAt.current = null;

  const peer = v.peerDevice ?? 'otro dispositivo';
  const system = [
    ...(connectedAt.current ? [{ key: 'on', text: `Conectado con ${peer} · ${clock(connectedAt.current)}${v.route ? ` · ${ROUTE[v.route]}` : ''}` }] : []),
    ...(v.phase === 'reconnecting' ? [{ key: 're', text: 'Reconectando…' }] : []),
    ...(stage === 'chat' && !usable ? [{ key: 'off', text: ENDED[v.phase] ?? v.error ?? 'Se perdió la conexión' }] : []),
  ];

  const dragProps = usable
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
    <div className="flex h-dvh flex-col" {...dragProps}>
      <header className="mx-auto flex h-[72px] w-full max-w-[1296px] shrink-0 items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
        {stage === 'chat' && coarse ? <LogoMark size={34} /> : <Logo />}
        <AnimatePresence>
          {stage === 'chat' && (
            <m.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex min-w-0 items-center gap-3">
              {!coarse && (
                <>
                  <span className="hidden items-center gap-2 text-[15px] font-medium md:flex">
                    <Laptop size={22} aria-hidden="true" /> Esta PC
                  </span>
                  <svg width="56" height="4" className="hidden text-brand md:block" aria-hidden="true">
                    <line x1="2" y1="2" x2="54" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" className={live ? 'route-line' : ''} />
                  </svg>
                </>
              )}
              <span className={`flex min-w-0 items-center gap-2 text-[15px] font-medium ${live ? '' : 'text-muted'}`}>
                <span className={`size-2 shrink-0 rounded-full ${live ? 'bg-online' : 'bg-line'}`} aria-hidden="true" />
                {isPhone(v.peerDevice) ? <DeviceMobile size={22} aria-hidden="true" /> : <Laptop size={22} aria-hidden="true" />}
                <span className="truncate">{peer}</span>
              </span>
            </m.div>
          )}
        </AnimatePresence>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = NEXT_THEME[theme];
              setThemePref(next);
              setTheme(next);
            }}
            aria-label={`${THEME_LABEL[theme]}. Cambiar tema`}
            title={THEME_LABEL[theme]}
            className="press inline-flex size-10 items-center justify-center rounded-full bg-soft"
          >
            <ThemeIcon size={18} aria-hidden="true" />
          </button>
          {stage === 'chat' && usable && (
            <button
              type="button"
              onClick={() => ctl.end()}
              aria-label="Terminar y borrar el chat"
              title="Terminar y borrar el chat"
              className="press inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-soft px-4 text-[15px] font-medium"
            >
              <X size={16} weight="bold" aria-hidden="true" />
              <span className="hidden sm:inline">Terminar</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {stage === 'pair' ? (
            <m.div key="pair" variants={screen} initial="hidden" animate="show" exit="exit" className="mx-auto flex w-full max-w-[1296px] flex-1 flex-col overflow-y-auto px-4 sm:px-8">
              {v.phase === 'scan' ? (
                <ScanScreen outbox={v.outbox} onScan={(secret) => ctl.join(secret)} onCode={() => ctl.enterCode()} onCancel={() => ctl.discardShare()} />
              ) : v.phase === 'code' ? (
                <CodeScreen checking={v.codeChecking} error={v.codeError} onSubmit={(c) => ctl.submitCode(c)} onCancel={() => ctl.discardShare()} />
              ) : (
                <PairScreen
                  shareUrl={v.phase === 'connecting' ? null : v.shareUrl}
                  code={v.code}
                  onCode={() => ctl.enterCode()}
                  error={v.phase === 'error' ? (v.error ?? 'No se pudo conectar') : null}
                  onRetry={() => ctl.retry()}
                  onScan={() => ctl.scan()}
                  onTutorial={() => setTutorial(true)}
                />
              )}
              <p className="hidden items-center gap-2 pb-8 text-[14px] text-muted md:flex">
                <LockSimple size={16} aria-hidden="true" />
                Cifrado de extremo a extremo. Nada pasa por un servidor ni se guarda.
              </p>
            </m.div>
          ) : (
            <m.div key="chat" variants={screen} initial="hidden" animate="show" exit="exit" className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                <div className="mx-auto flex min-h-full max-w-[760px] flex-col justify-end">
                  <Thread
                    items={v.items}
                    system={system}
                    footer={done.length > 0 && !busy && <ShareChaski received={done.some((i) => i.dir === 'in')} />}
                    onCancel={(i) => ctl.cancel(i)}
                  />
                </div>
              </div>
              <div className="mx-auto w-full max-w-[760px] shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 sm:px-4 sm:pb-6">
                {received.length > 1 && (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={downloadAll}
                      className="press inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-on-ink"
                    >
                      <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                      Descargar todo ({received.length})
                    </button>
                  </div>
                )}
                {usable ? (
                  <Composer onFiles={(f) => ctl.sendFiles(f)} onText={(t) => ctl.sendText(t)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => ctl.newRoom()}
                    className="press flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-semibold text-on-ink"
                  >
                    <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
                    Nueva sala
                  </button>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {drag && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="pointer-events-none fixed inset-3 z-20 flex flex-col items-center justify-center gap-4 rounded-[24px] border-2 border-dashed border-brand bg-paper/90 text-ink"
          >
            <UploadSimple size={44} className="text-brand" aria-hidden="true" />
            <p className="text-[28px] font-semibold tracking-[-0.03em]">Suelta para enviar</p>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {v.warning && (
          <m.div
            role="alert"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.16, ease: EASE } }}
            className="fixed inset-x-4 top-4 z-30 mx-auto flex max-w-[520px] items-center gap-4 rounded-[20px] bg-ink py-3 pl-5 pr-2 text-[15px] text-on-ink"
          >
            <span className="flex-1">{v.warning}</span>
            <button type="button" onClick={() => ctl.dismissWarning()} className="press h-10 rounded-full bg-on-ink/10 px-4 font-semibold">
              Entendido
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <TutorialDialog open={tutorial} onClose={() => setTutorial(false)} />
      <InfoDemo />
    </div>
  );
}
