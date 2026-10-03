import type { Route } from '../signaling/messages';

interface StatLike {
  id: string;
  type: string;
  [k: string]: unknown;
}

/** Determina el tipo de ruta del par de candidatos seleccionado a partir de getStats(). */
export function routeFromStats(stats: Iterable<StatLike>): Route {
  const byId = new Map<string, StatLike>();
  for (const s of stats) byId.set(s.id, s);
  let pair: StatLike | undefined;
  for (const s of byId.values()) {
    if (s.type === 'transport' && typeof s.selectedCandidatePairId === 'string') {
      pair = byId.get(s.selectedCandidatePairId);
    }
  }
  if (!pair) {
    // Firefox: sin transport.selectedCandidatePairId
    for (const s of byId.values()) {
      if (s.type === 'candidate-pair' && (s.selected === true || (s.nominated === true && s.state === 'succeeded'))) pair = s;
    }
  }
  if (!pair) return 'failed';
  const types = [pair.localCandidateId, pair.remoteCandidateId].map((id) =>
    typeof id === 'string' ? (byId.get(id)?.candidateType as string | undefined) : undefined,
  );
  if (types.includes('relay')) return 'relay';
  if (types.includes('srflx') || types.includes('prflx')) return 'srflx';
  if (types.includes('host')) return 'host';
  return 'failed';
}
