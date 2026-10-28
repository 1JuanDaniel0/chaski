// Sockets del emparejamiento por código (RF6, protocolo §9). Usan la misma URL de señalización que las salas,
// pero un socket aparte: solo sirven para pasar los mensajes de CPace y se cierran apenas se entrega el secreto.
import { b64urlDecode, b64urlEncode } from '../crypto/base64url';
import { generatePin, type Code } from '../crypto/code';
import type { CodeGuest, CodeHost } from '../crypto/code-pake';

/** CPace y ristretto255 se bajan aparte, solo al usar un código. */
const pake = () => import('../crypto/code-pake');

type CodeMessage =
  | { type: 'code'; slot: string; ttl: number }
  | { type: 'code-paired'; sid: string }
  | { type: 'pake'; data: string }
  | { type: 'error'; code: string };

export function parseCodeMessage(raw: string): CodeMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case 'code':
      return typeof o.slot === 'string' && /^\d{2}$/.test(o.slot) && typeof o.ttl === 'number' ? { type: 'code', slot: o.slot, ttl: o.ttl } : null;
    case 'code-paired':
      return typeof o.sid === 'string' ? { type: 'code-paired', sid: o.sid } : null;
    case 'pake':
      return typeof o.data === 'string' ? { type: 'pake', data: o.data } : null;
    case 'error':
      return typeof o.code === 'string' ? { type: 'error', code: o.code } : null;
    default:
      return null;
  }
}

/** Abre el socket y procesa los mensajes en orden (el trabajo criptográfico es asíncrono). */
function open(url: string, onOpen: (send: (o: object) => void) => void, onMsg: (m: CodeMessage) => Promise<void>, onClose: () => void) {
  const ws = new WebSocket(url);
  let queue = Promise.resolve();
  const send = (o: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o));
  };
  ws.onopen = () => onOpen(send);
  ws.onmessage = (ev) => {
    const msg = typeof ev.data === 'string' ? parseCodeMessage(ev.data) : null;
    if (msg) queue = queue.then(() => onMsg(msg)).catch(() => ws.close());
  };
  ws.onclose = () => void queue.then(onClose);
  ws.onerror = () => undefined;
  return { send, close: () => ws.close() };
}

export interface HostHandlers {
  /** Código listo para mostrar; vence en `ttlMs` si nadie lo escribe. */
  onCode(code: Code, ttlMs: number): void;
  /** Alguien escribió un PIN incorrecto: este código ya no sirve. */
  onWrong(): void;
  /** El socket se cerró: código vencido, entregado, sin casilleros libres o sin red. */
  onClosed(reason: 'done' | 'wrong' | 'busy' | 'closed'): void;
}

/** PC que muestra el código: pide un casillero y, si el otro sabe el PIN, le entrega el secreto de la sala. */
export function hostCode(url: string, secret: Uint8Array<ArrayBuffer>, h: HostHandlers): { close(): void } {
  let code: Code | null = null;
  let host: CodeHost | null = null;
  let reason: 'done' | 'wrong' | 'busy' | 'closed' = 'closed';
  const sock = open(
    url,
    (send) => send({ type: 'code-open', v: 1 }),
    async (msg) => {
      if (msg.type === 'code') {
        code = { slot: msg.slot, pin: generatePin() };
        h.onCode(code, msg.ttl * 1000);
        void pake(); // se adelanta la descarga mientras alguien escribe el código
      } else if (msg.type === 'code-paired' && code) {
        const { CodeHost } = await pake();
        host = await CodeHost.start(code, b64urlDecode(msg.sid));
        sock.send({ type: 'pake', data: b64urlEncode(host.first()) });
      } else if (msg.type === 'pake' && host) {
        const { WrongCodeError } = await pake();
        try {
          const msg3 = await host.finish(b64urlDecode(msg.data), secret);
          sock.send({ type: 'pake', data: b64urlEncode(msg3) });
          reason = 'done';
        } catch (e) {
          if (!(e instanceof WrongCodeError)) throw e;
          reason = 'wrong';
          h.onWrong();
          sock.close();
        }
      } else if (msg.type === 'error' && msg.code === 'codes-busy') {
        reason = 'busy';
      }
    },
    () => h.onClosed(reason),
  );
  return sock;
}

export type GuestFailure = 'bad-code' | 'wrong' | 'rate-limited' | 'network';

/** Dispositivo que escribió el código: obtiene el secreto de la sala de la PC, o el motivo del fallo. */
export function joinCode(url: string, code: Code): { result: Promise<Uint8Array<ArrayBuffer>>; cancel(): void } {
  let guest: CodeGuest | null = null;
  let replied = false;
  let failure: GuestFailure = 'network';
  let resolve!: (s: Uint8Array<ArrayBuffer>) => void;
  let reject!: (f: GuestFailure) => void;
  const result = new Promise<Uint8Array<ArrayBuffer>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  let settled = false;
  const sock = open(
    url,
    (send) => send({ type: 'code-join', v: 1, slot: code.slot }),
    async (msg) => {
      if (msg.type === 'code-paired') {
        const { CodeGuest } = await pake();
        guest = new CodeGuest(code, b64urlDecode(msg.sid));
        // Ya hay casillero: si la conexión se corta desde aquí, lo más probable es que la PC rechazó el PIN.
        failure = 'wrong';
      } else if (msg.type === 'pake' && guest && !replied) {
        replied = true;
        sock.send({ type: 'pake', data: b64urlEncode(await guest.reply(b64urlDecode(msg.data))) });
      } else if (msg.type === 'pake' && guest) {
        const { WrongCodeError } = await pake();
        try {
          const secret = await guest.open(b64urlDecode(msg.data));
          settled = true;
          resolve(secret);
        } catch (e) {
          if (!(e instanceof WrongCodeError)) throw e;
          failure = 'wrong';
        }
        sock.close();
      } else if (msg.type === 'error') {
        if (msg.code === 'bad-code') failure = 'bad-code';
        else if (msg.code === 'rate-limited') failure = 'rate-limited';
      }
    },
    () => {
      if (!settled) reject(failure);
    },
  );
  return {
    result,
    cancel: () => {
      settled = true;
      sock.close();
    },
  };
}
