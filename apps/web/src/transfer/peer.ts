import type { Route, SignalPayload, TurnConfig } from '../signaling/messages';
import { routeFromStats } from './route';

export interface PeerLinkOptions {
  turn?: TurnConfig;
  initiator: boolean;
  sendSignal(p: SignalPayload): void;
  onChannel(ch: RTCDataChannel): void;
  onFailed(): void;
}

/** Pegamento RTCPeerConnection: oferta/respuesta/ICE por señalización cifrada + DataChannel "chasqui". */
export class PeerLink {
  private pc: RTCPeerConnection;
  private pendingIce: Array<RTCIceCandidateInit | null> = [];
  private hasRemote = false;
  private closed = false;

  constructor(private o: PeerLinkOptions) {
    const iceServers: RTCIceServer[] = o.turn ? [{ urls: o.turn.urls, username: o.turn.username, credential: o.turn.credential }] : [];
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (e) => o.sendSignal({ kind: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null });
    this.pc.onconnectionstatechange = () => {
      if (!this.closed && (this.pc.connectionState === 'failed')) o.onFailed();
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

  async handleSignal(p: SignalPayload): Promise<void> {
    if (this.closed) return;
    if (p.kind === 'offer' && !this.o.initiator) {
      await this.pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      await this.flushIce();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.o.sendSignal({ kind: 'answer', sdp: answer.sdp ?? '' });
    } else if (p.kind === 'answer' && this.o.initiator) {
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
