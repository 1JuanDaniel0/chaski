export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** En los primeros segundos de un envío, un cálculo de más de esto suele ser el canal arrancando, no su velocidad real. */
const WARMUP_S = 120;
const WARMUP_MAX_ETA_S = 10 * 60;

/** Tiempo restante de un envío (`secs`) que lleva `elapsed` segundos en curso. */
export function etaLabel(secs: number, elapsed: number): string {
  if (elapsed < WARMUP_S && secs > WARMUP_MAX_ETA_S) return 'tomando velocidad…';
  return secs < 60 ? `${Math.max(1, Math.round(secs))} s` : `${Math.round(secs / 60)} min`;
}
