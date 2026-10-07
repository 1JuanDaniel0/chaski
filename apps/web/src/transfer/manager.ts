import { sanitizeFilename, hasExecutableExtension } from '../lib/filename';
import { HIGH_WATER, MAX_FILE_BYTES, chunkCount, decodeFrame, splitIntoFrames } from './framing';
import { FileAssembler } from './assembler';
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

export class TransferManager {
  private items = new Map<string, TransferItem>();
  private outFiles = new Map<number, { file: Blob; accepted: boolean }>();
  private inAsm = new Map<number, { asm: FileAssembler; mime: string }>();
  private nextId: number;
  private pumpChain: Promise<void> = Promise.resolve();
  private drainWaiters: Array<() => void> = [];
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

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
    this.outFiles.set(id, { file, accepted: false });
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
        this.inAsm.set(c.id, { asm: new FileAssembler(c.size), mime: c.mime });
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
      case 'file-done': {
        const it = this.items.get(`in:${c.id}`);
        const st = this.inAsm.get(c.id);
        if (!it || !st || it.status !== 'active') return;
        try {
          it.blob = st.asm.finish(st.mime);
          it.transferred = it.size;
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
      this.emit();
    } catch {
      this.sendCtl({ t: 'file-cancel', id: f.fileId, reason: 'error' });
      this.finishItem(it, 'error', 'Datos inválidos');
    }
  }

  // ---- Envío de datos ----

  private async pump(id: number): Promise<void> {
    const o = this.outFiles.get(id);
    const it = this.items.get(`out:${id}`);
    if (!o || !it) return;
    let index = 0;
    for (let off = 0; off < o.file.size; off += READ_SLICE) {
      if (this.closed || it.status !== 'active') return;
      const slice = new Uint8Array(await o.file.slice(off, off + READ_SLICE).arrayBuffer());
      for (const frame of splitIntoFrames(id, slice, index)) {
        while (this.ch.bufferedAmount > HIGH_WATER) {
          await new Promise<void>((r) => this.drainWaiters.push(r));
          if (this.closed) return;
        }
        if (it.status !== 'active') return;
        this.ch.send(frame);
        index++;
      }
      it.transferred = Math.min(off + READ_SLICE, o.file.size);
      this.emit();
    }
    if (index !== chunkCount(o.file.size)) return;
    if (it.status !== 'active') return;
    this.sendCtl({ t: 'file-done', id });
    it.transferred = it.size;
    this.finishItem(it, 'done');
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
