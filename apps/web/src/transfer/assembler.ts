import { CHUNK_SIZE, chunkCount } from './framing';

/** Reensambla un archivo en memoria validando orden, tamaño y conteo (protocol.md §5.2). */
export class FileAssembler {
  private parts: Uint8Array[] = [];
  private nextIndex = 0;
  received = 0;

  constructor(readonly size: number) {}

  addChunk(index: number, payload: Uint8Array): void {
    if (index !== this.nextIndex) throw new Error('trozo fuera de orden');
    if (this.received + payload.length > this.size) throw new Error('más bytes de los declarados');
    const isLast = index === chunkCount(this.size) - 1;
    if (!isLast && payload.length !== CHUNK_SIZE) throw new Error('trozo con tamaño inválido');
    // Copia: el buffer original pertenece al evento del canal.
    this.parts.push(payload.slice());
    this.received += payload.length;
    this.nextIndex++;
  }

  /** Lanza si faltan trozos o bytes. */
  finish(mime: string): Blob {
    if (this.nextIndex !== chunkCount(this.size) || this.received !== this.size) {
      throw new Error('transferencia incompleta');
    }
    return new Blob(this.parts as BlobPart[], { type: mime });
  }

  /** Concatena (útil en pruebas). */
  toBytes(): Uint8Array {
    const out = new Uint8Array(this.received);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}
