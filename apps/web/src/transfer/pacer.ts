/** Ritmo inicial cuando la ruta va por el relevo TURN (bytes por segundo). */
export const PACE_START = 512 * 1024;
/** Cada cuánto puede duplicarse el ritmo. */
export const PACE_STEP_MS = 500;
/** Solo se acelera si el canal tiene menos que esto en cola (Chrome está enviando todo lo que le damos). */
export const PACE_GROW_BELOW = 256 * 1024;
/** Con ritmo gradual, cola máxima en el canal: es lo más que Chrome puede soltar de golpe. */
export const PACED_HIGH_WATER = 1024 * 1024;
/** Lo que se puede mandar seguido tras una pausa, en segundos de ritmo. */
const BURST_S = 0.05;

/**
 * Arranque gradual del envío (ADR 0006). Por el relevo, Chrome acelera el canal de datos tan rápido que la PC
 * descarta cientos de paquetes en el primer segundo y el canal tarda más de un minuto en recuperarse. Dándole los
 * datos a un ritmo que empieza bajo y se duplica cada {@link PACE_STEP_MS} mientras la cola siga vacía, Chrome nunca
 * tiene una ráfaga grande que soltar.
 */
export class Pacer {
  private rate = PACE_START;
  private tokens = 0;
  private last: number;
  private lastStep: number;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.last = this.lastStep = now();
  }

  /** Milisegundos a esperar antes de enviar `bytes` (0 = ya, y los descuenta). */
  wait(bytes: number, buffered: number): number {
    const t = this.now();
    if (t - this.lastStep >= PACE_STEP_MS) {
      if (buffered < PACE_GROW_BELOW) this.rate *= 2;
      this.lastStep = t;
    }
    this.tokens = Math.min(this.tokens + (this.rate * (t - this.last)) / 1000, Math.max(this.rate * BURST_S, bytes));
    this.last = t;
    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return 0;
    }
    return Math.ceil(((bytes - this.tokens) / this.rate) * 1000);
  }

  get bytesPerSecond(): number {
    return this.rate;
  }
}
