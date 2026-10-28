#!/usr/bin/env node
// Prueba de humo del relevo: pide una allocation a coturn por cada URL (UDP, TCP y TLS) con las credenciales
// temporales que entregó la señalización, y la libera enseguida. Si coturn está apagado (por ejemplo, por el
// tope mensual de turn-budget.sh), el certificado vence o el secreto no coincide, falla.
//
// Uso (Node 22+, sin dependencias):
//   node infra/scripts/smoke-turn.mjs turn.json
// turn.json es el objeto `turn` de `joined` ({ urls, username, credential }); smoke-signal.mjs lo escribe si
// se define TURN_OUT=turn.json. No imprime las credenciales.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { readFileSync } from 'node:fs';
import { connect as tcpConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

const TIMEOUT_MS = 8_000;
const MAGIC = 0x2112a442;
const ALLOCATE = 0x0003;
const REFRESH = 0x0004;
const ATTR = {
  USERNAME: 0x0006,
  MESSAGE_INTEGRITY: 0x0008,
  ERROR_CODE: 0x0009,
  LIFETIME: 0x000d,
  REALM: 0x0014,
  NONCE: 0x0015,
  XOR_RELAYED_ADDRESS: 0x0016,
  REQUESTED_TRANSPORT: 0x0019,
};

/** Arma un mensaje STUN (RFC 5389). Con `key`, agrega MESSAGE-INTEGRITY al final. */
export function encode(type, txId, attrs, key) {
  const parts = [];
  for (const [t, v] of attrs) {
    const head = Buffer.alloc(4);
    head.writeUInt16BE(t, 0);
    head.writeUInt16BE(v.length, 2);
    parts.push(head, v, Buffer.alloc((4 - (v.length % 4)) % 4));
  }
  let body = Buffer.concat(parts);
  const header = (len) => {
    const h = Buffer.alloc(20);
    h.writeUInt16BE(type, 0);
    h.writeUInt16BE(len, 2);
    h.writeUInt32BE(MAGIC, 4);
    txId.copy(h, 8);
    return h;
  };
  if (key) {
    // El HMAC cubre el mensaje hasta antes de MESSAGE-INTEGRITY, con la longitud que ya lo incluye (24 bytes).
    const mac = createHmac('sha1', key).update(Buffer.concat([header(body.length + 24), body])).digest();
    const head = Buffer.alloc(4);
    head.writeUInt16BE(ATTR.MESSAGE_INTEGRITY, 0);
    head.writeUInt16BE(20, 2);
    body = Buffer.concat([body, head, mac]);
  }
  return Buffer.concat([header(body.length), body]);
}

export function decode(buf) {
  const type = buf.readUInt16BE(0);
  const len = buf.readUInt16BE(2);
  const txId = buf.subarray(8, 20);
  const attrs = new Map();
  for (let o = 20; o + 4 <= 20 + len; ) {
    const t = buf.readUInt16BE(o);
    const l = buf.readUInt16BE(o + 2);
    if (!attrs.has(t)) attrs.set(t, buf.subarray(o + 4, o + 4 + l));
    o += 4 + l + ((4 - (l % 4)) % 4);
  }
  return { type, txId, attrs };
}

function errorCode(msg) {
  const v = msg.attrs.get(ATTR.ERROR_CODE);
  return v ? v[2] * 100 + v[3] : null;
}

/** Abre un transporte que manda un mensaje STUN y espera la respuesta con el mismo id de transacción. */
function transport(kind, host, port) {
  const pending = new Map();
  const deliver = (buf) => {
    const msg = decode(buf);
    const key = msg.txId.toString('hex');
    pending.get(key)?.(msg);
    pending.delete(key);
  };
  let send;
  let close;
  let ready;
  if (kind === 'udp') {
    const sock = createSocket('udp4');
    sock.on('message', deliver);
    ready = Promise.resolve();
    send = (b) => sock.send(b, port, host);
    close = () => sock.close();
  } else {
    const sock = kind === 'tls' ? tlsConnect({ host, port, servername: host }) : tcpConnect({ host, port });
    let acc = Buffer.alloc(0);
    sock.on('data', (d) => {
      acc = Buffer.concat([acc, d]);
      // Sobre TCP los mensajes STUN van seguidos: cada uno mide 20 + su campo de longitud.
      while (acc.length >= 20 && acc.length >= 20 + acc.readUInt16BE(2)) {
        const n = 20 + acc.readUInt16BE(2);
        deliver(acc.subarray(0, n));
        acc = acc.subarray(n);
      }
    });
    ready = new Promise((resolve, reject) => {
      sock.once(kind === 'tls' ? 'secureConnect' : 'connect', resolve);
      sock.once('error', reject);
    });
    send = (b) => sock.write(b);
    close = () => sock.destroy();
  }
  return {
    ready,
    close,
    request(type, attrs, key) {
      const txId = randomBytes(12);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('sin respuesta')), TIMEOUT_MS);
        pending.set(txId.toString('hex'), (m) => {
          clearTimeout(t);
          resolve(m);
        });
        send(encode(type, txId, attrs, key));
      });
    },
  };
}

/** turn:host:3478?transport=udp -> { kind: 'udp', host, port } */
export function parseUrl(url) {
  const m = /^(turns?):([^:?]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(url);
  if (!m) throw new Error(`URL TURN no reconocida: ${url}`);
  const [, scheme, host, port, proto = 'udp'] = m;
  const kind = scheme === 'turns' ? 'tls' : proto;
  return { kind, host, port: Number(port ?? (scheme === 'turns' ? 5349 : 3478)) };
}

async function allocate(url, username, credential) {
  const { kind, host, port } = parseUrl(url);
  const t = transport(kind, host, port);
  try {
    await t.ready;
    const udp = Buffer.from([17, 0, 0, 0]); // REQUESTED-TRANSPORT: el relevo siempre es UDP
    const first = await t.request(ALLOCATE, [[ATTR.REQUESTED_TRANSPORT, udp]]);
    if (errorCode(first) !== 401) throw new Error(`se esperaba 401 y llegó ${errorCode(first) ?? 'éxito sin credenciales'}`);
    const realm = first.attrs.get(ATTR.REALM);
    const nonce = first.attrs.get(ATTR.NONCE);
    const key = createHash('md5').update(`${username}:${realm}:${credential}`).digest();
    const auth = [
      [ATTR.USERNAME, Buffer.from(username)],
      [ATTR.REALM, realm],
      [ATTR.NONCE, nonce],
    ];
    const res = await t.request(ALLOCATE, [[ATTR.REQUESTED_TRANSPORT, udp], ...auth], key);
    if (res.type !== 0x0103) throw new Error(`allocation rechazada (error ${errorCode(res)})`);
    if (!res.attrs.has(ATTR.XOR_RELAYED_ADDRESS)) throw new Error('la respuesta no trae dirección de relevo');
    // Libera la allocation (LIFETIME 0) para no gastar el cupo de user-quota y total-quota.
    await t.request(REFRESH, [[ATTR.LIFETIME, Buffer.alloc(4)], ...auth], key).catch(() => {});
  } finally {
    t.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node infra/scripts/smoke-turn.mjs turn.json');
    process.exit(2);
  }
  const { urls, username, credential } = JSON.parse(readFileSync(file, 'utf8'));
  for (const url of urls) {
    try {
      await allocate(url, username, credential);
      console.log(`OK  ${url}: allocation concedida y liberada`);
    } catch (e) {
      console.error(`FALLO ${url}: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
