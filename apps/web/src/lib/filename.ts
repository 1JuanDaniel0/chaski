// Controles C0/C1, DEL, marcas y anulaciones bidi (incl. U+202E RTLO), aislados bidi,
// caracteres de ancho cero, BOM y separadores de línea/párrafo Unicode.
const FORBIDDEN =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

const MAX_LEN = 120;
const FALLBACK = 'archivo';

export function sanitizeFilename(input: string): string {
  let s = input.normalize('NFC').replace(FORBIDDEN, '');
  // Solo el último segmento: elimina rutas y recorridos (../).
  const parts = s.split(/[/\\]+/).filter((p) => p !== '');
  s = parts.length ? parts[parts.length - 1]! : '';
  // Caracteres problemáticos en sistemas de archivos comunes.
  s = s.replace(/[<>:"|?*]/g, '_');
  s = s.trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (s === '') return FALLBACK;
  if (s.length > MAX_LEN) {
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 16 ? s.slice(dot) : '';
    s = s.slice(0, MAX_LEN - ext.length) + ext;
  }
  return s;
}

const EXECUTABLE_EXTS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse',
  'wsf', 'wsh', 'hta', 'lnk', 'reg', 'jar', 'sh', 'bash', 'command', 'apk', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'appimage', 'run', 'bin', 'msix', 'appx', 'iso', 'docm', 'xlsm', 'pptm', 'py', 'pl', 'rb', 'gadget',
]);

/** true si la extensión (última, o cualquiera en doble extensión) es ejecutable. */
export function hasExecutableExtension(name: string): boolean {
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) return false;
  return parts.slice(1).some((p) => EXECUTABLE_EXTS.has(p.trim()));
}
