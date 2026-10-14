import { sanitizeFilename, hasExecutableExtension } from '../lib/filename';
import { HEADER_BYTES, HIGH_WATER, MAX_FILE_BYTES, chunkCount, decodeFrame, splitIntoFrames } from './framing';
import { FileAssembler } from './assembler';
import { ACK_MIN_GAP_MS, ACK_TIMEOUT_MS, SendWindow } from './pacer';
import { parseControl, type Control } from './protocol';

/** Lo mínimo que necesitamos de un RTCDataChannel (permite probar con un doble). */
export interface ChannelLike {
  send(data: string | ArrayBuffer): void;
  readonly bufferedAmount: number;
  /** Se invoca cuando bufferedAmount cae bajo el umbral bajo o el canal se cierra. */
  onDrain: (() => void) | null;
}

export type ItemStatus = 'pending' | 'active' | 'done' | 'cancelled' | 'error';

export interface TransferItem {
  key: string;
  id: number;
  dir: 'in' | 'out';
  kind: 'file' | 'text';
  name: string;
  mime: string;
  size: number;
  transferred: number;
  status: ItemStatus;
  text?: string;
  blob?: Blob;
  /** Archivo propio enviado: solo para la vista previa local (imagen, video, audio, texto). */
  preview?: Blob;
  executable?: boolean;
  note?: string;
}

const READ_SLICE = 1024 * 1024;

const isHidden = (): boolean => typeof document !== 'undefined' && document.hidden;

/** Al terminar de enviar, cuánto se espera la última confirmación antes de darlo por entregado igual. */
const FINAL_ACK_TIMEOUT_MS = 30_000;

interface InFile {
  asm: FileAssembler;
  mime: string;
  ackedAt: number;
  /** Confirmación pendiente: lo que llegue dentro de ACK_MIN_GAP_MS se confirma junto al final. */
  ackTimer: ReturnType<typeof setTimeout> | null;
}

interface OutFile {
  file: Blob;
  accepted: boolean;
  /** Bytes que el receptor confirmó (0 si es una versión que no confirma). */
  acked: number;
  win: SendWindow | null;
}

export class TransferManager {
  private items = new Map<string, TransferItem>();
  private outFiles = new Map<number, OutFile>();
  private inAsm = new Map<number, InFile>();
  private nextId: number;
  private pumpChain: Promise<void> = Promise.resolve();
  private drainWaiters: Array<() => void> = [];
  private ackWaiters: Array<() => void> = [];
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Ventana de envío según la latencia (ver {@link SendWindow}): solo cuando la ruta va por el relevo. */
  private paced = false;

  constructor(
    private ch: ChannelLike,
    private onChange: (items: TransferItem[]) => void,
    isOwner = true,
    private onEnd: () => void = () => undefined,
  ) {
    // ids disjuntos por lado (dueño impares, invitado pares) para que file-cancel no sea ambiguo.
    this.nextId = isOwner ? 1 : 2;
    ch.onDrain = () => this.flushDrain();
  }

  /** La ruta se conoce poco después de abrir el canal; afecta a los envíos que empiecen desde entonces. */
  setPaced(paced: boolean): void {
    this.paced = paced;
  }

  snapshot(): TransferItem[] {
    return [...this.items.values()].map((i) => ({ ...i }));
  }

  close(): void {
    this.closed = true;
    for (const it of this.items.values()) {
      if (it.status === 'active' || it.status === 'pending') {
        it.status = 'error';
        it.note = 'Conexión cerrada';
      }
    }
    this.inAsm.clear();
    this.flushDrain();
    this.flushAcks();
    this.emit(true);
  }

  // ---- API de envío ----

  private takeId(): number {
    const id = this.nextId;
    this.nextId += 2;
    return id;
  }

  sendText(text: string): void {
    const id = this.takeId();
    this.sendCtl({ t: 'text', id, text });
    this.put({ key: `out:${id}`, id, dir: 'out', kind: 'text', name: 'Texto', mime: 'text/plain', size: text.length, transferred: text.length, status: 'done', text });
  }

  sendFile(file: File): void {
    const id = this.takeId();
    const name = sanitizeFilename(file.name);
    this.outFiles.set(id, { file, accepted: false, acked: 0, win: null });
    this.put({ key: `out:${id}`, id, dir: 'out', kind: 'file', name, mime: file.type, size: file.size, transferred: 0, status: 'pending', preview: file });
    this.sendCtl({ t: 'file-offer', id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' });
  }

  /** Avisa al otro que se terminó la sesión, para que borre su chat. */
  sendEnd(): void {
    this.sendCtl({ t: 'end' });
  }

  cancel(dir: 'in' | 'out', id: number): void {
    const it = this.items.get(`${dir}:${id}`);
    if (!it || (it.status !== 'pending' && it.status !== 'active')) return;
    this.sendCtl({ t: 'file-cancel', id, reason: 'user' });
    this.finishItem(it, 'cancelled', 'Cancelado');
  }

  // ---- Entrada ----

  onMessage(data: unknown): void {
    if (this.closed) return;
    if (typeof data === 'string') {
      const c = parseControl(data);
      if (c) this.onControl(c);
    } else if (data instanceof ArrayBuffer) {
      this.onBinary(data);
    }
  }

  private onControl(c: Control): void {
    switch (c.t) {
      case 'end':
        this.onEnd();
        break;
      case 'text':
        this.put({ key: `in:${c.id}`, id: c.id, dir: 'in', kind: 'text', name: 'Texto', mime: 'text/plain', size: c.text.length, transferred: c.text.length, status: 'done', text: c.text });
        break;
      case 'file-offer': {
        const key = `in:${c.id}`;
        if (this.items.has(key)) return;
        const name = sanitizeFilename(c.name);
        const base = { key, id: c.id, dir: 'in' as const, kind: 'file' as const, name, mime: c.mime, size: c.size, transferred: 0, executable: hasExecutableExtension(name) };
        if (c.size > MAX_FILE_BYTES) {
          this.sendCtl({ t: 'file-cancel', id: c.id, reason: 'too-large' });
          this.put({ ...base, status: 'error', note: 'Rechazado: supera 500 MB' });
          return;
        }
        this.inAsm.set(c.id, { asm: new FileAssembler(c.size), mime: c.mime, ackedAt: 0, ackTimer: null });
        this.put({ ...base, status: 'active' });
        this.sendCtl({ t: 'file-accept', id: c.id });
        break;
      }
      case 'file-accept': {
        const o = this.outFiles.get(c.id);
        const it = this.items.get(`out:${c.id}`);
        if (!o || !it || o.accepted || it.status !== 'pending') return;
        o.accepted = true;
        it.status = 'active';
        this.emit();
        this.pumpChain = this.pumpChain.then(() => this.pump(c.id)).catch(() => undefined);
        break;
      }
      case 'file-cancel': {
        const out = this.items.get(`out:${c.id}`);
        const inn = this.items.get(`in:${c.id}`);
        // El id es único por remitente: el cancel del par aplica a lo que ÉL envía (in) o a lo que le enviamos (out).
        const msg = c.reason === 'too-large' ? 'Rechazado: supera el límite' : 'Cancelado por el otro dispositivo';
        if (out && (out.status === 'pending' || out.status === 'active')) this.finishItem(out, c.reason === 'error' ? 'error' : 'cancelled', msg);
        if (inn && (inn.status === 'active' || inn.status === 'pending')) this.finishItem(inn, 'cancelled', msg);
        break;
      }
      case 'file-ack': {
        const o = this.outFiles.get(c.id);
        const it = this.items.get(`out:${c.id}`);
        if (!o || !it || c.bytes <= o.acked) return;
        o.acked = Math.min(c.bytes, o.file.size);
        o.win?.onAck(o.acked);
        if (it.status === 'active') {
          it.transferred = o.acked;
          this.emit();
        }
        this.flushAcks();
        break;
      }
      case 'file-done': {
        const it = this.items.get(`in:${c.id}`);
        const st = this.inAsm.get(c.id);
        if (!it || !st || it.status !== 'active') return;
        try {
          it.blob = st.asm.finish(st.mime);
          it.transferred = it.size;
          this.sendCtl({ t: 'file-ack', id: c.id, bytes: it.size });
          this.finishItem(it, 'done');
        } catch {
          this.finishItem(it, 'error', 'Transferencia incompleta');
          this.sendCtl({ t: 'file-cancel', id: c.id, reason: 'error' });
        }
        break;
      }
    }
  }

  private onBinary(buf: ArrayBuffer): void {
    let f;
    try {
      f = decodeFrame(buf);
    } catch {
      return;
    }
    const st = this.inAsm.get(f.fileId);
    const it = this.items.get(`in:${f.fileId}`);
    if (!st || !it || it.status !== 'active') return; // cancelado o desconocido
    try {
      st.asm.addChunk(f.chunkIndex, f.payload);
      it.transferred = st.asm.received;
      this.ack(f.fileId, st, it);
      this.emit();
    } catch {
      this.sendCtl({ t: 'file-cancel', id: f.fileId, reason: 'error' });
      this.finishItem(it, 'error', 'Datos inválidos');
    }
  }

  /** Confirma lo recibido, a lo más una vez cada ACK_MIN_GAP_MS; si es antes, al cumplirse ese tiempo. */
  private ack(id: number, st: InFile, it: TransferItem): void {
    if (st.ackTimer) return;
    const send = () => {
      st.ackTimer = null;
      st.ackedAt = performance.now();
      if (it.status === 'active') this.sendCtl({ t: 'file-ack', id, bytes: it.transferred });
    };
    const wait = st.ackedAt + ACK_MIN_GAP_MS - performance.now();
    if (wait <= 0) send();
    else st.ackTimer = setTimeout(send, wait);
  }

  // ---- Envío de datos ----

  private async pump(id: number): Promise<void> {
    const o = this.outFiles.get(id);
    const it = this.items.get(`out:${id}`);
    if (!o || !it) return;
    let index = 0;
    o.win = this.paced ? new SendWindow() : null;
    const live = () => !this.closed && it.status === 'active';
    for (let off = 0; off < o.file.size; off += READ_SLICE) {
      if (!live()) return;
      const slice = new Uint8Array(await o.file.slice(off, off + READ_SLICE).arrayBuffer());
      for (const frame of splitIntoFrames(id, slice, index)) {
        while (this.ch.bufferedAmount > HIGH_WATER) {
          await new Promise<void>((r) => this.drainWaiters.push(r));
          if (this.closed) return;
        }
        while (o.win && !o.win.canSend() && live()) {
          if (await this.waitAck(ACK_TIMEOUT_MS)) continue;
          // Sin confirmaciones a tiempo se manda un trozo igual; si nunca llegó ninguna, el otro lado es una
          // versión que no confirma y se sigue sin ventana.
          if (o.acked === 0) o.win = null;
          break;
        }
        // La ventana cuenta bytes del archivo, que es lo que confirma el receptor.
        const bytes = frame.byteLength - HEADER_BYTES;
        await this.paceFor(o, bytes);
        if (!live()) return;
        this.ch.send(frame);
        o.win?.onSend(bytes);
        index++;
      }
      // Si el receptor confirma, la barra muestra lo que ya llegó; si no, lo que se entregó al canal.
      if (o.acked === 0) it.transferred = Math.min(off + READ_SLICE, o.file.size);
      this.emit();
    }
    if (index !== chunkCount(o.file.size)) return;
    if (!live()) return;
    this.sendCtl({ t: 'file-done', id });
    const deadline = performance.now() + FINAL_ACK_TIMEOUT_MS;
    while (o.acked > 0 && o.acked < o.file.size && live() && performance.now() < deadline) await this.waitAck(deadline - performance.now());
    if (!live()) return;
    it.transferred = it.size;
    this.finishItem(it, 'done');
  }

  /** Reparte el envío a lo largo del RTT. Con la pestaña oculta los temporizadores se frenan: ahí basta la ventana. */
  private async paceFor(o: OutFile, bytes: number): Promise<void> {
    let ms: number;
    while (o.win && (ms = o.win.delay(bytes)) > 0 && !this.closed && !isHidden()) {
      await new Promise<void>((r) => setTimeout(r, ms));
    }
  }

  /** Espera la próxima confirmación (true) o que pasen `ms` (false). */
  private waitAck(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.ackWaiters = this.ackWaiters.filter((w) => w !== wake);
        resolve(false);
      }, ms);
      const wake = () => {
        clearTimeout(t);
        resolve(true);
      };
      this.ackWaiters.push(wake);
    });
  }

  private flushAcks(): void {
    const w = this.ackWaiters;
    this.ackWaiters = [];
    for (const r of w) r();
  }

  private flushDrain(): void {
    const w = this.drainWaiters;
    this.drainWaiters = [];
    for (const r of w) r();
  }

  // ---- Utilidades ----

  private sendCtl(c: Control): void {
    try {
      this.ch.send(JSON.stringify(c));
    } catch {
      /* canal cerrado */
    }
  }

  private finishItem(it: TransferItem, status: ItemStatus, note?: string): void {
    it.status = status;
    if (note) it.note = note;
    if (it.dir === 'in') this.inAsm.delete(it.id);
    else this.outFiles.delete(it.id);
    this.flushAcks();
    this.emit(true);
  }

  private put(it: TransferItem): void {
    this.items.set(it.key, it);
    this.emit(true);
  }

  private emit(now = false): void {
    if (now) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.onChange(this.snapshot());
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.onChange(this.snapshot());
      }, 100);
    }
  }
}
