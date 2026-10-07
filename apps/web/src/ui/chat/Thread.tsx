import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Check, Checks, Copy, DownloadSimple, File, FileImage, FilePdf, FileText, FileZip, Warning, X } from '@phosphor-icons/react';
import { formatSize } from '../../lib/format';
import type { TransferItem } from '../../transfer/manager';
import { EASE } from '../motion';

function download(item: TransferItem): void {
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

export function FileIcon({ mime, name, size }: { mime: string; name: string; size: number }) {
  const p = { size, 'aria-hidden': true } as const;
  if (mime.startsWith('image/')) return <FileImage {...p} />;
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return <FilePdf {...p} />;
  if (/zip|rar|7z|tar|gzip/.test(mime)) return <FileZip {...p} />;
  if (mime.startsWith('text/')) return <FileText {...p} />;
  return <File {...p} />;
}

const clock = (t: number) => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

/** Miniatura de una imagen recibida (blob local, nunca sale del navegador). */
function Thumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return <img src={url} alt="" className="block max-h-[260px] w-full rounded-[18px] object-cover" />;
}

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
  const thumb = item.kind === 'file' && item.mime.startsWith('image/') ? (mine ? item.preview : done ? item.blob : undefined) : undefined;
  const isImage = !!thumb && !failed;

  const ping = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  };
  const tone = mine ? 'text-on-ink/60' : 'text-muted';

  const status = failed
    ? (item.note ?? (item.status === 'cancelled' ? 'Cancelado' : 'Falló'))
    : running
      ? `${mine ? 'Enviando' : 'Recibiendo'} ${Math.round(pct)} %`
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
            {isImage && thumb && <Thumb blob={thumb} />}
            <div className={`flex items-center gap-3 ${isImage ? 'mt-2 px-2.5' : ''}`}>
              <span className={mine ? 'text-on-ink' : 'text-ink'}>
                <FileIcon mime={item.mime} name={item.name} size={30} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{item.name}</span>
                <span className={`flex items-center gap-1.5 text-[13px] ${tone}`}>
                  {status}
                  <span aria-hidden="true">·</span>
                  {clock(at)}
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
export function Thread({ items, system, onCancel }: { items: TransferItem[]; system: { key: string; text: string }[]; onCancel: (i: TransferItem) => void }) {
  const seen = useRef(new Map<string, number>());
  const end = useRef<HTMLDivElement>(null);
  for (const i of items) if (!seen.current.has(i.key)) seen.current.set(i.key, Date.now());

  const count = items.length + system.length;
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
      <div ref={end} />
    </ul>
  );
}
