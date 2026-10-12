import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowSquareOut, Check, Checks, Copy, DownloadSimple, File, FileAudio, FileDoc, FileImage, FilePdf, FilePpt, FileText, FileVideo, FileXls, FileZip, Warning, X } from '@phosphor-icons/react';
import { fileKind, type FileKind } from '../../lib/filetype';
import { formatSize } from '../../lib/format';
import type { TransferItem } from '../../transfer/manager';
import { EASE } from '../motion';

export function download(item: TransferItem): void {
  if (!item.blob) return;
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.name; // nombre ya saneado
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const ICONS = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FilePdf,
  text: FileText,
  word: FileDoc,
  excel: FileXls,
  slides: FilePpt,
  archive: FileZip,
  other: File,
} satisfies Record<FileKind, unknown>;

export function FileIcon({ mime, name, size }: { mime: string; name: string; size: number }) {
  const Icon = ICONS[fileKind(mime, name)];
  return <Icon size={size} aria-hidden="true" />;
}

/** URL temporal de un blob local; se libera al desmontar. */
function useObjectUrl(blob: Blob | undefined, type?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(type ? new Blob([blob], { type }) : blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob, type]);
  return url;
}

const clock = (t: number) => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

/** Vista previa en la burbuja: todo sale de blobs locales, nunca de la red. */
function Preview({ kind, blob, onFail }: { kind: FileKind; blob: Blob; onFail: () => void }) {
  const url = useObjectUrl(blob);
  if (!url) return null;
  if (kind === 'image') return <img src={url} alt="" onError={onFail} className="block max-h-[260px] w-full rounded-[18px] object-cover" />;
  if (kind === 'video')
    return <video src={url} controls playsInline preload="metadata" onError={onFail} className="block max-h-[320px] w-full rounded-[18px] bg-[#000]" />;
  return null;
}

function AudioPlayer({ blob, onFail }: { blob: Blob; onFail: () => void }) {
  const url = useObjectUrl(blob);
  return url ? <audio src={url} controls preload="metadata" onError={onFail} className="mt-2 block h-10 w-full min-w-[220px]" /> : null;
}

/** Primeras líneas de un archivo de texto o código, siempre como texto plano. */
function Snippet({ blob, mine }: { blob: Blob; mine: boolean }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let live = true;
    void blob.slice(0, 2048).text().then((t) => live && setText(t.split('\n').slice(0, 6).join('\n')));
    return () => {
      live = false;
    };
  }, [blob]);
  if (!text.trim()) return null;
  return (
    <pre className={`mt-2 max-h-[132px] overflow-hidden whitespace-pre-wrap break-all rounded-[12px] px-3 py-2 font-mono text-[12px] leading-[1.45] ${mine ? 'bg-on-ink/10' : 'bg-paper'}`}>
      {text}
    </pre>
  );
}

/** Abre un PDF en el visor del navegador. El tipo se fuerza a PDF: nunca se abre HTML ni nada ejecutable. */
function openPdf(blob: Blob): void {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Velocidad en bytes/s de los últimos ~3 s de un envío en curso; null mientras no hay datos suficientes. */
function useRate(bytes: number, running: boolean): number | null {
  const samples = useRef<{ t: number; b: number }[]>([]);
  if (!running) {
    samples.current = [];
    return null;
  }
  const now = performance.now();
  const s = samples.current;
  if (s.at(-1)?.b !== bytes) s.push({ t: now, b: bytes });
  while (s.length > 2 && now - s[0]!.t > 3000) s.shift();
  const first = s[0]!;
  const last = s.at(-1)!;
  const secs = (last.t - first.t) / 1000;
  return secs >= 0.5 ? (last.b - first.b) / secs : null;
}

const eta = (secs: number) => (secs < 60 ? `${Math.max(1, Math.round(secs))} s` : `${Math.round(secs / 60)} min`);

function Progress({ pct, mine }: { pct: number; mine: boolean }) {
  return (
    <div
      className={`mt-2 h-1 overflow-hidden rounded-full ${mine ? 'bg-on-ink/20' : 'bg-line'}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <m.div className="h-full rounded-full bg-brand" animate={{ width: `${pct}%` }} transition={{ duration: 0.2, ease: 'linear' }} />
    </div>
  );
}

function Bubble({ item, at, onCancel }: { item: TransferItem; at: number; onCancel: (i: TransferItem) => void }) {
  const [flash, setFlash] = useState(false);
  const mine = item.dir === 'out';
  const running = item.status === 'pending' || item.status === 'active';
  const failed = item.status === 'cancelled' || item.status === 'error';
  const done = item.status === 'done';
  const pct = item.size > 0 ? Math.min(100, (item.transferred / item.size) * 100) : done ? 100 : 0;
  const [broken, setBroken] = useState(false);
  const kind = fileKind(item.mime, item.name);
  // Lo propio se ve al instante; lo recibido, cuando termina de llegar.
  const local = mine ? item.preview : done ? item.blob : undefined;
  const visual = item.kind === 'file' && !failed && !broken && (kind === 'image' || kind === 'video') && local ? local : undefined;
  const isImage = !!visual;
  const fail = () => setBroken(true);

  const rate = useRate(item.transferred, running && item.status === 'active');
  const speed = rate && rate > 0 ? ` · ${formatSize(Math.round(rate))}/s · ${eta((item.size - item.transferred) / rate)}` : '';

  const ping = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  };
  const tone = mine ? 'text-on-ink/60' : 'text-muted';

  const status = failed
    ? (item.note ?? (item.status === 'cancelled' ? 'Cancelado' : 'Falló'))
    : running
      ? `${mine ? 'Enviando' : 'Recibiendo'} ${Math.round(pct)} %${speed}`
      : formatSize(item.size);

  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
      transition={{ type: 'spring', stiffness: 600, damping: 38 }}
      style={{ transformOrigin: mine ? '100% 100%' : '0% 100%' }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[min(82%,440px)] ${mine ? 'bubble-out bg-ink text-on-ink' : 'bubble-in bg-soft text-ink'} ${
          isImage ? 'p-1.5 pb-3' : 'px-4 py-3'
        } ${failed ? 'opacity-60' : ''}`}
      >
        {item.kind === 'text' ? (
          <>
            <p className="whitespace-pre-wrap break-words text-[17px] leading-[1.4]">{item.text}</p>
            <div className={`mt-1.5 flex items-center justify-end gap-3 text-[12px] ${tone}`}>
              {!mine && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(item.text ?? '').then(ping)}
                  className="press mr-auto inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand"
                >
                  {flash ? <Check size={15} weight="bold" aria-hidden="true" /> : <Copy size={15} weight="bold" aria-hidden="true" />}
                  {flash ? 'Copiado' : 'Copiar'}
                </button>
              )}
              <span>{clock(at)}</span>
              {mine && <Checks size={15} weight="bold" className="text-on-ink/70" aria-label="Entregado" />}
            </div>
          </>
        ) : (
          <>
            {visual && <Preview kind={kind} blob={visual} onFail={fail} />}
            <div className={`flex items-center gap-3 ${isImage ? 'mt-2 px-2.5' : ''}`}>
              <span className={mine ? 'text-on-ink' : 'text-ink'}>
                <FileIcon mime={item.mime} name={item.name} size={30} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{item.name}</span>
                <span className={`flex items-center gap-1.5 text-[13px] ${tone}`}>
                  {status}
                  {!running && (
                    <>
                      <span aria-hidden="true">·</span>
                      {clock(at)}
                    </>
                  )}
                  {mine && done && <Checks size={15} weight="bold" className="text-on-ink/70" aria-label="Entregado" />}
                </span>
              </span>
              {running && (
                <button
                  type="button"
                  onClick={() => onCancel(item)}
                  aria-label="Cancelar"
                  className={`press flex size-9 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-on-ink/15' : 'bg-line'}`}
                >
                  <X size={14} weight="bold" />
                </button>
              )}
              {!mine && done && item.blob && kind === 'pdf' && (
                <button
                  type="button"
                  onClick={() => openPdf(item.blob!)}
                  aria-label="Abrir"
                  title="Abrir"
                  className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-line"
                >
                  <ArrowSquareOut size={18} weight="bold" />
                </button>
              )}
              {!mine && done && item.blob && (
                <button
                  type="button"
                  onClick={() => {
                    download(item);
                    ping();
                  }}
                  aria-label="Descargar"
                  title="Descargar"
                  className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink"
                >
                  {flash ? <Check size={18} weight="bold" /> : <DownloadSimple size={18} weight="bold" />}
                </button>
              )}
            </div>
            {running && <div className={isImage ? 'px-2.5' : ''}><Progress pct={pct} mine={mine} /></div>}
            {local && !failed && !broken && kind === 'audio' && <AudioPlayer blob={local} onFail={fail} />}
            {local && !failed && kind === 'text' && <Snippet blob={local} mine={mine} />}
            {item.executable && !mine && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-danger">
                <Warning size={14} weight="bold" aria-hidden="true" />
                Programa ejecutable: ábrelo solo si confías en quien lo envió
              </p>
            )}
          </>
        )}
      </div>
    </m.li>
  );
}

/** Conversación entre tus dos dispositivos. Lo que llega a la izquierda; lo tuyo, a la derecha. */
export function Thread({
  items,
  system,
  footer,
  onCancel,
}: {
  items: TransferItem[];
  system: { key: string; text: string }[];
  footer?: ReactNode;
  onCancel: (i: TransferItem) => void;
}) {
  const seen = useRef(new Map<string, number>());
  const end = useRef<HTMLDivElement>(null);
  for (const i of items) if (!seen.current.has(i.key)) seen.current.set(i.key, Date.now());

  const count = items.length + system.length + (footer ? 1 : 0);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [count]);

  return (
    <ul className="flex flex-col gap-2 py-4" aria-live="polite">
      {system.slice(0, 1).map((s) => (
        <li key={s.key} className="flex justify-center pb-2">
          <span className="rounded-full bg-soft px-3 py-1 text-[13px] font-medium text-muted">{s.text}</span>
        </li>
      ))}
      <AnimatePresence initial={false}>
        {items.map((i) => (
          <Bubble key={i.key} item={i} at={seen.current.get(i.key)!} onCancel={onCancel} />
        ))}
      </AnimatePresence>
      {system.slice(1).map((s) => (
        <m.li key={s.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center pt-2">
          <span className="rounded-full bg-soft px-3 py-1 text-[13px] font-medium text-muted">{s.text}</span>
        </m.li>
      ))}
      {footer}
      <div ref={end} />
    </ul>
  );
}
