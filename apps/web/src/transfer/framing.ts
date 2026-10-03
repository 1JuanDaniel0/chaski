export const CHUNK_SIZE = 16 * 1024;
export const HEADER_BYTES = 8;
export const HIGH_WATER = 8 * 1024 * 1024;
export const LOW_WATER = 1024 * 1024;
export const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB (MiB)

export function chunkCount(size: number): number {
  return Math.ceil(size / CHUNK_SIZE);
}

/** Cabecera: fileId uint32 BE | chunkIndex uint32 BE. */
export function encodeFrame(fileId: number, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
  if (payload.length > CHUNK_SIZE) throw new Error('payload demasiado grande');
  const buf = new ArrayBuffer(HEADER_BYTES + payload.length);
  const dv = new DataView(buf);
  dv.setUint32(0, fileId >>> 0, false);
  dv.setUint32(4, chunkIndex >>> 0, false);
  new Uint8Array(buf, HEADER_BYTES).set(payload);
  return buf;
}

export interface Frame {
  fileId: number;
  chunkIndex: number;
  payload: Uint8Array;
}

export function decodeFrame(buf: ArrayBuffer): Frame {
  if (buf.byteLength < HEADER_BYTES) throw new Error('frame demasiado corto');
  if (buf.byteLength - HEADER_BYTES > CHUNK_SIZE) throw new Error('frame demasiado grande');
  const dv = new DataView(buf);
  return {
    fileId: dv.getUint32(0, false),
    chunkIndex: dv.getUint32(4, false),
    payload: new Uint8Array(buf, HEADER_BYTES),
  };
}

/** Parte un buffer en frames de ≤16 KiB empezando en el índice 0. */
export function* splitIntoFrames(fileId: number, data: Uint8Array, startIndex = 0): Generator<ArrayBuffer> {
  let idx = startIndex;
  for (let off = 0; off < data.length; off += CHUNK_SIZE) {
    yield encodeFrame(fileId, idx++, data.subarray(off, Math.min(off + CHUNK_SIZE, data.length)));
  }
}
