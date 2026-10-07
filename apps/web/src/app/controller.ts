import { deriveKeys, generateSecret, parseSecret, secretToString } from '../crypto/keys';
import { cleanDeviceLabel, describeDevice } from '../lib/device';
import { SignalingClient } from '../signaling/client';
import type { SignalPayload, TurnConfig } from '../signaling/messages';
import { TransferManager, type ChannelLike, type TransferItem } from '../transfer/manager';
import { PeerLink } from '../transfer/peer';
import { QR_EXPIRY_MS, SIGNAL_URL } from './config';
import { sharePending, takeShared, type Shared } from './share';

export type Phase = 'scan' | 'starting' | 'waiting' | 'connecting' | 'connected' | 'peer-left' | 'kicked' | 'error';

export interface View {
  phase: Phase;
  shareUrl: string | null;
  isOwner: boolean;
  peerDevice: string | null;
  items: TransferItem[];
  warning: string | null;
  error: string | null;
  /** Lo compartido desde Android que espera a conectarse para enviarse. */
  outbox: Shared | null;
}

const INITIAL: View = { phase: 'starting', shareUrl: null, isOwner: false, peerDevice: null, items: [], warning: null, error: null, outbox: null };

const ERRORS: Record<string, string> = {
  'room-full': 'La sala ya tiene dos dispositivos.',
  'rate-limited': 'Demasiados intentos. Espera un momento.',
  'unsupported-version': 'Versión incompatible. Recarga la página.',
};

export class Controller {
  private view: View = INITIAL;
  private listeners = new Set<() => void>();
  private gen = 0;
  private sig: SignalingClient | null = null;
  private link: PeerLink | null = null;
  private manager: TransferManager | null = null;
  private remote: string | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private readonly t0 = performance.now();
  private initialized = false;
  private last: { secret: Uint8Array<ArrayBuffer>; scanned: boolean } | null = null;
  private linked = false;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): View => this.view;

  private set(p: Partial<View>): void {
    this.view = { ...this.view, ...p };
    for (const l of this.listeners) l();
  }

  /** Arranca con el secreto del hash (dispositivo que escanea) o uno nuevo. */
  init(): void {
    // Idempotente: StrictMode ejecuta los efectos dos veces y la segunda ya no vería el hash.
    if (this.initialized) return;
    this.initialized = true;
    const m = /^#k=([A-Za-z0-9_-]+)$/.exec(location.hash);
    const scanned = m ? parseSecret(m[1]!) : null;
    const share = !scanned && sharePending();
    if (location.hash || share) history.replaceState(null, '', location.pathname + (share ? '' : location.search));
    if (share) {
      // Vino de "Compartir con Chaski": primero hay que escanear el QR de la PC desde la app.
      this.set({ phase: 'scan' });
      void takeShared().then((outbox) => (outbox ? this.set({ outbox }) : this.newRoom()));
    } else void this.start(scanned ?? generateSecret(), scanned !== null);
    // Si se cayó antes de emparejar, reintenta solo al volver la red.
    addEventListener('online', () => {
      if (this.view.phase === 'error' && !this.linked) this.retry();
    });
  }

  newRoom(): void {
    void this.start(generateSecret(), false);
  }

  /** Se une a la sala de otro dispositivo (QR escaneado dentro de la app). */
  join(secret: Uint8Array<ArrayBuffer>): void {
    void this.start(secret, true);
  }

  /** Descarta lo compartido y sigue con el flujo normal. */
  discardShare(): void {
    this.set({ outbox: null });
    this.newRoom();
  }

  /** Vuelve a intentar con la misma sala: el QR ya escaneado sigue sirviendo. */
  retry(): void {
    if (this.last) void this.start(this.last.secret, this.last.scanned);
  }

  private teardown(): void {
    this.gen++;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.manager?.close();
    this.link?.close();
    this.sig?.close();
    this.manager = null;
    this.link = null;
    this.sig = null;
    this.remote = null;
  }

  private async start(secret: Uint8Array<ArrayBuffer>, scanned: boolean): Promise<void> {
    this.teardown();
    this.last = { secret, scanned };
    this.linked = false;
    const gen = this.gen;
    const alive = () => gen === this.gen;
    this.set({
      ...INITIAL,
      outbox: this.view.outbox,
      shareUrl: scanned ? null : `${location.origin}/#k=${secretToString(secret)}`,
    });
    const keys = await deriveKeys(secret);
    if (!alive()) return;
    let turn: TurnConfig | undefined;
    let joined = false;

    const sendSig = (p: SignalPayload) => {
      if (this.sig && this.remote) this.sig.sendSignal(this.remote, p).catch(() => undefined);
    };
    const makeLink = (initiator: boolean) => {
      this.link = new PeerLink({
        turn,
        initiator,
        sendSignal: sendSig,
        onChannel: (ch) => this.onChannel(ch, gen),
        onFailed: () => {
          if (alive()) this.set({ phase: 'error', error: 'No se pudo establecer la conexión directa.' });
        },
      });
    };

    this.sig = new SignalingClient(SIGNAL_URL, keys, {
      onMessage: (msg) => {
        if (!alive()) return;
        switch (msg.type) {
          case 'joined': {
            joined = true;
            turn = msg.turn;
            const owner = msg.peers.length === 0;
            this.set({ isOwner: owner });
            if (owner) {
              this.set({ phase: 'waiting' });
              if (!scanned) this.expiry = setTimeout(() => alive() && this.newRoom(), QR_EXPIRY_MS);
            } else {
              this.remote = msg.peers[0]!;
              this.set({ phase: 'connecting' });
              sendSig({ kind: 'hello', device: describeDevice(navigator.userAgent) });
              makeLink(false);
            }
            break;
          }
          case 'peer-joined':
            if (this.remote) return;
            this.remote = msg.peerId;
            if (this.expiry) clearTimeout(this.expiry);
            this.expiry = null;
            this.set({ phase: 'connecting' });
            sendSig({ kind: 'hello', device: describeDevice(navigator.userAgent) });
            makeLink(true);
            void this.link!.start().catch(() => this.set({ phase: 'error', error: 'Falló la negociación.' }));
            break;
          case 'peer-left':
            if (msg.peerId !== this.remote) return;
            this.manager?.close();
            this.link?.close();
            this.manager = null;
            this.link = null;
            this.remote = null;
            this.set({ phase: 'peer-left' });
            break;
          case 'kicked':
            this.teardown();
            this.set({ phase: 'kicked' });
            break;
          case 'error':
            this.set({ phase: 'error', error: ERRORS[msg.code] ?? `Error del servidor (${msg.code}).` });
            break;
        }
      },
      onSignal: (from, p) => {
        if (!alive() || from !== this.remote) return;
        if (p.kind === 'hello') this.set({ peerDevice: cleanDeviceLabel(p.device) });
        else void this.link?.handleSignal(p).catch(() => undefined);
      },
      onTamper: () => {
        if (alive()) this.set({ warning: 'No se pudo verificar un mensaje de la conexión: pudo ser alterada. Se descartó.' });
      },
      onClose: () => {
        if (!alive()) return;
        if (!joined) this.set({ phase: 'error', error: 'Sin conexión con el servidor' });
        else if (this.view.phase === 'waiting' && !scanned) this.newRoom();
      },
    });
    this.sig.connect();
  }

  private onChannel(ch: RTCDataChannel, gen: number): void {
    const adapter: ChannelLike = {
      send: (d) => ch.send(d as string),
      get bufferedAmount() {
        return ch.bufferedAmount;
      },
      onDrain: null,
    };
    const open = () => {
      if (gen !== this.gen) return;
      const mgr = new TransferManager(adapter, (items) => gen === this.gen && this.set({ items }), this.view.isOwner);
      this.manager = mgr;
      ch.onmessage = (e) => mgr.onMessage(e.data);
      this.linked = true;
      this.set({ phase: 'connected' });
      void this.reportRoute();
      const out = this.view.outbox;
      if (out) {
        this.set({ outbox: null });
        if (out.text) mgr.sendText(out.text);
        for (const f of out.files) mgr.sendFile(f);
      }
    };
    ch.onbufferedamountlow = () => adapter.onDrain?.();
    ch.onclose = () => {
      adapter.onDrain?.();
      if (gen === this.gen) this.manager?.close();
    };
    if (ch.readyState === 'open') open();
    else ch.onopen = open;
  }

  private async reportRoute(): Promise<void> {
    const gen = this.gen;
    const route = (await this.link?.detectRoute()) ?? 'failed';
    if (gen === this.gen) this.sig?.report(route, Math.round(performance.now() - this.t0));
  }

  // ---- Acciones de UI ----
  sendFiles(files: FileList | File[]): void {
    for (const f of Array.from(files)) this.manager?.sendFile(f);
  }
  sendText(text: string): void {
    if (text.trim()) this.manager?.sendText(text);
  }
  cancel(item: TransferItem): void {
    this.manager?.cancel(item.dir, item.id);
  }
  kick(): void {
    if (this.sig && this.remote) this.sig.kick(this.remote);
  }
  dismissWarning(): void {
    this.set({ warning: null });
  }
}
