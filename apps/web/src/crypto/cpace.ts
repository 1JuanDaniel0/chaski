// CPace (draft-irtf-cfrg-cpace), suite CPACE-RISTRETTO255-SHA512, modo iniciador-respondedor.
// Sirve para emparejar con un código corto (RF6, protocolo §9): quien no sabe el código solo puede adivinar una
// vez por intento, en vivo. ristretto255 viene de @noble/curves (WebCrypto no lo trae); los hashes van con WebCrypto.
import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js';

const Point = ristretto255.Point;
type RistrettoPoint = InstanceType<typeof Point>;
const enc = new TextEncoder();

const DSI = enc.encode('CPaceRistretto255');
const DSI_ISK = enc.encode('CPaceRistretto255_ISK');
const MAC_LABEL = enc.encode('CPaceMac');
/** Tamaño de bloque de SHA-512: el relleno de ceros del generador lo completa (draft §7.1). */
const H_BLOCK_BYTES = 128;
export const SHARE_BYTES = 32;
export const TAG_BYTES = 64;

export type Role = 'initiator' | 'responder';

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Largo en LEB128 seguido de los datos. */
export function prependLen(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const len: number[] = [];
  let l = data.length;
  do {
    let b = l & 0x7f;
    l >>>= 7;
    if (l) b |= 0x80;
    len.push(b);
  } while (l);
  return concat(Uint8Array.from(len), data);
}

export function lvCat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  return concat(...parts.map(prependLen));
}

async function sha512(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-512', data));
}

async function hmacSha512(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** Generador que depende del código (PRS), del canal (CI) y de la sesión (sid). */
export async function calculateGenerator(prs: Uint8Array, ci: Uint8Array, sid: Uint8Array): Promise<RistrettoPoint> {
  const zpad = Math.max(0, H_BLOCK_BYTES - 1 - prependLen(prs).length - prependLen(DSI).length);
  const gen = await sha512(lvCat(DSI, prs, new Uint8Array(zpad), ci, sid));
  return ristretto255_hasher.deriveToCurve!(gen);
}

/** Escalar a partir de bytes little-endian (reducido módulo el orden del grupo). */
export function scalarFromBytes(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]!);
  return Point.Fn.create(n);
}

function sampleScalar(): bigint {
  // 64 bytes aleatorios reducidos módulo el orden: el sesgo es despreciable.
  for (;;) {
    const s = scalarFromBytes(crypto.getRandomValues(new Uint8Array(64)));
    if (s !== 0n) return s;
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

export class CPaceError extends Error {}

/** Un lado de una corrida de CPace con confirmación explícita (Ta y Tb). */
export class CPace {
  private isk: Uint8Array<ArrayBuffer> | null = null;
  private macKey: Uint8Array<ArrayBuffer> | null = null;
  private sides: [Uint8Array, Uint8Array] | null = null;

  private constructor(
    private readonly role: Role,
    private readonly sid: Uint8Array,
    private readonly ad: Uint8Array,
    private scalar: bigint | null,
    readonly share: Uint8Array<ArrayBuffer>,
  ) {}

  /** `scalar` solo para pruebas con vectores fijos; si falta, se sortea. */
  static async start(opts: { role: Role; prs: Uint8Array; ci: Uint8Array; sid: Uint8Array; ad?: Uint8Array; scalar?: bigint }): Promise<CPace> {
    const g = await calculateGenerator(opts.prs, opts.ci, opts.sid);
    const y = opts.scalar ?? sampleScalar();
    const share = new Uint8Array(g.multiply(y).toBytes());
    return new CPace(opts.role, opts.sid, opts.ad ?? new Uint8Array(0), y, share);
  }

  /** Procesa el mensaje del otro lado y calcula la clave intermedia (ISK). Solo se puede llamar una vez. */
  async derive(peerShare: Uint8Array, peerAd: Uint8Array = new Uint8Array(0)): Promise<Uint8Array<ArrayBuffer>> {
    const y = this.scalar;
    this.scalar = null;
    if (y === null) throw new CPaceError('derive solo se llama una vez');
    if (peerShare.length !== SHARE_BYTES) throw new CPaceError('mensaje del otro lado con largo inválido');
    let peer: RistrettoPoint;
    try {
      peer = Point.fromBytes(peerShare);
    } catch {
      throw new CPaceError('el otro lado envió un punto inválido');
    }
    const k = peer.multiply(y);
    if (k.is0()) throw new CPaceError('el otro lado envió el neutro');
    const mine = lvCat(this.share, this.ad);
    const theirs = lvCat(peerShare, peerAd);
    // Ta autentica (Ya, ADa) y Tb (Yb, ADb): el orden del transcript es siempre iniciador, respondedor.
    this.sides = this.role === 'initiator' ? [mine, theirs] : [theirs, mine];
    const isk = await sha512(concat(lvCat(DSI_ISK, this.sid, k.toBytes()), this.sides[0], this.sides[1]));
    this.isk = isk;
    this.macKey = await sha512(concat(MAC_LABEL, this.sid, isk));
    return isk;
  }

  /** Etiqueta de confirmación propia (Ta si es iniciador, Tb si es respondedor). */
  tag(): Promise<Uint8Array<ArrayBuffer>> {
    return this.mac(this.role === 'initiator' ? 0 : 1);
  }

  /** Comprueba que el otro lado obtuvo la misma clave, es decir, que conoce el código. */
  async verify(peerTag: Uint8Array): Promise<boolean> {
    if (!this.sides) throw new CPaceError('falta derive');
    // Quien solo refleja nuestro mensaje no prueba nada.
    if (equalBytes(this.sides[0], this.sides[1])) return false;
    return equalBytes(peerTag, await this.mac(this.role === 'initiator' ? 1 : 0));
  }

  private async mac(i: 0 | 1): Promise<Uint8Array<ArrayBuffer>> {
    if (!this.sides || !this.macKey) throw new CPaceError('falta derive');
    return hmacSha512(this.macKey, concat(this.sides[i]));
  }

  get key(): Uint8Array<ArrayBuffer> {
    if (!this.isk) throw new CPaceError('falta derive');
    return this.isk;
  }
}
