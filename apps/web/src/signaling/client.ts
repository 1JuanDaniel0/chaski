import { buildAad, decryptSignal, encryptSignal, ReplayGuard } from '../crypto/aead';
import type { RoomKeys } from '../crypto/keys';
import { parseServerMessage, parseSignalPayload, type Route, type ServerMessage, type SignalPayload } from './messages';

export interface SignalingHandlers {
  onMessage(msg: Exclude<ServerMessage, { type: 'signal' } | { type: 'pong' }>): void;
  onSignal(from: string, payload: SignalPayload): void;
  /** Descifrado fallido o repetición: posible alteración. */
  onTamper(from: string): void;
  onClose(): void;
}

const PING_MS = 25_000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private peerId: string | null = null;
  private replay = new ReplayGuard();
  private queue: Promise<void> = Promise.resolve();
  private sendQueue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private url: string,
    private keys: RoomKeys,
    private h: SignalingHandlers,
  ) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId: this.keys.roomId, v: 1 }));
      this.pingTimer = setInterval(() => this.raw({ type: 'ping' }), PING_MS);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const msg = parseServerMessage(ev.data);
      if (!msg) return;
      // Serializa para respetar el orden pese al descifrado asíncrono.
      this.queue = this.queue.then(() => this.handle(msg)).catch(() => undefined);
    };
    ws.onclose = () => {
      this.stopPing();
      if (!this.closed) {
        this.closed = true;
        this.h.onClose();
      }
    };
    ws.onerror = () => undefined;
  }

  private async handle(msg: ServerMessage): Promise<void> {
    if (this.closed) return;
    if (msg.type === 'pong') return;
    if (msg.type === 'joined') this.peerId = msg.peerId;
    if (msg.type !== 'signal') {
      this.h.onMessage(msg);
      return;
    }
    if (!this.replay.isFresh(msg.from, msg.seq)) {
      this.h.onTamper(msg.from);
      return;
    }
    let plain: string;
    try {
      plain = await decryptSignal(this.keys.kSig, msg.data, buildAad(this.keys.roomId, msg.from, msg.seq));
    } catch {
      this.h.onTamper(msg.from);
      return;
    }
    this.replay.accept(msg.from, msg.seq);
    const payload = parseSignalPayload(plain);
    if (payload) this.h.onSignal(msg.from, payload);
  }

  /** Serializado: seq y orden de envío deben coincidir pese al cifrado asíncrono. */
  sendSignal(to: string, payload: SignalPayload): Promise<void> {
    const run = async () => {
      if (!this.peerId) throw new Error('aún no unido');
      const seq = ++this.seq;
      const data = await encryptSignal(this.keys.kSig, JSON.stringify(payload), buildAad(this.keys.roomId, this.peerId, seq));
      this.raw({ type: 'signal', to, seq, data });
    };
    const p = this.sendQueue.then(run);
    this.sendQueue = p.catch(() => undefined);
    return p;
  }

  kick(peerId: string): void {
    this.raw({ type: 'kick', peerId });
  }

  report(route: Route, ms: number): void {
    this.raw({ type: 'report', route, ms });
  }

  close(): void {
    this.closed = true;
    this.stopPing();
    this.ws?.close();
  }

  private raw(obj: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
