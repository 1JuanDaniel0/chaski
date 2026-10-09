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
/** Sin respuesta a un ping en este tiempo, el socket se da por muerto (p. ej. TCP colgado al cambiar de red). */
const PONG_TIMEOUT_MS = 10_000;
/** Plazo de {@link SignalingClient.probe}. */
const PROBE_MS = 5_000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private peerId: string | null = null;
  private replay = new ReplayGuard();
  private queue: Promise<void> = Promise.resolve();
  private sendQueue: Promise<void> = Promise.resolve();
  private closed = false;
  /** Desde cuándo esperamos respuesta a un ping (null si nada pendiente). */
  private pingSince: number | null = null;

  /**
   * @param resume token aleatorio de esta sesión. Si el socket se cae, {@link connect} vuelve a unirse con él y el
   * servidor reemplaza el socket viejo (si aún no lo vio caer) conservando el mismo peerId.
   */
  constructor(
    private url: string,
    private keys: RoomKeys,
    private h: SignalingHandlers,
    private resume?: string,
  ) {}

  /** Abre el WebSocket y se une a la sala. Se puede volver a llamar tras {@link SignalingHandlers.onClose}. */
  connect(): void {
    if (this.closed) return;
    this.stopPing();
    this.ws?.close();
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId: this.keys.roomId, v: 1, ...(this.resume ? { resume: this.resume } : {}) }));
      this.pingSince = null;
      this.pingTimer = setInterval(() => {
        if (this.pingSince !== null && Date.now() - this.pingSince > PONG_TIMEOUT_MS) this.drop(ws);
        else this.ping();
      }, PING_MS);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      this.pingSince = null;
      const msg = parseServerMessage(ev.data);
      if (!msg) return;
      // Serializa para respetar el orden pese al descifrado asíncrono.
      this.queue = this.queue.then(() => this.handle(msg)).catch(() => undefined);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (!this.closed) this.h.onClose();
    };
    ws.onerror = () => undefined;
  }

  /** Comprueba ya que el socket siga vivo (al volver la red o la pestaña); si no responde, lo cierra. */
  probe(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    this.ping();
    const since = this.pingSince;
    setTimeout(() => {
      if (this.ws === ws && this.pingSince === since) this.drop(ws);
    }, PROBE_MS);
  }

  private ping(): void {
    this.pingSince ??= Date.now();
    this.raw({ type: 'ping' });
  }

  /** Cierra un socket que no responde y avisa como si se hubiera caído. */
  private drop(ws: WebSocket): void {
    if (this.ws !== ws) return;
    this.ws = null;
    this.stopPing();
    ws.close();
    if (!this.closed) this.h.onClose();
  }

  /** WebSocket abierto (no garantiza que ya se haya unido a la sala). */
  get active(): boolean {
    return this.ws !== null;
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
    this.ws = null;
  }

  private raw(obj: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
