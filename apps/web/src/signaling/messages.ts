export interface TurnConfig {
  urls: string[];
  username: string;
  credential: string;
  ttl?: number;
}

export type ServerMessage =
  | { type: 'joined'; peerId: string; peers: string[]; turn?: TurnConfig }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'peer-left'; peerId: string }
  | { type: 'signal'; from: string; seq: number; data: string }
  | { type: 'kicked' }
  | { type: 'error'; code: string; message?: string }
  | { type: 'pong' };

export type Route = 'host' | 'srflx' | 'relay' | 'failed';

export type SignalPayload =
  | { kind: 'hello'; device: string }
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit | null }
  /** Lo envía quien responde para pedirle al que ofrece que reinicie ICE (reconexión). */
  | { kind: 'restart' };

const isStr = (v: unknown): v is string => typeof v === 'string';

function parseTurn(t: unknown): TurnConfig | undefined {
  if (typeof t !== 'object' || t === null) return undefined;
  const o = t as Record<string, unknown>;
  if (!Array.isArray(o.urls) || !o.urls.every(isStr) || !isStr(o.username) || !isStr(o.credential)) return undefined;
  return { urls: o.urls, username: o.username, credential: o.credential, ttl: typeof o.ttl === 'number' ? o.ttl : undefined };
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case 'joined':
      if (!isStr(o.peerId) || !Array.isArray(o.peers) || !o.peers.every(isStr)) return null;
      return { type: 'joined', peerId: o.peerId, peers: o.peers, turn: parseTurn(o.turn) };
    case 'peer-joined':
    case 'peer-left':
      return isStr(o.peerId) ? { type: o.type, peerId: o.peerId } : null;
    case 'signal':
      if (!isStr(o.from) || !isStr(o.data) || typeof o.seq !== 'number') return null;
      return { type: 'signal', from: o.from, seq: o.seq, data: o.data };
    case 'kicked':
      return { type: 'kicked' };
    case 'pong':
      return { type: 'pong' };
    case 'error':
      return isStr(o.code) ? { type: 'error', code: o.code, message: isStr(o.message) ? o.message : undefined } : null;
    default:
      return null;
  }
}

export function parseSignalPayload(raw: string): SignalPayload | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.kind) {
    case 'hello':
      return isStr(o.device) ? { kind: 'hello', device: o.device } : null;
    case 'offer':
    case 'answer':
      return isStr(o.sdp) ? { kind: o.kind, sdp: o.sdp } : null;
    case 'restart':
      return { kind: 'restart' };
    case 'ice':
      if (o.candidate === null) return { kind: 'ice', candidate: null };
      return typeof o.candidate === 'object' ? { kind: 'ice', candidate: o.candidate as RTCIceCandidateInit } : null;
    default:
      return null;
  }
}
