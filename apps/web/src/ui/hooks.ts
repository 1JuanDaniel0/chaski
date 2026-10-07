import { useEffect } from 'react';

/**
 * Mantiene la pantalla encendida mientras `active`. Si el celular se bloquea a mitad de un envío,
 * el navegador congela la página y la conexión se corta.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const acquire = () => {
      if (done || document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => (done ? void l.release() : (lock = l)))
        .catch(() => undefined);
    };
    // El sistema suelta el bloqueo al cambiar de pestaña: se pide de nuevo al volver.
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Pide confirmación antes de cerrar o recargar la pestaña mientras `active`. */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', onLeave);
    return () => removeEventListener('beforeunload', onLeave);
  }, [active]);
}
