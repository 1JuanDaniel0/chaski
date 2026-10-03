import { b64urlDecode, b64urlEncode } from './base64url';

const enc = new TextEncoder();
const dec = new TextDecoder();
const IV_BYTES = 12;

export function buildAad(roomId: string, senderPeerId: string, seq: number): Uint8Array<ArrayBuffer> {
  return enc.encode(`chasqui/v1|${roomId}|${senderPeerId}|${seq}`);
}

/** base64url(iv || ct+tag) */
export async function encryptSignal(key: CryptoKey, plaintext: string, aad: Uint8Array<ArrayBuffer>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, enc.encode(plaintext)),
  );
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return b64urlEncode(out);
}

/** Lanza si la autenticación falla o el formato es inválido. */
export async function decryptSignal(key: CryptoKey, data: string, aad: Uint8Array<ArrayBuffer>): Promise<string> {
  const raw = b64urlDecode(data);
  if (raw.length < IV_BYTES + 16) throw new Error('mensaje demasiado corto');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.subarray(0, IV_BYTES), additionalData: aad, tagLength: 128 },
    key,
    raw.subarray(IV_BYTES),
  );
  return dec.decode(pt);
}

/** Rechazo de repetición: acepta solo seq estrictamente creciente por remitente. */
export class ReplayGuard {
  private last = new Map<string, number>();
  /** Comprueba sin registrar. */
  isFresh(sender: string, seq: number): boolean {
    return Number.isSafeInteger(seq) && seq > (this.last.get(sender) ?? 0);
  }
  /** Registra tras descifrar con éxito (evita que un mensaje falso avance el contador). */
  accept(sender: string, seq: number): boolean {
    if (!this.isFresh(sender, seq)) return false;
    this.last.set(sender, seq);
    return true;
  }
}
