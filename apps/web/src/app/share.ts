import { parseSecret } from '../crypto/keys';

/** Lo que llegó con "Compartir con Chaski" (Android). Vive solo en memoria hasta enviarse. */
export interface Shared {
  files: File[];
  text: string;
}

const CACHE = 'chaski-share';

export const sharePending = (): boolean => new URLSearchParams(location.search).has('share');

/** Lee lo que dejó el service worker y lo borra del navegador en el acto. */
export async function takeShared(): Promise<Shared | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE);
  const files: File[] = [];
  let text = '';
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    if (!res) continue;
    if (new URL(req.url).pathname === '/share/text') text = await res.text();
    else {
      const name = decodeURIComponent(res.headers.get('x-name') ?? 'archivo');
      files.push(new File([await res.blob()], name, { type: res.headers.get('content-type') ?? '' }));
    }
  }
  await caches.delete(CACHE);
  return files.length || text ? { files, text } : null;
}

/** Secreto de sala desde el texto de un QR de Chaski; null si el QR es de otra cosa. */
export function secretFromQr(raw: string): Uint8Array<ArrayBuffer> | null {
  try {
    const url = new URL(raw);
    const chaski = url.protocol === 'https:' && (url.hostname === 'chaski.me' || url.hostname.endsWith('.chaski.me'));
    if (!chaski && url.origin !== location.origin) return null;
    const m = /^#k=([A-Za-z0-9_-]+)$/.exec(url.hash);
    return m ? parseSecret(m[1]!) : null;
  } catch {
    return null;
  }
}

export function registerShareWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
