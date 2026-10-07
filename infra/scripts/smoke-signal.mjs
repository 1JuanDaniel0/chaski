#!/usr/bin/env node
// Prueba de humo de la señalización: dos clientes entran a la misma sala, se ven y se
// reenvían un `signal`. Imprime las credenciales TURN que entrega el servidor para
// probarlas en Trickle ICE (ver docs/primeros-pasos.md, "Prueba de punta a punta").
//
// Uso (Node 22+, sin dependencias):
//   node infra/scripts/smoke-signal.mjs [wss://signal.chaski.me/ws] [https://chaski.me]
// El segundo argumento es la cabecera Origin; debe estar en ALLOWED_ORIGINS.
import { randomBytes } from 'node:crypto';

const url = process.argv[2] ?? 'wss://signal.chaski.me/ws';
const origin = process.argv[3] ?? 'https://chaski.me';
const roomId = randomBytes(16).toString('base64url'); // 22 caracteres, como el cliente
const TIMEOUT_MS = 10_000;

function client(name) {
  // `headers` es una extensión de undici (el WebSocket de Node); el navegador manda Origin solo.
  const ws = new WebSocket(url, { headers: { Origin: origin } });
  const queue = [];
  const waiters = [];
  const fail = (m) => new Error(`${name}: error ${m.code} ${m.message ?? ''}`);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = msg.type === 'error' ? 0 : waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0 && waiters.length) {
      const w = waiters.splice(i, 1)[0];
      if (msg.type === 'error') w.reject(fail(msg));
      else w.resolve(msg);
    } else queue.push(msg);
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`${name}: no se pudo abrir ${url} (¿Origin permitido? ¿TLS?)`)), { once: true });
  });
  return {
    opened,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next(type) {
      const i = queue.findIndex((m) => m.type === type || m.type === 'error');
      if (i >= 0) {
        const m = queue.splice(i, 1)[0];
        return m.type === 'error' ? Promise.reject(fail(m)) : Promise.resolve(m);
      }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${name}: no llegó "${type}" en ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
        const done = (fn) => (v) => { clearTimeout(t); fn(v); };
        waiters.push({ type, resolve: done(resolve), reject: done(reject) });
      });
    },
    close: () => ws.close(),
  };
}

const ok = (s) => console.log(`OK  ${s}`);
const a = client('A');
const b = client('B');
try {
  await Promise.all([a.opened, b.opened]);
  ok(`WebSocket abierto en ${url} con Origin ${origin}`);

  a.send({ type: 'join', roomId, v: 1 });
  const ja = await a.next('joined');
  ok(`A entró a la sala (peerId ${ja.peerId}, peers ${ja.peers.length})`);

  b.send({ type: 'join', roomId, v: 1 });
  const jb = await b.next('joined');
  ok(`B entró a la sala (peers ${JSON.stringify(jb.peers)})`);
  const pj = await a.next('peer-joined');
  if (pj.peerId !== jb.peerId) throw new Error('peer-joined no coincide con el peerId de B');
  ok('A recibió peer-joined de B');

  const data = randomBytes(32).toString('base64url');
  a.send({ type: 'signal', to: jb.peerId, seq: 1, data });
  const sig = await b.next('signal');
  if (sig.from !== ja.peerId || sig.data !== data) throw new Error('el signal reenviado no coincide');
  ok('B recibió el signal de A sin cambios');

  if (ja.turn) {
    ok(`El servidor entrega credenciales TURN (ttl ${ja.turn.ttl} s)`);
    console.log('\nPara Trickle ICE (https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/):');
    for (const u of ja.turn.urls) console.log(`  URI: ${u}`);
    console.log(`  username:   ${ja.turn.username}`);
    console.log(`  credential: ${ja.turn.credential}`);
  } else {
    console.log('AVISO joined no trae "turn": revisa TURN_SECRET y TURN_URLS en la señalización');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`FALLO ${e.message}`);
  process.exitCode = 1;
} finally {
  a.close();
  b.close();
}
