/*
  Escena 3D del video de la portada (apps/web/public/demo/chaski-3d-*). No es parte de la app:
  se renderiza aparte y se suben los videos. Para regenerarlos desde esta carpeta:
    npm i --no-save three@0.170.0 vite@6 && npx vite --port 5199
    node render.cjs && node render.cjs "&dark"        (Playwright: 300 cuadros a 30 fps en frames*/)
    ffmpeg -framerate 30 -i frames/%04d.png -c:v libvpx-vp9 -b:v 0 -crf 40 -pix_fmt yuv420p -an chaski-3d-light.webm
    ffmpeg -framerate 30 -i frames/%04d.png -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart -an chaski-3d-light.mp4
    ffmpeg -i frames/0235.png -c:v libwebp -quality 80 chaski-3d-light.webp   (póster: el archivo ya recibido)
  y lo mismo con framesdark/ para las versiones -dark. Sin ?still corre en vivo en el navegador.
*/
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const W = Number(new URLSearchParams(location.search).get('w') || 960);
const H = Math.round(W * 0.75);
const DARK = new URLSearchParams(location.search).has('dark');
const C = DARK
  ? { bg: '#17171c', paper: '#0e0e11', ink: '#f4f4f6', muted: '#93949e', line: '#26262d', soft: '#1c1c22', brand: '#ff6a48', peach: '#3a241c', online: '#3ddc84', onInk: '#111114' }
  : { bg: '#f3f3f5', paper: '#ffffff', ink: '#111114', muted: '#7a7b85', line: '#ececf0', soft: '#f3f3f5', brand: '#ff5a36', peach: '#ffe3d8', online: '#1fa463', onInk: '#ffffff' };

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = DARK ? 0.9 : 1.05;
document.body.appendChild(renderer.domElement);
if (DARK) document.body.style.background = '#1c1c22';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(27, W / H, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, DARK ? 0x2a1a14 : 0xffd9c9, DARK ? 0.9 : 1.6));
const sun = new THREE.DirectionalLight(0xffffff, DARK ? 1.6 : 2.2);
sun.position.set(-2, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
sun.shadow.radius = 6;
sun.shadow.bias = -0.0005;
scene.add(sun);
const rim = new THREE.DirectionalLight(DARK ? 0xff8a66 : 0xffffff, DARK ? 0.8 : 0.6);
rim.position.set(5, 3, -4);
scene.add(rim);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
const box = (w, h, d, r, m) => {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
};

/* Escritorio */
const desk = box(7, 0.3, 4.6, 0.12, mat(DARK ? '#4a2a1f' : '#ffd2c2', { roughness: 0.8 }));
desk.position.y = -0.15;
scene.add(desk);

/* Pantallas dibujadas en canvas */
function screenTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, ctx: cv.getContext('2d'), tex };
}
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const QR = ['FFF0FFF', 'FFF1FFF', 'FFF0FFF', '1011010', 'FFF1101', 'FFF0010', 'FFF1101'];
function drawQr(ctx, x, y, s) {
  rr(ctx, x, y, s, s, s * 0.2); ctx.fillStyle = C.peach; ctx.fill();
  const p = (s * 0.76) / 7, ox = x + s * 0.12, oy = y + s * 0.12, c = p * 0.8;
  ctx.fillStyle = C.ink;
  QR.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '1') { rr(ctx, ox + i * p, oy + j * p, c, c, c / 3); ctx.fill(); } }));
  for (const [fx, fy] of [[0, 0], [4, 0], [0, 4]]) {
    const fs = p * 3 - (p - c), X = ox + fx * p, Y = oy + fy * p;
    ctx.fillStyle = C.ink; rr(ctx, X, Y, fs, fs, fs / 3.5); ctx.fill();
    ctx.fillStyle = C.peach; rr(ctx, X + fs * 0.18, Y + fs * 0.18, fs * 0.64, fs * 0.64, fs / 5); ctx.fill();
    ctx.fillStyle = C.ink; rr(ctx, X + fs * 0.33, Y + fs * 0.33, fs * 0.34, fs * 0.34, fs / 9); ctx.fill();
  }
}
const RUN = new Path2D('M31 20 L16 56 M22 36 L41 24 M22 36 L40 54');
const TAILS = new Path2D('M27 7.5 L15 4.5 M27 10.5 L17 12.5');
const FOLDER = new Path2D('M42 15h6l2.2 2.5H58a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H42a2.5 2.5 0 0 1-2.5-2.5V17.5A2.5 2.5 0 0 1 42 15z');
function drawLogo(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 64, size / 64); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.brand; ctx.lineWidth = 3.6; ctx.stroke(TAILS);
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(33, 9, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.stroke(RUN);
  ctx.fillStyle = C.brand; ctx.fill(FOLDER); ctx.restore();
  ctx.fillStyle = C.ink; ctx.font = `600 ${size * 0.95}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
  ctx.fillText('chaski', x + size * 1.35, y + size * 0.52);
}
function fileCard(ctx, x, y, w, h, progress, mine) {
  rr(ctx, x, y, w, h, h * 0.28); ctx.fillStyle = mine ? C.ink : C.soft; ctx.fill();
  if (!mine) { ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke(); }
  const ic = h * 0.56;
  ctx.fillStyle = C.peach; rr(ctx, x + h * 0.22, y + h * 0.22, ic, ic, ic * 0.25); ctx.fill();
  ctx.strokeStyle = C.brand; ctx.lineWidth = ic * 0.08; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + h * 0.36, y + h * 0.38 + k * ic * 0.2); ctx.lineTo(x + h * 0.36 + ic * (k === 2 ? 0.3 : 0.5), y + h * 0.38 + k * ic * 0.2); ctx.stroke(); }
  ctx.fillStyle = mine ? C.onInk : C.ink; ctx.font = `600 ${h * 0.2}px system-ui, sans-serif`; ctx.textBaseline = 'alphabetic';
  ctx.fillText('foto_pizarra.jpg', x + h * 0.95, y + h * 0.42);
  ctx.fillStyle = mine ? C.onInk : C.muted; ctx.globalAlpha = 0.7; ctx.font = `500 ${h * 0.16}px system-ui, sans-serif`;
  ctx.fillText('2,4 MB', x + h * 0.95, y + h * 0.68); ctx.globalAlpha = 1;
  if (progress !== null) {
    const bx = x + h * 0.95, bw = w - h * 1.25, by = y + h * 0.8;
    ctx.fillStyle = C.line; rr(ctx, bx, by, bw, h * 0.07, h * 0.035); ctx.fill();
    ctx.fillStyle = C.brand; rr(ctx, bx, by, Math.max(h * 0.07, bw * progress), h * 0.07, h * 0.035); ctx.fill();
  }
}
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t, a, b) => ease((t - a) / (b - a));

/* Laptop */
const laptop = new THREE.Group();
laptop.position.set(-0.7, 0, -0.5);
laptop.rotation.y = 0.18;
scene.add(laptop);
const shell = mat(DARK ? '#3a3a42' : '#e9e9ee', { metalness: 0.35, roughness: 0.35 });
const base = box(2.8, 0.1, 1.9, 0.05, shell); base.position.y = 0.05; laptop.add(base);
const kb = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), mat(DARK ? '#24242a' : '#d6d6dd'));
kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.101, -0.28); laptop.add(kb);
const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), mat(DARK ? '#2c2c33' : '#dcdce2'));
pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.101, 0.5); laptop.add(pad);
const hinge = new THREE.Group(); hinge.position.set(0, 0.1, -0.95); hinge.rotation.x = -0.22; laptop.add(hinge);
const lid = box(2.8, 1.85, 0.07, 0.04, shell); lid.position.set(0, 0.925, 0); hinge.add(lid);
const LS = screenTex(1024, 640);
const lscreen = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 1.64), new THREE.MeshBasicMaterial({ map: LS.tex, toneMapped: false }));
lscreen.position.set(0, 0.94, 0.037); hinge.add(lscreen);

/* Celular */
const phone = new THREE.Group(); scene.add(phone);
const pbody = box(0.78, 1.58, 0.09, 0.08, mat(DARK ? '#2a2a31' : '#202024', { metalness: 0.4, roughness: 0.3 })); phone.add(pbody);
const PS = screenTex(400, 820);
const pscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.46), new THREE.MeshBasicMaterial({ map: PS.tex, toneMapped: false }));
pscreen.position.z = 0.047; phone.add(pscreen);
const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24), mat('#111', { metalness: 0.6, roughness: 0.2 }));
lens.rotation.x = Math.PI / 2; lens.position.set(-0.22, 0.6, -0.05); phone.add(lens);

/* Taza, planta y cuaderno */
const mugM = mat(DARK ? '#e8e8ee' : '#ffffff');
const mug = new THREE.Group(); mug.position.set(2.5, 0, -1.4); scene.add(mug);
const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.5, 32), mugM); cup.position.y = 0.25; cup.castShadow = true; mug.add(cup);
const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), mat('#6b3f2a')); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.46; mug.add(coffee);
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 12, 24, Math.PI), mugM); handle.position.set(0.25, 0.26, 0); handle.rotation.z = -Math.PI / 2; mug.add(handle);
const plant = new THREE.Group(); plant.position.set(-3.0, 0, -1.6); scene.add(plant);
const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.45, 32), mat(C.brand, { roughness: 0.7 })); pot.position.y = 0.225; pot.castShadow = true; plant.add(pot);
const leafM = mat(DARK ? '#3e8f6a' : '#5cb88a', { roughness: 0.7 });
for (let i = 0; i < 7; i++) {
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), leafM);
  const a = (i / 7) * Math.PI * 2;
  leaf.scale.set(0.7, 1.6, 0.4); leaf.position.set(Math.cos(a) * 0.14, 0.62 + (i % 3) * 0.1, Math.sin(a) * 0.14);
  leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6); leaf.castShadow = true; plant.add(leaf);
}
const note = box(1.1, 0.06, 0.8, 0.02, mat(DARK ? '#2f5f63' : '#bfe6e8')); note.position.set(0.9, 0.03, 1.4); note.rotation.y = -0.3; scene.add(note);
const band = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.8), mat(DARK ? '#7fd8dc' : '#0f6e73')); band.rotation.x = -Math.PI / 2; band.position.set(0.3, 0.061, 0); note.add(band);

/* Haz del escáner y archivo volando */
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: C.brand, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
scene.add(beam);
const folder = new THREE.Group(); scene.add(folder);
const fM = mat(C.brand, { roughness: 0.4 });
const fBody = box(0.42, 0.3, 0.06, 0.03, fM); folder.add(fBody);
const fTab = box(0.16, 0.08, 0.06, 0.02, fM); fTab.position.set(-0.13, 0.17, 0); folder.add(fTab);
const fDoc = box(0.34, 0.24, 0.02, 0.01, mat('#ffffff')); fDoc.position.set(0, 0.04, 0.03); fDoc.rotation.z = 0.08; folder.add(fDoc);
const trail = [];
for (let i = 0; i < 14; i++) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: C.brand, transparent: true, opacity: 0 }));
  scene.add(s); trail.push(s);
}

const tmp = new THREE.Vector3();
const local = (obj, x, y, z) => obj.localToWorld(tmp.set(x, y, z)).clone();

/* Línea de tiempo (s): 0-1.2 sube el celular, 1.2-3.2 escanea, 3.4 conecta, 4-6.4 vuela el archivo, 6.4-8 recibido, 9.5 vuelve. */
const T = 10;
const P0 = new THREE.Vector3(2.0, 0.07, 1.05), P1 = new THREE.Vector3(1.85, 1.05, 0.95);
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.5));
const aimQ = new THREE.Quaternion();
function frame(t) {
  t = ((t % T) + T) % T;
  const out = seg(t, 9.2, 10);
  /* cámara */
  const a = 0.62 + Math.sin((t / T) * Math.PI * 2) * 0.06;
  camera.position.set(Math.sin(a) * 9.4, 4.3, Math.cos(a) * 9.4);
  camera.lookAt(0.25, 0.85, -0.2);

  /* celular: sube y apunta a la pantalla de la laptop */
  const up = seg(t, 0.1, 1.2) * (1 - out);
  phone.position.lerpVectors(P0, P1, up);
  phone.position.y += Math.sin(t * 2.2) * 0.02 * up;
  const target = local(lscreen, 0, 0, 0);
  phone.lookAt(target); phone.rotateY(Math.PI);
  aimQ.copy(phone.quaternion);
  phone.quaternion.copy(FLAT).slerp(aimQ, up);

  /* pantalla de la laptop */
  const L = LS.ctx, lw = 1024, lh = 640;
  L.fillStyle = C.paper; L.fillRect(0, 0, lw, lh);
  drawLogo(L, 40, 36, 40);
  const connected = seg(t, 3.2, 3.6) * (1 - out);
  const qrA = 1 - connected;
  if (qrA > 0) {
    L.globalAlpha = qrA;
    L.fillStyle = C.ink; L.font = '600 54px system-ui, sans-serif'; L.textBaseline = 'alphabetic';
    L.fillText('Pasa archivos', 70, 250); L.fillText('a esta PC', 70, 315);
    L.fillStyle = C.muted; L.font = '500 26px system-ui, sans-serif';
    L.fillText('1  Abre la cámara del celular', 74, 390); L.fillText('2  Apunta al código', 74, 434); L.fillText('3  Elige qué enviar', 74, 478);
    drawQr(L, 600, 150, 340);
    L.globalAlpha = 1;
  }
  if (connected > 0) {
    L.globalAlpha = connected;
    L.fillStyle = C.online; L.beginPath(); L.arc(640, 56, 9, 0, 7); L.fill();
    L.fillStyle = C.ink; L.font = '500 26px system-ui, sans-serif'; L.textBaseline = 'middle'; L.fillText('Celular de Juan', 662, 57);
    L.fillStyle = C.muted; L.font = '500 22px system-ui, sans-serif'; L.textAlign = 'center';
    L.fillText('Conectado', lw / 2, 150); L.textAlign = 'left';
    const got = seg(t, 6.0, 6.4);
    if (got > 0) {
      L.globalAlpha = connected * got;
      fileCard(L, 70, 200 + (1 - got) * 30, 520, 150, Math.min(1, seg(t, 6.0, 7.2)), false);
      const ck = seg(t, 7.2, 7.5);
      if (ck > 0) { L.fillStyle = C.online; L.beginPath(); L.arc(620, 275, 26 * ck, 0, 7); L.fill();
        L.strokeStyle = '#fff'; L.lineWidth = 6; L.lineCap = 'round'; L.lineJoin = 'round'; L.beginPath(); L.moveTo(608, 276); L.lineTo(617, 285); L.lineTo(633, 266); L.stroke(); }
    }
    L.globalAlpha = connected;
    L.fillStyle = C.soft; rr(L, 70, 540, 884, 64, 32); L.fill();
    L.fillStyle = C.muted; L.font = '500 24px system-ui, sans-serif'; L.fillText('Escribe un mensaje', 110, 573);
    L.globalAlpha = 1;
  }
  LS.tex.needsUpdate = true;

  /* pantalla del celular */
  const Pc = PS.ctx, pw = 400, ph = 820;
  Pc.fillStyle = C.paper; Pc.fillRect(0, 0, pw, ph);
  if (qrA > 0) {
    Pc.globalAlpha = qrA;
    Pc.fillStyle = '#2a2a30'; rr(Pc, 24, 120, 352, 520, 40); Pc.fill();
    drawQr(Pc, 95, 270, 210);
    Pc.strokeStyle = '#fff'; Pc.lineWidth = 8; Pc.lineCap = 'round';
    for (const [x, y, dx, dy] of [[70, 245, 1, 1], [330, 245, -1, 1], [70, 505, 1, -1], [330, 505, -1, -1]]) {
      Pc.beginPath(); Pc.moveTo(x, y + dy * 40); Pc.lineTo(x, y); Pc.lineTo(x + dx * 40, y); Pc.stroke();
    }
    const sy = 255 + (Math.sin(t * 3.2) * 0.5 + 0.5) * 240;
    Pc.fillStyle = C.brand; rr(Pc, 74, sy, 252, 6, 3); Pc.fill();
    Pc.fillStyle = C.ink; Pc.font = '600 30px system-ui, sans-serif'; Pc.textAlign = 'center'; Pc.fillText('Escaneando…', pw / 2, 700); Pc.textAlign = 'left';
    Pc.globalAlpha = 1;
  }
  if (connected > 0) {
    Pc.globalAlpha = connected;
    drawLogo(Pc, 30, 40, 34);
    Pc.fillStyle = C.online; Pc.beginPath(); Pc.arc(40, 120, 8, 0, 7); Pc.fill();
    Pc.fillStyle = C.ink; Pc.font = '500 24px system-ui, sans-serif'; Pc.textBaseline = 'middle'; Pc.fillText('Conectado con la PC', 58, 121);
    const sent = seg(t, 3.8, 4.2);
    if (sent > 0) {
      Pc.globalAlpha = connected * sent;
      fileCard(Pc, 40, 470 + (1 - sent) * 20, 330, 110, null, true);
      if (t > 7.3) { Pc.strokeStyle = C.brand; Pc.lineWidth = 4; Pc.lineCap = 'round';
        for (const o of [0, 12]) { Pc.beginPath(); Pc.moveTo(318 + o, 600); Pc.lineTo(326 + o, 608); Pc.lineTo(340 + o, 592); Pc.stroke(); } }
    }
    Pc.globalAlpha = connected;
    Pc.fillStyle = C.soft; rr(Pc, 24, 720, 352, 64, 32); Pc.fill();
    Pc.globalAlpha = 1;
  }
  PS.tex.needsUpdate = true;

  /* haz: pirámide del lente a las esquinas del QR */
  const scan = seg(t, 1.0, 1.4) * (1 - seg(t, 3.0, 3.4));
  beam.material.opacity = 0.18 * scan;
  if (scan > 0) {
    const apex = local(phone, -0.22, 0.6, -0.06);
    const qx0 = (600 / lw - 0.5) * 2.62, qx1 = (940 / lw - 0.5) * 2.62, qy0 = (0.5 - 150 / lh) * 1.64 + 0.94, qy1 = (0.5 - 490 / lh) * 1.64 + 0.94;
    const cs = [[qx0, qy0], [qx1, qy0], [qx1, qy1], [qx0, qy1]].map(([x, y]) => hinge.localToWorld(new THREE.Vector3(x, y, 0.05)));
    const arr = beamGeo.attributes.position.array; let k = 0;
    for (let i = 0; i < 4; i++) for (const v of [apex, cs[i], cs[(i + 1) % 4]]) { arr[k++] = v.x; arr[k++] = v.y; arr[k++] = v.z; }
    for (const v of [cs[0], cs[1], cs[2], cs[0], cs[2], cs[3]]) { arr[k++] = v.x; arr[k++] = v.y; arr[k++] = v.z; }
    beamGeo.attributes.position.needsUpdate = true; beamGeo.computeBoundingSphere();
  }

  /* archivo: sale del celular y aterriza en la pantalla */
  const f = seg(t, 4.0, 6.2);
  const start = local(phone, 0, 0.1, -0.15), end = local(lscreen, -0.35, 0.05, 0.12);
  const mid = start.clone().lerp(end, 0.5); mid.y += 1.3;
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  const vis = f > 0 && f < 1 ? 1 : 0;
  folder.visible = !!vis;
  if (vis) {
    folder.position.copy(curve.getPoint(f));
    const s = 0.6 + Math.sin(f * Math.PI) * 0.6; folder.scale.setScalar(s);
    folder.lookAt(camera.position); folder.rotateZ(Math.sin(f * Math.PI * 2) * 0.25);
  }
  trail.forEach((s, i) => {
    const ft = f - (i + 1) * 0.025;
    s.visible = vis && ft > 0;
    if (s.visible) { s.position.copy(curve.getPoint(ft)); s.material.opacity = 0.6 * (1 - i / trail.length); }
  });
  renderer.render(scene, camera);
}
window.frame = frame;
window.ready = true;
if (!new URLSearchParams(location.search).has('still')) {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => frame((performance.now() - t0) / 1000));
}
