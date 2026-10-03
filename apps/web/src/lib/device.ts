/** Descripción corta tipo "Android · Chrome" a partir del userAgent. */
export function describeDevice(ua: string): string {
  let os = 'Dispositivo';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux|X11/i.test(ua)) os = 'Linux';

  let br = 'Navegador';
  if (/Edg\//.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) br = 'Opera';
  else if (/Firefox\/|FxiOS/.test(ua)) br = 'Firefox';
  else if (/Chrome\/|CriOS/.test(ua)) br = 'Chrome';
  else if (/Safari\//.test(ua)) br = 'Safari';
  return `${os} · ${br}`;
}

/** El texto del par viene de la red: limitarlo y quitar controles antes de mostrarlo. */
export function cleanDeviceLabel(s: unknown): string {
  // eslint-disable-next-line no-control-regex
  const t = typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '') : '';
  return t.slice(0, 60) || 'otro dispositivo';
}
