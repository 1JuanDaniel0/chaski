import { b64urlDecode, b64urlEncode } from './base64url';

export const SECRET_BYTES = 16;
const enc = new TextEncoder();

export function generateSecret(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

export function secretToString(s: Uint8Array): string {
  return b64urlEncode(s);
}

/** Devuelve null si el texto no es un secreto válido de 16 bytes. */
export function parseSecret(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    if (s.length !== 22) return null;
    const b = b64urlDecode(s);
    return b.length === SECRET_BYTES ? b : null;
  } catch {
    return null;
  }
}

async function hkdfBits(secret: Uint8Array<ArrayBuffer>, info: string, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) },
    base,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

export const INFO_ROOM = 'chasqui/room/v1';
export const INFO_SIG = 'chasqui/sig/v1';

/** roomId crudo (16 bytes). */
export function deriveRoomBytes(secret: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return hkdfBits(secret, INFO_ROOM, 16);
}

/** k_sig crudo (32 bytes). Solo para pruebas; en la app se usa deriveKeys (no exportable). */
export function deriveSigBytes(secret: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return hkdfBits(secret, INFO_SIG, 32);
}

export interface RoomKeys {
  roomId: string;
  kSig: CryptoKey;
}

export async function deriveKeys(secret: Uint8Array<ArrayBuffer>): Promise<RoomKeys> {
  const roomId = b64urlEncode(await deriveRoomBytes(secret));
  const raw = await deriveSigBytes(secret);
  const kSig = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return { roomId, kSig };
}
