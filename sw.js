/* Fonctionnement hors ligne : les fichiers de l'application sont mis en cache à l'installation. */
const CACHE = 'rentabilite-v6';
const FILES = ['./', 'index.html', 'style.css', 'calc.js', 'importer.js', 'sync.js', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // config.js : réseau d'abord, pour qu'une modification soit prise en compte immédiatement.
  if (new URL(e.request.url).pathname.endsWith('/config.js')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match('index.html'))));
});
