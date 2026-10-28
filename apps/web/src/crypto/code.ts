// Emparejar con un código de 6 dígitos (RF6, protocolo §9). El código son dos partes: el casillero (2 dígitos)
// que asigna el servidor para encontrar a la PC, y el PIN (4 dígitos) que genera la PC y nunca sale de ella.
// La parte criptográfica (CPace) está en code-pake.ts y se carga aparte, solo cuando se usa un código.
export const PIN_DIGITS = 4;

export interface Code {
  slot: string;
  pin: string;
}

/** PIN uniforme de 4 dígitos (rechazo de muestreo para no sesgar). */
export function generatePin(): string {
  const buf = new Uint16Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < 60000) return String(buf[0]! % 10000).padStart(PIN_DIGITS, '0');
  }
}

/** Acepta el código con o sin espacios ni guiones; null si no son 6 dígitos. */
export function parseCode(input: string): Code | null {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  return { slot: digits.slice(0, 2), pin: digits.slice(2) };
}

/** "427193" se muestra "427 193", más fácil de dictar. */
export function formatCode(c: Code): string {
  const d = c.slot + c.pin;
  return `${d.slice(0, 3)} ${d.slice(3)}`;
}
