import type { Route, SignalPayload, TurnConfig } from '../signaling/messages';
import { routeFromStats } from './route';

export interface PeerLinkOptions {
  turn?: TurnConfig;
  initiator: boolean;
  sendSignal(p: SignalPayload): void;
  onChannel(ch: RTCDataChannel): void;
  onFailed(): void;
  /** Cada cambio de connectionState (para detectar cortes y recuperarse). */
  onState?(state: RTCPeerConnectionState): void;
}

const iceServersOf = (turn?: TurnConfig): RTCIceServer[] =>
  turn ? [{ urls: turn.urls, username: turn.username, credential: turn.credential }] : [];

/** Huellas DTLS de una SDP, normalizadas, para comprobar que una renegociación viene del mismo dispositivo. */
export function sdpFingerprints(sdp: string): string {
  const fps = [...sdp.matchAll(/^a=fingerprint:(.+)$/gm)].map((m) => m[1]!.trim().toLowerCase());
  return [...new Set(fps)].sort().join(',');
}

/** Pegamento RTCPeerConnection: oferta/respuesta/ICE por señalización cifrada + DataChannel "chasqui". */
export class PeerLink {
  private pc: RTCPeerConnection;
  private pendingIce: Array<RTCIceCandidateInit | null> = [];
  private hasRemote = false;
  private closed = false;
  /** Huella DTLS del otro, fijada en la primera negociación. */
  private remoteFp: string | null = null;
  private restarting = false;

  constructor(private o: PeerLinkOptions) {
    this.pc = new RTCPeerConnection({ iceServers: iceServersOf(o.turn) });
    this.pc.onicecandidate = (e) => o.sendSignal({ kind: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null });
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      o.onState?.(this.pc.connectionState);
      if (this.pc.connectionState === 'failed') o.onFailed();
    };
    this.pc.ondatachannel = (e) => {
      if (e.channel.label === 'chasqui') this.setup(e.channel);
    };
  }

  private setup(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    ch.bufferedAmountLowThreshold = 1024 * 1024;
    this.o.onChannel(ch);
  }

  async start(): Promise<void> {
    if (!this.o.initiator) return;
    this.setup(this.pc.createDataChannel('chasqui', { ordered: true }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.o.sendSignal({ kind: 'offer', sdp: offer.sdp ?? '' });
  }

  get initiator(): boolean {
    return this.o.initiator;
  }

  get state(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  /** Credenciales TURN nuevas (las anteriores vencen): se usan en el próximo reinicio de ICE. */
  setTurn(turn?: TurnConfig): void {
    if (!turn) return;
    try {
      this.pc.setConfiguration({ ...this.pc.getConfiguration(), iceServers: iceServersOf(turn) });
    } catch {
      /* configuración rechazada: se sigue con la anterior */
    }
  }

  /**
   * Reinicio de ICE (solo quien ofrece): busca una ruta nueva, por ejemplo tras pasar de wifi a datos, sin cerrar
   * la conexión DTLS ni el canal de datos, así que los envíos en curso continúan donde quedaron.
   */
  async restart(): Promise<void> {
    if (!this.o.initiator || this.closed || this.restarting) return;
    this.restarting = true;
    try {
      // Una oferta anterior pudo perderse con la señalización caída: se descarta y se manda otra.
      if (this.pc.signalingState === 'have-local-offer') await this.pc.setLocalDescription({ type: 'rollback' });
      if (this.pc.signalingState !== 'stable') return;
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.o.sendSignal({ kind: 'offer', sdp: offer.sdp ?? '' });
    } finally {
      this.restarting = false;
    }
  }

  /** Rechaza una renegociación de otro dispositivo: quien tenga el QR podría intentar meterse en la sesión. */
  private pin(sdp: string): void {
    const fp = sdpFingerprints(sdp);
    if (this.remoteFp === null) this.remoteFp = fp;
    else if (fp !== this.remoteFp) throw new Error('huella DTLS distinta');
  }

  async handleSignal(p: SignalPayload): Promise<void> {
    if (this.closed) return;
    if (p.kind === 'offer' && !this.o.initiator) {
      this.pin(p.sdp);
      await this.pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      await this.flushIce();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.o.sendSignal({ kind: 'answer', sdp: answer.sdp ?? '' });
    } else if (p.kind === 'answer' && this.o.initiator) {
      if (this.pc.signalingState !== 'have-local-offer') return; // respuesta a una oferta ya descartada
      this.pin(p.sdp);
      await this.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
      await this.flushIce();
    } else if (p.kind === 'ice') {
      if (this.hasRemote) await this.addIce(p.candidate);
      else this.pendingIce.push(p.candidate);
    }
  }

  private async flushIce(): Promise<void> {
    this.hasRemote = true;
    const q = this.pendingIce;
    this.pendingIce = [];
    for (const c of q) await this.addIce(c);
  }

  private async addIce(c: RTCIceCandidateInit | null): Promise<void> {
    try {
      await this.pc.addIceCandidate(c ?? undefined);
    } catch {
      /* candidato inválido: se ignora */
    }
  }

  async detectRoute(): Promise<Route> {
    try {
      const report = await this.pc.getStats();
      return routeFromStats([...report.values()] as Array<{ id: string; type: string }>);
    } catch {
      return 'failed';
    }
  }

  close(): void {
    this.closed = true;
    try {
      this.pc.close();
    } catch {
      /* ya cerrada */
    }
  }
}
