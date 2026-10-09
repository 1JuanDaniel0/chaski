/** Señalización: en desarrollo, el servidor local; en producción, chaski.me (VITE_SIGNAL_URL lo sobreescribe). */
export const SIGNAL_URL: string =
  import.meta.env.VITE_SIGNAL_URL ?? (import.meta.env.DEV ? 'ws://localhost:8443/ws' : 'wss://signal.chaski.me/ws');
export const QR_EXPIRY_MS = 10 * 60 * 1000;

/** Reconexión automática (RF4). */
export const RECONNECT = {
  /** Espera antes de actuar cuando la ruta directa pasa a "disconnected" (a veces vuelve sola). */
  graceMs: 2_000,
  /** Cada cuánto se reintenta el reinicio de ICE mientras siga caída. */
  retryMs: 8_000,
  /** Mínimo entre dos reinicios de ICE. */
  minRestartGapMs: 2_000,
  /** Tope de espera entre reintentos de volver a la sala de señalización. */
  maxBackoffMs: 15_000,
  /** Tras este tiempo sin ruta se da la sesión por perdida. */
  giveUpMs: 120_000,
};
