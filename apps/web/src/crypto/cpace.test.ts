import { describe, expect, it } from 'vitest';
import { formatCode, generatePin, parseCode } from './code';
import { CodeGuest, CodeHost, WrongCodeError } from './code-pake';
import { calculateGenerator, CPace, lvCat, prependLen, scalarFromBytes } from './cpace';
import { generateSecret } from './keys';

const hex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex').toUpperCase();

// Vectores oficiales de draft-irtf-cfrg-cpace (revisión 21, testvectors.json, grupo G_Coffee25519 = ristretto255).
const V = {
  PRS: '50617373776F7264',
  CI: '0B415F696E69746961746F720B425F726573706F6E646572',
  sid: '7E4B4791D6A8EF019B936C79FB7F2C57',
  g: '222B6B195FE84B1652BADB6F6A3AE3D24341E7306967F0B8115B40D5698C7E56',
  ya: 'DA3D23700A9E5699258AEF94DC060DFDA5EBB61F02A5EA77FAD53F4FF0976D08',
  ADa: '414461',
  Ya: 'D6BAC480F2C386C394EFC7C47ADB9925DCD2630B64F240C50F8D0EEC482B9157',
  yb: 'D2316B454718C35362D83D69DF6320F38578ED5984651435E2949762D900B80D',
  ADb: '414462',
  Yb: '3EA7E0B19560D7C0B0F5734F63B955286DFA8232B5EBE63324E2D9E7433F7258',
  ISK_IR:
    'B69EFFBF61B51D56401C0F65601ABE428DE8206FEAAF0E32198896DCAE7B35CD2B38950A39DFD5D4A79164614C2984F7DAA460B588C1E80C3FA2068AF7900447',
};

describe('CPace ristretto255 (vectores del borrador)', () => {
  it('prependLen usa LEB128', () => {
    expect(toHex(prependLen(new Uint8Array(3)))).toBe('03000000');
    expect(toHex(prependLen(new Uint8Array(200))).slice(0, 4)).toBe('C801');
    expect(toHex(lvCat(hex('AA'), new Uint8Array(0)))).toBe('01AA00');
  });

  it('generador, mensajes e ISK coinciden', async () => {
    const g = await calculateGenerator(hex(V.PRS), hex(V.CI), hex(V.sid));
    expect(toHex(g.toBytes())).toBe(V.g);
    const common = { prs: hex(V.PRS), ci: hex(V.CI), sid: hex(V.sid) };
    const a = await CPace.start({ ...common, role: 'initiator', ad: hex(V.ADa), scalar: scalarFromBytes(hex(V.ya)) });
    const b = await CPace.start({ ...common, role: 'responder', ad: hex(V.ADb), scalar: scalarFromBytes(hex(V.yb)) });
    expect(toHex(a.share)).toBe(V.Ya);
    expect(toHex(b.share)).toBe(V.Yb);
    expect(toHex(await a.derive(b.share, hex(V.ADb)))).toBe(V.ISK_IR);
    expect(toHex(await b.derive(a.share, hex(V.ADa)))).toBe(V.ISK_IR);
    expect(await a.verify(await b.tag())).toBe(true);
    expect(await b.verify(await a.tag())).toBe(true);
    expect(await a.verify(await a.tag())).toBe(false);
  });

  it('rechaza puntos inválidos y el neutro', async () => {
    const start = () => CPace.start({ role: 'initiator', prs: hex(V.PRS), ci: hex(V.CI), sid: hex(V.sid) });
    // Del mismo testvectors.json: codificación no canónica y el neutro.
    await expect((await start()).derive(hex('2B3C6B8C4F3800E7AEF6864025B4ED79BD599117E427C41BD47D93D654B4A51C'))).rejects.toThrow();
    await expect((await start()).derive(new Uint8Array(32))).rejects.toThrow();
    await expect((await start()).derive(new Uint8Array(31))).rejects.toThrow();
  });
});

describe('código de 6 dígitos', () => {
  it('genera, formatea y lee', () => {
    for (let i = 0; i < 50; i++) expect(generatePin()).toMatch(/^\d{4}$/);
    expect(formatCode({ slot: '42', pin: '7193' })).toBe('427 193');
    expect(parseCode(' 427 193 ')).toEqual({ slot: '42', pin: '7193' });
    expect(parseCode('427-193')).toEqual({ slot: '42', pin: '7193' });
    expect(parseCode('42719')).toBeNull();
    expect(parseCode('42a193')).toBeNull();
  });

  const sid = hex('00112233445566778899AABBCCDDEEFF');

  it('con el mismo código, el otro dispositivo recibe el secreto del QR', async () => {
    const secret = generateSecret();
    const host = await CodeHost.start({ slot: '42', pin: '7193' }, sid);
    const guest = new CodeGuest({ slot: '42', pin: '7193' }, sid);
    const msg2 = await guest.reply(host.first());
    const msg3 = await host.finish(msg2, secret);
    expect(await guest.open(msg3)).toEqual(secret);
  });

  it('con un PIN distinto, la PC lo detecta y no entrega nada', async () => {
    const host = await CodeHost.start({ slot: '42', pin: '7193' }, sid);
    const guest = new CodeGuest({ slot: '42', pin: '7194' }, sid);
    const msg2 = await guest.reply(host.first());
    await expect(host.finish(msg2, generateSecret())).rejects.toBeInstanceOf(WrongCodeError);
  });

  it('una PC falsa (PIN distinto) no logra que el otro acepte un secreto', async () => {
    const fake = await CodeHost.start({ slot: '42', pin: '0000' }, sid);
    const fakeGuest = new CodeGuest({ slot: '42', pin: '0000' }, sid);
    const guest = new CodeGuest({ slot: '42', pin: '7193' }, sid);
    await guest.reply(fake.first());
    // El atacante arma un msg3 válido para su propio PIN: al dispositivo real no le sirve.
    const msg3 = await fake.finish(await fakeGuest.reply(fake.first()), generateSecret());
    await expect(guest.open(msg3)).rejects.toBeInstanceOf(WrongCodeError);
  });

  it('casillero o sesión distintos no se mezclan', async () => {
    const host = await CodeHost.start({ slot: '42', pin: '7193' }, sid);
    const guest = new CodeGuest({ slot: '43', pin: '7193' }, sid);
    await expect(host.finish(await guest.reply(host.first()), generateSecret())).rejects.toBeInstanceOf(WrongCodeError);
  });

  it('un msg3 alterado se rechaza', async () => {
    const host = await CodeHost.start({ slot: '42', pin: '7193' }, sid);
    const guest = new CodeGuest({ slot: '42', pin: '7193' }, sid);
    const msg3 = await host.finish(await guest.reply(host.first()), generateSecret());
    msg3[msg3.length - 1]! ^= 1;
    await expect(guest.open(msg3)).rejects.toBeInstanceOf(WrongCodeError);
  });
});
