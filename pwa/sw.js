// Service worker: guarda la "cáscara" de la app para que abra SIN internet (los datos los guarda app.js).
// NUNCA intercepta ni guarda las peticiones a Supabase: las cifras del negocio no se cachean aquí.
const VERSION = 'zenit-pwa-v1';
const CASCARA = ['./', './index.html', './app.js', './app.css', './config.js', './manifest.webmanifest', './lib/graficas.js', './lib/graficas.css', './lib/tablero.js', './lib/tablero.css',
  './vendor/supabase.js', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CASCARA)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;     // otro origen (Supabase) o escritura: ni se toca
  // "Stale-while-revalidate": responde al instante con lo guardado y se actualiza en segundo plano para la próxima vez
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardado = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return guardado || (await red) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  })());
});
