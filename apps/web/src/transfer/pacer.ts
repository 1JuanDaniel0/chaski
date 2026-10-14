/** El receptor confirma lo recibido (`file-ack`) con cada trozo, pero no más seguido que esto. */
export const ACK_MIN_GAP_MS = 10;
/** Si en este tiempo no llega ninguna confirmación, se envía un trozo igual (y, si nunca llegó ninguna, sin ventana). */
export const ACK_TIMEOUT_MS = 2000;

const MIN_WINDOW = 64 * 1024;
const MAX_WINDOW = 16 * 1024 * 1024;
/** Cola en el camino que se tolera (bytes): se crece por debajo de alpha y se baja por encima de beta. */
const alpha = (w: number) => Math.max(32 * 1024, w / 16);
const beta = (w: number) => Math.max(80 * 1024, w / 6);
/** Lo mínimo que cambia la ventana por vuelta fuera del arranque. */
const STEP = 32 * 1024;
/** En el arranque la ventana crece así por vuelta: el exceso de una vuelta, hasta que se nota la cola, va a parar a la cola del camino. */
const STARTUP_GAIN = 1.3;
/** El ritmo de envío es la ventana repartida en un RTT, un poco por encima para que la ventana pueda llenarse. */
const PACING_GAIN = 1.25;
/** Lo más que se suelta seguido, en milisegundos de ritmo. */
const BURST_MS = 5;
/**
 * Cada tanto la ventana baja a un cuarto durante dos vueltas para volver a medir el RTT sin cola, por si la ruta
 * cambió (por ejemplo, de wifi a datos): con un mínimo viejo, Vegas creería que hay cola y no crecería.
 */
const REMEASURE_EVERY_MS = 30_000;

/**
 * Control de envío por el relevo (ADR 0006), al estilo de TCP Vegas. Limita los bytes en vuelo (enviados y aún sin
 * confirmar por el receptor) y los reparte a lo largo del RTT. La ventana se ajusta según cuánto sube el RTT sobre
 * el mínimo, que es la cola que se está formando en el camino. Así el canal no llena la cola de la PC hasta que
 * descarta cientos de paquetes de golpe, que es lo que lo dejaba a KB/s durante casi un minuto.
 */
export class SendWindow {
  window = MIN_WINDOW;
  /** Arranque: la ventana crece x1,3 por vuelta hasta que aparece cola. */
  private startup = true;
  private sent = 0;
  private acked = 0;
  /** Marcas [bytes enviados en total, momento], para medir el RTT de cada confirmación. */
  private marks: Array<[number, number]> = [];
  private minRtt = Infinity;
  private measuredAt = 0;
  /** Volviendo a medir: ventana guardada, vueltas que faltan y el mínimo visto en ellas. */
  private remeasure: { window: number; rounds: number; min: number } | null = null;
  /** Al empezar se manda un solo trozo, para medir el RTT sin cola. `probeMark` es el byte que hay que ver confirmado. */
  private probing = true;
  private probeMark: number | null = null;
  /** La vuelta actual termina cuando se confirma `roundEnd`. */
  private roundEnd = 0;
  private roundRtt = Infinity;
  private tokens = 0;
  private tokensAt: number;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.tokensAt = now();
  }

  get inFlight(): number {
    return this.sent - this.acked;
  }

  /** ¿Cabe un trozo más en vuelo? */
  canSend(): boolean {
    if (this.probing) return this.inFlight === 0 && this.probeMark === null;
    return this.inFlight < this.window;
  }

  /** Milisegundos que hay que esperar para mandar `bytes` sin pasarse del ritmo (0 = ya). */
  delay(bytes: number): number {
    const rate = this.rate();
    if (rate === 0) return 0;
    const t = this.now();
    this.tokens = Math.min(this.tokens + rate * (t - this.tokensAt), Math.max(bytes, rate * BURST_MS));
    this.tokensAt = t;
    return this.tokens >= bytes ? 0 : Math.ceil((bytes - this.tokens) / rate);
  }

  onSend(bytes: number): void {
    this.sent += bytes;
    this.marks.push([this.sent, this.now()]);
    if (this.probing && this.probeMark === null) this.probeMark = this.sent;
    const rate = this.rate();
    if (rate > 0) this.tokens = Math.max(this.tokens - bytes, -rate * BURST_MS);
  }

  /** `total`: bytes que el receptor dice tener, acumulados. */
  onAck(total: number): void {
    if (total <= this.acked) return;
    const before = this.acked;
    this.acked = Math.min(total, this.sent);
    let at: number | undefined;
    while (this.marks.length && this.marks[0]![0] <= this.acked) at = this.marks.shift()![1];
    if (at === undefined) return;
    const t = this.now();
    const rtt = t - at;
    if (this.probing && this.probeMark !== null && this.acked >= this.probeMark) {
      this.minRtt = rtt;
      this.measuredAt = t;
      this.probing = false;
      this.probeMark = null;
      this.roundEnd = this.sent;
      return;
    }
    this.minRtt = Math.min(this.minRtt, rtt);
    if (this.startup) {
      if ((this.window * (rtt - this.minRtt)) / rtt > alpha(this.window)) {
        this.endStartup(this.clamp((this.window * this.minRtt) / rtt + alpha(this.window)));
      } else {
        this.window = this.clamp(this.window + (this.acked - before) * (STARTUP_GAIN - 1));
      }
      return;
    }
    this.roundRtt = Math.min(this.roundRtt, rtt);
    if (this.remeasure) this.remeasure.min = Math.min(this.remeasure.min, rtt);
    if (this.acked >= this.roundEnd) this.endRound(t);
  }

  /** Bytes por milisegundo; 0 mientras no hay RTT medido (no se dosifica). */
  private rate(): number {
    if (!Number.isFinite(this.minRtt) || this.minRtt <= 0) return 0;
    return ((this.startup ? STARTUP_GAIN : PACING_GAIN) * this.window) / this.minRtt;
  }

  private endStartup(window: number): void {
    this.startup = false;
    this.window = window;
    this.roundEnd = this.sent;
  }

  private clamp(w: number): number {
    return Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, w));
  }

  /** Una vez por RTT, fuera del arranque: compara lo que debería tardar la ventana con lo que tardó (Vegas). */
  private endRound(t: number): void {
    const rtt = this.roundRtt;
    this.roundRtt = Infinity;
    this.roundEnd = this.sent;
    const m = this.remeasure;
    if (m) {
      // La primera vuelta vacía la cola; la segunda mide.
      if (m.rounds === 2) m.min = Infinity;
      if (--m.rounds > 0) return;
      if (Number.isFinite(m.min)) this.minRtt = m.min;
      this.window = m.window;
      this.remeasure = null;
      this.measuredAt = t;
      return;
    }
    if (t - this.measuredAt > REMEASURE_EVERY_MS) {
      this.remeasure = { window: this.window, rounds: 2, min: Infinity };
      this.window = this.clamp(this.window / 4);
      return;
    }
    if (!Number.isFinite(rtt) || rtt <= 0) return;
    const queued = (this.window * (rtt - this.minRtt)) / rtt;
    if (queued < alpha(this.window)) this.window = this.clamp(this.window + Math.max(STEP, this.window / 16));
    else if (queued > beta(this.window)) this.window = this.clamp(this.window - STEP);
  }
}
