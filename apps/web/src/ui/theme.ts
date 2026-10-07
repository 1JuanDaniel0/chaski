/** Preferencia de tema. La aplica public/theme.js, que se carga antes de pintar. */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'chaski-theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePref(p: ThemePref): void {
  try {
    if (p === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* sin almacenamiento: el cambio dura hasta recargar */
    document.documentElement.dataset.theme = p === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p;
    return;
  }
  dispatchEvent(new Event('chaski-theme'));
}

/** Orden del botón: sistema → claro → oscuro → sistema. */
export const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
export const THEME_LABEL: Record<ThemePref, string> = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: oscuro' };
