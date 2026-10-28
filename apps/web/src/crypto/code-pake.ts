// Con el PIN del código como contraseña de CPace, la PC le entrega cifrado al otro dispositivo el mismo secreto
// que tendría su QR (RF6, protocolo §9). Se carga con import() para no sumar ristretto255 al JS inicial.
import type { Code } from './code';
import { CPace, CPaceError, concat, SHARE_BYTES, TAG_BYTES } from './cpace';
import { SECRET_BYTES } from './keys';

const enc = new TextEncoder();
const IV_BYTES = 12;

function channelId(slot: string): Uint8Array<ArrayBuffer> {
  return enc.encode(`chaski/code/v1|${slot}`);
}

async function encKey(isk: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', isk, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('chaski/code/key/v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Código incorrecto o mensaje alterado: el emparejamiento se aborta y el código no se vuelve a usar. */
export class WrongCodeError extends Error {}

/**
 * Lado de la PC (iniciador). Uso: `first()` envía Ya; `finish(msg2)` comprueba Tb y devuelve Ta || iv || secreto
 * cifrado. Lanza {@link WrongCodeError} si el otro no sabía el PIN.
 */
export class CodeHost {
  private constructor(
    private readonly cpace: CPace,
    private readonly slot: string,
  ) {}

  static async start(code: Code, sid: Uint8Array): Promise<CodeHost> {
    const cpace = await CPace.start({ role: 'initiator', prs: enc.encode(code.pin), ci: channelId(code.slot), sid });
    return new CodeHost(cpace, code.slot);
  }

  first(): Uint8Array<ArrayBuffer> {
    return this.cpace.share;
  }

  async finish(msg2: Uint8Array, secret: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    if (msg2.length !== SHARE_BYTES + TAG_BYTES) throw new WrongCodeError('mensaje con largo inválido');
    try {
      await this.cpace.derive(msg2.subarray(0, SHARE_BYTES));
    } catch (e) {
      if (e instanceof CPaceError) throw new WrongCodeError(e.message);
      throw e;
    }
    if (!(await this.cpace.verify(msg2.subarray(SHARE_BYTES)))) throw new WrongCodeError('código incorrecto');
    const key = await encKey(this.cpace.key, 'encrypt');
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: channelId(this.slot), tagLength: 128 }, key, secret),
    );
    return concat(await this.cpace.tag(), iv, ct);
  }
}

/**
 * Lado de quien escribe el código (respondedor). Uso: `reply(msg1)` devuelve Yb || Tb; `open(msg3)` comprueba Ta y
 * devuelve el secreto de la sala. Lanza {@link WrongCodeError} si el PIN no coincide.
 */
export class CodeGuest {
  private cpace: CPace | null = null;

  constructor(
    private readonly code: Code,
    private readonly sid: Uint8Array,
  ) {}

  async reply(msg1: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const cpace = await CPace.start({ role: 'responder', prs: enc.encode(this.code.pin), ci: channelId(this.code.slot), sid: this.sid });
    try {
      await cpace.derive(msg1);
    } catch (e) {
      if (e instanceof CPaceError) throw new WrongCodeError(e.message);
      throw e;
    }
    this.cpace = cpace;
    return concat(cpace.share, await cpace.tag());
  }

  async open(msg3: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const cpace = this.cpace;
    if (!cpace) throw new WrongCodeError('mensaje fuera de orden');
    if (msg3.length !== TAG_BYTES + IV_BYTES + SECRET_BYTES + 16) throw new WrongCodeError('mensaje con largo inválido');
    if (!(await cpace.verify(msg3.subarray(0, TAG_BYTES)))) throw new WrongCodeError('código incorrecto');
    const key = await encKey(cpace.key, 'decrypt');
    try {
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: msg3.slice(TAG_BYTES, TAG_BYTES + IV_BYTES), additionalData: channelId(this.code.slot), tagLength: 128 },
        key,
        msg3.slice(TAG_BYTES + IV_BYTES),
      );
      return new Uint8Array(pt);
    } catch {
      throw new WrongCodeError('mensaje alterado');
    }
  }
}
