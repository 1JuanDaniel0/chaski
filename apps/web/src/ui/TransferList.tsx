import { useState } from 'react';
import { formatSize } from '../lib/format';
import type { TransferItem } from '../transfer/manager';

const STATUS: Record<TransferItem['status'], string> = {
  pending: 'Esperando aceptación…',
  active: 'En curso',
  done: 'Listo',
  cancelled: 'Cancelado',
  error: 'Error',
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

function Row({ item, onCancel }: { item: TransferItem; onCancel: (i: TransferItem) => void }) {
  const [copied, setCopied] = useState(false);
  const pct = item.size > 0 ? Math.min(100, Math.round((item.transferred / item.size) * 100)) : item.status === 'done' ? 100 : 0;
  const running = item.status === 'pending' || item.status === 'active';
  const copy = () => {
    void navigator.clipboard?.writeText(item.text ?? '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <li className="item">
      <div className="item-head">
        <span className="dir" aria-label={item.dir === 'in' ? 'Recibido' : 'Enviado'}>
          {item.dir === 'in' ? '↓' : '↑'}
        </span>
        <span className="name">{item.name}</span>
        {item.executable && <span className="badge warn" title="Archivo ejecutable: no lo abras si no confías en quien lo envió">⚠ Ejecutable</span>}
      </div>
      {item.kind === 'text' ? (
        <>
          <pre className="text">{item.text}</pre>
          <div className="actions">
            <button type="button" onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="meta">
            {item.mime || 'tipo desconocido'} · {formatSize(item.size)} · {STATUS[item.status]}
            {item.note ? ` · ${item.note}` : ''}
          </div>
          <progress max={100} value={pct} aria-label={`Progreso ${pct}%`} />
          <div className="actions">
            {running && <button type="button" onClick={() => onCancel(item)}>Cancelar</button>}
            {item.dir === 'in' && item.status === 'done' && item.blob && (
              <button type="button" className="primary" onClick={() => download(item)}>Descargar</button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function TransferList({ items, onCancel }: { items: TransferItem[]; onCancel: (i: TransferItem) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="items">
      {[...items].reverse().map((i) => (
        <Row key={i.key} item={i} onCancel={onCancel} />
      ))}
    </ul>
  );
}
