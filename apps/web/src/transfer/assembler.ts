import { CHUNK_SIZE, chunkCount } from './framing';

/** Cada cuántos bytes se pasan los trozos recibidos a un Blob (ver {@link FileAssembler}). */
export const SEGMENT_BYTES = 8 * 1024 * 1024;

/**
 * Reensambla un archivo validando orden, tamaño y conteo (protocol.md §5.2).
 *
 * Los trozos no se acumulan en la memoria de la pestaña: cada {@link SEGMENT_BYTES} se juntan en un Blob y se
 * sueltan. El navegador guarda los Blobs fuera del heap de JavaScript (Chrome los pasa a disco si hace falta), así
 * que la pestaña retiene como mucho un tramo sin importar el tamaño del archivo.
 */
export class FileAssembler {
  private segments: Blob[] = [];
  private parts: Uint8Array[] = [];
  private pending = 0;
  private nextIndex = 0;
  received = 0;

  constructor(
    readonly size: number,
    private readonly segmentBytes = SEGMENT_BYTES,
  ) {}

  addChunk(index: number, payload: Uint8Array): void {
    if (index !== this.nextIndex) throw new Error('trozo fuera de orden');
    if (this.received + payload.length > this.size) throw new Error('más bytes de los declarados');
    const isLast = index === chunkCount(this.size) - 1;
    if (!isLast && payload.length !== CHUNK_SIZE) throw new Error('trozo con tamaño inválido');
    // Copia: el buffer original pertenece al evento del canal.
    this.parts.push(payload.slice());
    this.pending += payload.length;
    this.received += payload.length;
    this.nextIndex++;
    if (this.pending >= this.segmentBytes) this.flush();
  }

  private flush(): void {
    if (this.parts.length === 0) return;
    this.segments.push(new Blob(this.parts as BlobPart[]));
    this.parts = [];
    this.pending = 0;
  }

  /** Lanza si faltan trozos o bytes. */
  finish(mime: string): Blob {
    if (this.nextIndex !== chunkCount(this.size) || this.received !== this.size) {
      throw new Error('transferencia incompleta');
    }
    this.flush();
    const blob = new Blob(this.segments, { type: mime });
    this.segments = [];
    return blob;
  }
}
