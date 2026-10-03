export type CancelReason = 'user' | 'too-large' | 'error';

export type Control =
  | { t: 'file-offer'; id: number; name: string; size: number; mime: string }
  | { t: 'file-accept'; id: number }
  | { t: 'file-cancel'; id: number; reason: CancelReason }
  | { t: 'file-done'; id: number }
  | { t: 'text'; id: number; text: string };

const MAX_TEXT = 200_000;

function isU32(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

/** Parseo estricto de frames de control; devuelve null si no es válido. */
export function parseControl(raw: string): Control | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  if (!isU32(o.id)) return null;
  switch (o.t) {
    case 'file-offer':
      if (typeof o.name !== 'string' || typeof o.mime !== 'string') return null;
      if (typeof o.size !== 'number' || !Number.isSafeInteger(o.size) || o.size < 0) return null;
      return { t: 'file-offer', id: o.id, name: o.name.slice(0, 1024), size: o.size, mime: o.mime.slice(0, 255) };
    case 'file-accept':
      return { t: 'file-accept', id: o.id };
    case 'file-done':
      return { t: 'file-done', id: o.id };
    case 'file-cancel': {
      const r = o.reason === 'too-large' || o.reason === 'error' ? o.reason : 'user';
      return { t: 'file-cancel', id: o.id, reason: r };
    }
    case 'text':
      if (typeof o.text !== 'string' || o.text.length > MAX_TEXT) return null;
      return { t: 'text', id: o.id, text: o.text };
    default:
      return null;
  }
}
