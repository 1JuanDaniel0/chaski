import { beforeAll, describe, expect, it } from 'vitest';
import { secretFromQr } from './share';

const K = 'AAECAwQFBgcICQoLDA0ODw'; // 000102…0f en base64url (vector de docs/protocol.md)

describe('secretFromQr', () => {
  beforeAll(() => {
    (globalThis as { location?: unknown }).location = new URL('https://app.chaski.me/');
  });

  it('acepta el QR de chaski.me y de sus subdominios', () => {
    expect(secretFromQr(`https://chaski.me/#k=${K}`)?.length).toBe(16);
    expect(secretFromQr(`https://app.chaski.me/#k=${K}`)?.[15]).toBe(15);
  });

  it('rechaza QR de otros sitios, sin https o sin secreto válido', () => {
    expect(secretFromQr(`https://chaski.me.evil.com/#k=${K}`)).toBeNull();
    expect(secretFromQr(`https://evilchaski.me/#k=${K}`)).toBeNull();
    expect(secretFromQr(`http://chaski.me/#k=${K}`)).toBeNull();
    expect(secretFromQr('https://chaski.me/')).toBeNull();
    expect(secretFromQr('https://chaski.me/#k=corto')).toBeNull();
    expect(secretFromQr('WIFI:S:casa;T:WPA;P:1234;;')).toBeNull();
  });
});
