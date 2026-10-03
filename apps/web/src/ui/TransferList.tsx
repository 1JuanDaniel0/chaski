import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ArrowDown, ArrowUp, Check, Copy, DownloadSimple, Warning, X } from '@phosphor-icons/react';
import { formatSize } from '../lib/format';
import type { TransferItem } from '../transfer/manager';
import { EASE } from './motion';

const STATUS: Record<TransferItem['status'], string> = {
  pending: 'Esperando',
  active: 'Enviando',
  done: 'Listo',
  cancelled: 'Cancelado',
  error: 'Falló',
};

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

function Pill({ onClick, children, primary = false, label }: { onClick: () => void; children: React.ReactNode; primary?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`press inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold ${
        primary ? 'bg-ink text-on-ink' : 'bg-surface text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Row({ item, onCancel }: { item: TransferItem; onCancel: (i: TransferItem) => void }) {
  const [done, setDone] = useState(false);
  const pct = item.size > 0 ? Math.min(100, (item.transferred / item.size) * 100) : item.status === 'done' ? 100 : 0;
  const running = item.status === 'pending' || item.status === 'active';
  const incoming = item.dir === 'in';
  const failed = item.status === 'cancelled' || item.status === 'error';

  const flash = () => {
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  const copy = () => void navigator.clipboard?.writeText(item.text ?? '').then(flash);

  return (
    <m.li
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE } }}
      className={`rounded-lg bg-mist px-5 py-4 ${failed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-4">
        <span className={incoming ? 'text-brand' : 'text-muted'} aria-label={incoming ? 'Recibido' : 'Enviado'} role="img">
          {incoming ? <ArrowDown size={22} weight="bold" /> : <ArrowUp size={22} weight="bold" />}
        </span>

        <div className="min-w-0 flex-1">
          {item.kind === 'text' ? (
            <p className="line-clamp-4 whitespace-pre-wrap break-words text-[17px] leading-snug">{item.text}</p>
          ) : (
            <>
              <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{item.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted">
                {item.executable && (
                  <span className="inline-flex items-center gap-1 text-danger" title="Archivo ejecutable: ábrelo solo si confías en quien lo envió">
                    <Warning size={14} weight="bold" aria-hidden="true" /> Ejecutable ·
                  </span>
                )}
                {formatSize(item.size)} · {item.note ?? STATUS[item.status]}
              </p>
            </>
          )}
        </div>

        {item.kind === 'text' && incoming && (
          <Pill onClick={copy} primary={!done}>
            {done ? <Check size={18} weight="bold" aria-hidden="true" /> : <Copy size={18} weight="bold" aria-hidden="true" />}
            {done ? 'Copiado' : 'Copiar'}
          </Pill>
        )}
        {item.kind === 'file' && running && (
          <button
            type="button"
            onClick={() => onCancel(item)}
            aria-label="Cancelar"
            className="press flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
          >
            <X size={18} weight="bold" />
          </button>
        )}
        {item.kind === 'file' && incoming && item.status === 'done' && item.blob && (
          <Pill
            primary={!done}
            onClick={() => {
              download(item);
              flash();
            }}
          >
            {done ? <Check size={18} weight="bold" aria-hidden="true" /> : <DownloadSimple size={18} weight="bold" aria-hidden="true" />}
            Descargar
          </Pill>
        )}
        {item.kind === 'file' && !incoming && item.status === 'done' && (
          <Check size={20} weight="bold" className="mr-2 text-mint-ink" aria-label="Enviado" />
        )}
      </div>

      {item.kind === 'file' && running && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <m.div className="h-full rounded-full bg-brand" animate={{ width: `${pct}%` }} transition={{ duration: 0.2, ease: 'linear' }} />
        </div>
      )}
    </m.li>
  );
}

export function TransferList({ items, onCancel }: { items: TransferItem[]; onCancel: (i: TransferItem) => void }) {
  return (
    <ul className="mt-3 grid gap-2">
      <AnimatePresence initial={false}>
        {[...items].reverse().map((i) => (
          <Row key={i.key} item={i} onCancel={onCancel} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
