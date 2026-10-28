import { formatCode, parseCode } from '../crypto/code';
import { deriveKeys, generateSecret, parseSecret, secretToString } from '../crypto/keys';
import { cleanDeviceLabel, describeDevice } from '../lib/device';
import { SignalingClient } from '../signaling/client';
import { hostCode, joinCode, type GuestFailure } from '../signaling/code';
import type { Route, SignalPayload, TurnConfig } from '../signaling/messages';
import { TransferManager, type ChannelLike, type TransferItem } from '../transfer/manager';
import { PeerLink } from '../transfer/peer';
import { QR_EXPIRY_MS, RECONNECT, SIGNAL_URL } from './config';
import { sharePending, takeShared, type Shared } from './share';

export type Phase = 'scan' | 'code' | 'starting' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'peer-left' | 'kicked' | 'error';

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
  /** Por dónde va la conexión: directa (host/srflx) o por el relevo TURN. Null hasta saberlo. */
  route: Exclude<Route, 'failed'> | null;
  /** Código de 6 dígitos que muestra la PC junto al QR (RF6), ya formateado; null si no hay. */
  code: string | null;
  /** Pantalla "Escribe el código": verificando, o por qué falló. */
  codeChecking: boolean;
  codeError: string | null;
}

const INITIAL: View = {
  phase: 'starting',
  shareUrl: null,
  isOwner: false,
  peerDevice: null,
  items: [],
  warning: null,
  error: null,
  outbox: null,
  route: null,
  code: null,
  codeChecking: false,
  codeError: null,
};

const CODE_ERRORS: Record<GuestFailure, string> = {
  'bad-code': 'Ese código no existe o ya venció. Revisa el que muestra la otra pantalla.',
  wrong: 'El código no coincide. La otra pantalla ya muestra uno nuevo: escríbelo otra vez.',
  'rate-limited': 'Demasiados intentos. Espera un minuto.',
  network: 'Sin conexión con el servidor. Revisa tu red.',
};
/** Tope de espera entre intentos de pedir un código nuevo si el servidor no responde. */
const CODE_MAX_BACKOFF_MS = 30_000;

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
  /** Retoma la sesión ya: señalización caída o ruta directa cortada (al volver la red o la pestaña). */
  private wake: (() => void) | null = null;
  /** Socket del código que muestra la PC (RF6). */
  private codeHost: { close(): void } | null = null;
  private codeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Intento en curso de entrar con un código escrito. */
  private codeJoin: { cancel(): void } | null = null;

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
    // Si se cayó antes de emparejar, reintenta solo al volver la red. Si ya estaban conectados, retoma la sesión.
    addEventListener('online', () => {
      if (this.view.phase === 'error' && !this.linked) this.retry();
      else this.wake?.();
    });
    // Android corta el WebSocket con Chrome en segundo plano: al volver a la pestaña se retoma sin esperar.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.wake?.();
    });
  }

  newRoom(): void {
    void this.start(generateSecret(), false);
  }

  /** Se une a la sala de otro dispositivo (QR escaneado dentro de la app). */
  join(secret: Uint8Array<ArrayBuffer>): void {
    void this.start(secret, true);
  }

  /** Terminar y limpiar: borra el chat en los dos dispositivos, saca al otro y genera un QR nuevo. */
  end(): void {
    this.manager?.sendEnd();
    if (this.view.isOwner && this.sig && this.remote) this.sig.kick(this.remote);
    // Cerrar la conexión en el acto puede descartar el aviso "end": se cierra un momento después.
    const link = this.link;
    this.link = null;
    if (link) setTimeout(() => link.close(), 1000);
    this.newRoom();
  }

  /** El otro pulsó "Terminar": se borra el chat. La PC (dueña) vuelve al QR; el invitado ve el aviso. */
  private ended(): void {
    if (this.view.isOwner) {
      this.newRoom();
      return;
    }
    this.teardown();
    this.set({ phase: 'kicked', items: [] });
  }

  /** Abre el escáner para unirse a la sala de otro dispositivo (celular sin "Compartir"). */
  scan(): void {
    this.teardown();
    this.set({ ...INITIAL, phase: 'scan' });
  }

  /** Pantalla para escribir el código de otra pantalla (sin cámara, o de PC a PC). */
  enterCode(): void {
    this.teardown();
    this.set({ ...INITIAL, phase: 'code', outbox: this.view.outbox });
  }

  /** Entra a la sala de la otra pantalla con su código: CPace entrega el mismo secreto que tendría su QR. */
  submitCode(input: string): void {
    const code = parseCode(input);
    if (!code) {
      this.set({ codeError: 'El código tiene 6 dígitos.' });
      return;
    }
    this.codeJoin?.cancel();
    const attempt = joinCode(SIGNAL_URL, code);
    this.codeJoin = attempt;
    this.set({ codeChecking: true, codeError: null });
    attempt.result.then(
      (secret) => {
        if (this.codeJoin !== attempt) return;
        this.codeJoin = null;
        this.join(secret);
      },
      (f: GuestFailure) => {
        if (this.codeJoin !== attempt) return;
        this.codeJoin = null;
        this.set({ codeChecking: false, codeError: CODE_ERRORS[f] });
      },
    );
  }

  /**
   * La PC que espera muestra además un código. Si vence, se usa mal o se cae el servidor, pide otro mientras siga
   * esperando. Si no hay casilleros libres, se queda solo con el QR.
   */
  private showCode(secret: Uint8Array<ArrayBuffer>, gen: number, failures = 0): void {
    if (gen !== this.gen || this.view.phase !== 'waiting') return;
    let shown = false;
    this.codeHost = hostCode(SIGNAL_URL, secret, {
      onCode: (code) => {
        shown = true;
        if (gen === this.gen) this.set({ code: formatCode(code) });
      },
      onWrong: () => {
        if (gen === this.gen) this.set({ warning: 'Alguien escribió un código incorrecto. Ese código ya no sirve: te mostramos otro.' });
      },
      onClosed: (reason) => {
        if (gen !== this.gen) return;
        this.codeHost = null;
        this.set({ code: null });
        if (reason === 'busy') return;
        const next = shown ? 0 : failures + 1;
        // Tras entregar el secreto, el otro entra a la sala en un momento; si no llega, vuelve a haber código.
        const delay = reason === 'done' ? 5_000 : next === 0 ? 0 : Math.min(CODE_MAX_BACKOFF_MS, 1000 * 2 ** next);
        this.codeTimer = setTimeout(() => this.showCode(secret, gen, next), delay);
      },
    });
  }

  private hideCode(): void {
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.codeTimer = null;
    this.codeHost?.close();
    this.codeHost = null;
    if (this.view.code) this.set({ code: null });
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
    this.hideCode();
    this.codeJoin?.cancel();
    this.codeJoin = null;
    this.manager?.close();
    this.link?.close();
    this.sig?.close();
    this.manager = null;
    this.link = null;
    this.sig = null;
    this.remote = null;
    this.wake = null;
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

    // ---- Reconexión (RF4): solo una vez abierto el canal directo ----
    let sigRetries = 0;
    let sigTimer: ReturnType<typeof setTimeout> | null = null;
    let downSince: number | null = null;
    let checkTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRecover = -Infinity;

    /** Vuelve a la sala con el mismo token: el servidor reemplaza el socket viejo y conserva el peerId. */
    const reconnectSig = (now: boolean) => {
      if (!alive() || !this.linked || !this.sig || this.sig.active) return;
      if (sigTimer) clearTimeout(sigTimer);
      const delay = now ? 0 : Math.min(RECONNECT.maxBackoffMs, 1000 * 2 ** sigRetries++);
      sigTimer = setTimeout(() => {
        sigTimer = null;
        if (alive() && this.linked && this.sig && !this.sig.active) this.sig.connect();
      }, delay);
    };
    /** Busca una ruta nueva sin cerrar el canal: quien ofreció reinicia ICE; el otro se lo pide. */
    const recover = () => {
      const link = this.link;
      if (!alive() || !this.linked || !link) return;
      const now = performance.now();
      if (now - lastRecover < RECONNECT.minRestartGapMs) return;
      lastRecover = now;
      if (link.initiator) void link.restart().catch(() => undefined);
      else sendSig({ kind: 'restart' });
    };
    const scheduleCheck = (ms: number) => {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(check, ms);
    };
    /** Mientras la ruta directa esté caída: avisa, reintenta cada tanto y se rinde tras un rato. */
    const check = () => {
      checkTimer = null;
      if (!alive() || !this.linked || downSince === null) return;
      if (performance.now() - downSince >= RECONNECT.giveUpMs) {
        this.peerGone();
        return;
      }
      if (this.view.phase === 'connected') this.set({ phase: 'reconnecting' });
      if (this.sig && !this.sig.active && !sigTimer) reconnectSig(true);
      recover();
      scheduleCheck(RECONNECT.retryMs);
    };
    const onState = (state: RTCPeerConnectionState) => {
      if (!alive() || !this.linked) return;
      if (state === 'connected') {
        downSince = null;
        if (checkTimer) clearTimeout(checkTimer);
        checkTimer = null;
        if (this.view.phase === 'reconnecting') this.set({ phase: 'connected' });
      } else if (state === 'disconnected' || state === 'failed') {
        // "disconnected" suele arreglarse solo en un par de segundos; "failed" ya no.
        if (downSince === null) downSince = performance.now();
        if (state === 'failed') scheduleCheck(0);
        else if (!checkTimer) scheduleCheck(RECONNECT.graceMs);
      }
    };
    this.wake = () => {
      if (!alive() || !this.linked || !this.sig) return;
      if (this.sig.active) this.sig.probe();
      else {
        sigRetries = 0;
        reconnectSig(true);
      }
      if (this.link && this.link.state !== 'connected') recover();
    };

    const makeLink = (initiator: boolean) => {
      downSince = null;
      lastRecover = -Infinity;
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = null;
      this.link = new PeerLink({
        turn,
        initiator,
        sendSignal: sendSig,
        onChannel: (ch) => this.onChannel(ch, gen),
        onState,
        onFailed: () => {
          // Con el canal abierto lo maneja onState (reconexión); antes de eso, no hubo ruta.
          if (alive() && !this.linked) this.set({ phase: 'error', error: 'No se pudo establecer la conexión directa.' });
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
            if (this.linked) {
              // Volvió a la sala tras perder la señalización: el canal directo sigue siendo el mismo.
              sigRetries = 0;
              this.link?.setTurn(turn);
              if (msg.peers[0]) this.remote = msg.peers[0];
              if (this.link?.state !== 'connected') recover();
              break;
            }
            const owner = msg.peers.length === 0;
            this.set({ isOwner: owner });
            if (owner) {
              this.set({ phase: 'waiting' });
              if (!scanned) {
                this.expiry = setTimeout(() => alive() && this.newRoom(), QR_EXPIRY_MS);
                this.showCode(secret, gen);
              }
            } else {
              this.remote = msg.peers[0]!;
              this.set({ phase: 'connecting' });
              sendSig({ kind: 'hello', device: describeDevice(navigator.userAgent) });
              makeLink(false);
            }
            break;
          }
          case 'peer-joined':
            if (this.linked) {
              // El otro volvió a la sala (con otro peerId si el servidor ya había visto caer su socket).
              this.remote = msg.peerId;
              if (this.link?.state !== 'connected') recover();
              break;
            }
            if (this.remote) return;
            this.remote = msg.peerId;
            if (this.expiry) clearTimeout(this.expiry);
            this.expiry = null;
            this.hideCode();
            this.set({ phase: 'connecting' });
            sendSig({ kind: 'hello', device: describeDevice(navigator.userAgent) });
            makeLink(true);
            void this.link!.start().catch(() => this.set({ phase: 'error', error: 'Falló la negociación.' }));
            break;
          case 'peer-left':
            if (msg.peerId !== this.remote) return;
            // Con el canal directo abierto, que el otro pierda el servidor no significa que se fue:
            // Android corta el WebSocket al pasar Chrome a segundo plano (p. ej. al abrir el selector
            // de archivos) y la conexión directa sigue viva. Solo cuenta como salida si el canal se cierra.
            if (this.linked) return;
            this.peerGone();
            break;
          case 'kicked':
            // Solo llega por "Terminar" del dueño: se borra el chat igual que con el aviso "end".
            this.teardown();
            this.set({ phase: 'kicked', items: [] });
            break;
          case 'error':
            // Con la sesión en curso, un rechazo al volver a la sala (p. ej. room-full mientras el servidor no ve
            // caer el socket viejo) solo cierra el WebSocket: onClose reintenta.
            if (this.linked) break;
            this.set({ phase: 'error', error: ERRORS[msg.code] ?? `Error del servidor (${msg.code}).` });
            break;
        }
      },
      onSignal: (from, p) => {
        if (!alive() || from !== this.remote) return;
        if (p.kind === 'hello') this.set({ peerDevice: cleanDeviceLabel(p.device) });
        else if (p.kind === 'restart') recover();
        else void this.link?.handleSignal(p).catch(() => undefined);
      },
      onTamper: () => {
        if (alive()) this.set({ warning: 'No se pudo verificar un mensaje de la conexión: pudo ser alterada. Se descartó.' });
      },
      onClose: () => {
        if (!alive()) return;
        if (this.linked) reconnectSig(false);
        else if (!joined) this.set({ phase: 'error', error: 'Sin conexión con el servidor' });
        else if (this.view.phase === 'waiting' && !scanned) this.newRoom();
      },
    }, secretToString(generateSecret()));
    this.sig.connect();
  }

  /** El otro dispositivo se fue de verdad: se cierra el enlace y se muestra el aviso. */
  private peerGone(): void {
    this.manager?.close();
    this.link?.close();
    this.manager = null;
    this.link = null;
    this.remote = null;
    this.linked = false;
    this.set({ phase: 'peer-left' });
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
      const mgr = new TransferManager(adapter, (items) => gen === this.gen && this.set({ items }), this.view.isOwner, () => {
        if (gen === this.gen) this.ended();
      });
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
      if (gen !== this.gen) return;
      if (this.linked) this.peerGone();
      else this.manager?.close();
    };
    if (ch.readyState === 'open') open();
    else ch.onopen = open;
  }

  private async reportRoute(): Promise<void> {
    const gen = this.gen;
    const route = (await this.link?.detectRoute()) ?? 'failed';
    if (gen !== this.gen) return;
    this.sig?.report(route, Math.round(performance.now() - this.t0));
    this.manager?.setPaced(route === 'relay');
    this.set({ route: route === 'failed' ? null : route });
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
