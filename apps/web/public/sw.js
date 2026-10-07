// Service worker de Chaski. Solo atiende "Compartir con Chaski" en Android (Web Share Target):
// recibe el POST /share, guarda lo compartido un momento en Cache Storage y abre /?share.
// No cachea la app ni intercepta nada más; la web lee lo compartido y lo borra al instante.
const CACHE = 'chaski-share';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share') return;
  e.respondWith(receive(e.request));
});

async function receive(request) {
  const form = await request.formData();
  await caches.delete(CACHE);
  const cache = await caches.open(CACHE);
  const files = form.getAll('files').filter((f) => f instanceof File && f.size > 0);
  await Promise.all(
    files.map((f, i) =>
      cache.put(
        `/share/file/${i}`,
        new Response(f, {
          headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name) },
        }),
      ),
    ),
  );
  // Android manda el enlace a veces en `url` y a veces dentro de `text`: no lo repitas.
  const parts = [];
  for (const key of ['title', 'text', 'url']) {
    const v = form.get(key);
    if (typeof v === 'string' && v.trim() && !parts.some((p) => p.includes(v.trim()))) parts.push(v.trim());
  }
  if (parts.length) await cache.put('/share/text', new Response(parts.join('\n')));
  return Response.redirect('/?share', 303);
}
