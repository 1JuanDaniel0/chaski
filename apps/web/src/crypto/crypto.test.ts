import { hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode } from './base64url';
import { buildAad, decryptSignal, encryptSignal, ReplayGuard } from './aead';
import { deriveKeys, deriveRoomBytes, deriveSigBytes, parseSecret } from './keys';

const secret = new Uint8Array(Array.from({ length: 16 }, (_, i) => i));
// Vector fijo para contrastar con el lado Java: secreto 0x00..0x0f.
const ROOM_ID_B64URL = '4BZEvLZec_lQv2QMaGIN6A';
const SECRET_B64URL = 'AAECAwQFBgcICQoLDA0ODw';

describe('base64url', () => {
  it('roundtrip para varios tamaños', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 16, 255, 1000]) {
      const b = new Uint8Array(randomBytes(n));
      const s = b64urlEncode(b);
      expect(s).not.toMatch(/[+/=]/);
      expect(Buffer.from(b64urlDecode(s)).equals(Buffer.from(b))).toBe(true);
      expect(s).toBe(Buffer.from(b).toString('base64url'));
    }
  });
  it('rechaza caracteres inválidos', () => {
    expect(() => b64urlDecode('ab+/')).toThrow();
    expect(() => b64urlDecode('a')).toThrow();
  });
  it('parseSecret', () => {
    expect(parseSecret(SECRET_B64URL)).toEqual(secret);
    expect(parseSecret('corto')).toBeNull();
  });
});

describe('HKDF', () => {
  it('roomId y k_sig coinciden con node:crypto', async () => {
    const ikm = Buffer.from(secret);
    const room = Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), 'chasqui/room/v1', 16));
    const sig = Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), 'chasqui/sig/v1', 32));
    expect(Buffer.from(await deriveRoomBytes(secret)).equals(room)).toBe(true);
    expect(Buffer.from(await deriveSigBytes(secret)).equals(sig)).toBe(true);
    expect(room.toString('hex')).toBe('e01644bcb65e73f950bf640c68620de8');
    expect(sig.toString('hex')).toBe('7645b7cb1c5e8c4bb08ccb57eba36686376217fe6a947992a20f36da69f0a31c');
    expect((await deriveKeys(secret)).roomId).toBe(ROOM_ID_B64URL);
  });
  it('k_sig no es exportable', async () => {
    const { kSig } = await deriveKeys(secret);
    expect(kSig.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', kSig)).rejects.toThrow();
  });
});

describe('AES-GCM de señalización', () => {
  const aad = (seq = 1) => buildAad('room', 'peerA', seq);
  it('AAD con el formato del protocolo', () => {
    expect(new TextDecoder().decode(buildAad('R', 'P', 7))).toBe('chasqui/v1|R|P|7');
  });
  it('roundtrip', async () => {
    const { kSig } = await deriveKeys(secret);
    const data = await encryptSignal(kSig, '{"kind":"hello","device":"x"}', aad());
    expect(await decryptSignal(kSig, data, aad())).toBe('{"kind":"hello","device":"x"}');
  });
  it('IV distinto en cada mensaje', async () => {
    const { kSig } = await deriveKeys(secret);
    expect(await encryptSignal(kSig, 'a', aad())).not.toBe(await encryptSignal(kSig, 'a', aad()));
  });
  it('ciphertext alterado falla', async () => {
    const { kSig } = await deriveKeys(secret);
    const raw = b64urlDecode(await encryptSignal(kSig, 'hola', aad()));
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    await expect(decryptSignal(kSig, b64urlEncode(raw), aad())).rejects.toThrow();
  });
  it('AAD incorrecto falla (seq, emisor, sala)', async () => {
    const { kSig } = await deriveKeys(secret);
    const data = await encryptSignal(kSig, 'hola', aad(1));
    await expect(decryptSignal(kSig, data, aad(2))).rejects.toThrow();
    await expect(decryptSignal(kSig, data, buildAad('room', 'peerB', 1))).rejects.toThrow();
    await expect(decryptSignal(kSig, data, buildAad('otra', 'peerA', 1))).rejects.toThrow();
  });
  it('clave equivocada falla', async () => {
    const { kSig } = await deriveKeys(secret);
    const other = await deriveKeys(new Uint8Array(16).fill(9));
    const data = await encryptSignal(kSig, 'hola', aad());
    await expect(decryptSignal(other.kSig, data, aad())).rejects.toThrow();
  });
  it('mensaje truncado falla', async () => {
    const { kSig } = await deriveKeys(secret);
    await expect(decryptSignal(kSig, 'AAAA', aad())).rejects.toThrow();
  });
});

describe('ReplayGuard', () => {
  it('rechaza seq repetido o menor, por remitente', () => {
    const g = new ReplayGuard();
    expect(g.accept('a', 1)).toBe(true);
    expect(g.accept('a', 1)).toBe(false);
    expect(g.accept('a', 3)).toBe(true);
    expect(g.accept('a', 2)).toBe(false);
    expect(g.accept('b', 1)).toBe(true);
    expect(g.accept('a', 0)).toBe(false);
    expect(g.accept('a', 1.5)).toBe(false);
  });
  it('isFresh no avanza el contador', () => {
    const g = new ReplayGuard();
    expect(g.isFresh('a', 5)).toBe(true);
    expect(g.isFresh('a', 5)).toBe(true);
  });
});
