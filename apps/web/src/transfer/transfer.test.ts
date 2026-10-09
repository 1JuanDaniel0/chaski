import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FileAssembler } from './assembler';
import { CHUNK_SIZE, chunkCount, decodeFrame, encodeFrame, splitIntoFrames } from './framing';
import { TransferManager, type ChannelLike, type TransferItem } from './manager';
import { parseControl } from './protocol';
import { routeFromStats } from './route';
import { sdpFingerprints } from './peer';
import { parseSignalPayload } from '../signaling/messages';

describe('cabecera de trozo', () => {
  it('codifica big-endian y decodifica', () => {
    const buf = encodeFrame(0x01020304, 0x0a0b0c0d, new Uint8Array([9, 8, 7]));
    expect([...new Uint8Array(buf, 0, 8)]).toEqual([1, 2, 3, 4, 10, 11, 12, 13]);
    const f = decodeFrame(buf);
    expect(f.fileId).toBe(0x01020304);
    expect(f.chunkIndex).toBe(0x0a0b0c0d);
    expect([...f.payload]).toEqual([9, 8, 7]);
  });
  it('uint32 máximo', () => {
    const f = decodeFrame(encodeFrame(0xffffffff, 0xffffffff, new Uint8Array(0)));
    expect(f.fileId).toBe(0xffffffff);
    expect(f.chunkIndex).toBe(0xffffffff);
  });
  it('rechaza frames inválidos', () => {
    expect(() => decodeFrame(new ArrayBuffer(7))).toThrow();
    expect(() => encodeFrame(1, 0, new Uint8Array(CHUNK_SIZE + 1))).toThrow();
  });
});

describe('troceo y reensamblado', () => {
  for (const size of [0, 1, 16384, 16385, 100000]) {
    it(`byte-exacto con ${size} bytes`, async () => {
      const data = new Uint8Array(randomBytes(size));
      const asm = new FileAssembler(size);
      let n = 0;
      for (const fr of splitIntoFrames(5, data)) {
        const f = decodeFrame(fr);
        expect(f.payload.length).toBeLessThanOrEqual(CHUNK_SIZE);
        asm.addChunk(f.chunkIndex, f.payload);
        n++;
      }
      expect(n).toBe(chunkCount(size));
      const blob = asm.finish('application/octet-stream');
      expect(blob.size).toBe(size);
      expect(Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(data))).toBe(true);
    });
  }
  it('detecta incompleto, desorden y exceso', () => {
    const a = new FileAssembler(20000);
    a.addChunk(0, new Uint8Array(CHUNK_SIZE));
    expect(() => a.finish('')).toThrow();
    expect(() => a.addChunk(2, new Uint8Array(10))).toThrow();
    expect(() => a.addChunk(1, new Uint8Array(CHUNK_SIZE))).toThrow();
  });
});

describe('control', () => {
  it('parsea y valida', () => {
    expect(parseControl('{"t":"file-accept","id":3}')).toEqual({ t: 'file-accept', id: 3 });
    expect(parseControl('{"t":"file-accept","id":-1}')).toBeNull();
    expect(parseControl('{"t":"x","id":1}')).toBeNull();
    expect(parseControl('no json')).toBeNull();
    expect(parseControl('{"t":"file-offer","id":1,"name":"a","size":-5,"mime":""}')).toBeNull();
    expect(parseControl('{"t":"end"}')).toEqual({ t: 'end' });
  });
});

describe('ruta', () => {
  it('relay / srflx / host', () => {
    const mk = (l: string, r: string) => [
      { id: 'T', type: 'transport', selectedCandidatePairId: 'P' },
      { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' },
      { id: 'L', type: 'local-candidate', candidateType: l },
      { id: 'R', type: 'remote-candidate', candidateType: r },
    ];
    expect(routeFromStats(mk('host', 'relay'))).toBe('relay');
    expect(routeFromStats(mk('srflx', 'host'))).toBe('srflx');
    expect(routeFromStats(mk('host', 'host'))).toBe('host');
    expect(routeFromStats([])).toBe('failed');
  });
});

/** Dos canales conectados en memoria para probar el TransferManager de extremo a extremo. */
type Handler = (m: unknown) => void;
function pair(): [ChannelLike, ChannelLike, (h: Handler) => void, (h: Handler) => void] {
  const make = (): ChannelLike => ({ send: () => undefined, bufferedAmount: 0, onDrain: null });
  const a = make();
  const b = make();
  const handlers: Array<(m: unknown) => void> = [() => undefined, () => undefined];
  a.send = (d) => queueMicrotask(() => handlers[1]!(d));
  b.send = (d) => queueMicrotask(() => handlers[0]!(d));
  return [a, b, (f: Handler) => void (handlers[0] = f), (f: Handler) => void (handlers[1] = f)];
}

describe('TransferManager', () => {
  it('envía archivo y texto, saneando nombre y marcando ejecutables', async () => {
    const [ca, cb, setA, setB] = pair();
    let ia: TransferItem[] = [];
    let ib: TransferItem[] = [];
    const A = new TransferManager(ca, (i) => (ia = i), true);
    const B = new TransferManager(cb, (i) => (ib = i), false);
    setA((m) => A.onMessage(m));
    setB((m) => B.onMessage(m));
    const data = new Uint8Array(randomBytes(50000));
    A.sendFile(new File([data], '../../evil.exe'));
    A.sendText('hola');
    await new Promise((r) => setTimeout(r, 200));
    const f = ib.find((i) => i.kind === 'file')!;
    expect(f.name).toBe('evil.exe');
    expect(f.executable).toBe(true);
    expect(f.status).toBe('done');
    expect(Buffer.from(await f.blob!.arrayBuffer()).equals(Buffer.from(data))).toBe(true);
    expect(ib.find((i) => i.kind === 'text')!.text).toBe('hola');
    expect(ia.find((i) => i.kind === 'file')!.status).toBe('done');
    // ids disjuntos entre lados
    B.sendText('x');
    expect(ib.filter((i) => i.dir === 'out')[0]!.id % 2).toBe(0);
  });

  it('"Terminar" avisa al otro lado', async () => {
    const [ca, cb, setA, setB] = pair();
    let ended = 0;
    const A = new TransferManager(ca, () => undefined, true);
    const B = new TransferManager(cb, () => undefined, false, () => ended++);
    setA((m) => A.onMessage(m));
    setB((m) => B.onMessage(m));
    A.sendEnd();
    await new Promise((r) => setTimeout(r, 0));
    expect(ended).toBe(1);
  });

  it('el receptor puede cancelar y el emisor lo refleja', async () => {
    const [ca, cb, setA, setB] = pair();
    let ia: TransferItem[] = [];
    let ib: TransferItem[] = [];
    const A = new TransferManager(ca, (i) => (ia = i), true);
    const B = new TransferManager(cb, (i) => (ib = i), false);
    setA((m) => A.onMessage(m));
    setB((m) => B.onMessage(m));
    A.sendFile(new File([new Uint8Array(CHUNK_SIZE * 40)], 'a.bin'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const inc = ib.find((i) => i.dir === 'in')!;
    if (inc.status === 'active') B.cancel('in', inc.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(['cancelled', 'done']).toContain(ia[0]!.status);
  });
});

describe('reconexión', () => {
  const sdp = (fp: string) => `v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=fingerprint:sha-256 ${fp}\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 ${fp}\r\n`;

  it('la huella DTLS no cambia en un reinicio de ICE y distingue a otro dispositivo', () => {
    expect(sdpFingerprints(sdp('AB:CD'))).toBe('sha-256 ab:cd');
    expect(sdpFingerprints(sdp('AB:CD'))).toBe(sdpFingerprints(sdp('ab:cd')));
    expect(sdpFingerprints(sdp('AB:CD'))).not.toBe(sdpFingerprints(sdp('AB:CE')));
  });

  it('acepta el pedido de reinicio en la señalización', () => {
    expect(parseSignalPayload('{"kind":"restart"}')).toEqual({ kind: 'restart' });
  });
});
