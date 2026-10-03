/** Señalización: en desarrollo, el servidor local; en producción, chaski.me (VITE_SIGNAL_URL lo sobreescribe). */
export const SIGNAL_URL: string =
  import.meta.env.VITE_SIGNAL_URL ?? (import.meta.env.DEV ? 'ws://localhost:8443/ws' : 'wss://signal.chaski.me/ws');
export const QR_EXPIRY_MS = 10 * 60 * 1000;
