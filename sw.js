// LifeOS service worker: precache the whole app so it opens and works offline.
// Bump VERSION when the file list changes.
const VERSION = 'lifeos-v1';
const SHELL = [
  './', './index.html', './app.css', './manifest.webmanifest',
  './src/app.js', './src/model.js', './src/db.js', './src/store.js', './src/ui.js', './src/actions.js', './src/views.js', './src/data.js', './src/backup.js',
  './vendor/cockpit/cockpit.css', './vendor/cockpit/fx.js',
  './vendor/cockpit/fonts/chakra-petch-latin-600.woff2', './vendor/cockpit/fonts/chakra-petch-latin-700.woff2',
  './vendor/cockpit/fonts/jetbrains-mono-latin-400.woff2', './vendor/cockpit/fonts/jetbrains-mono-latin-500.woff2', './vendor/cockpit/fonts/jetbrains-mono-latin-600.woff2',
  './vendor/cockpit/fonts/ibm-plex-sans-latin-400.woff2', './vendor/cockpit/fonts/ibm-plex-sans-latin-500.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Stale-while-revalidate: answer from cache instantly (works offline), refresh the cache in the
// background so the next launch gets the newest files. VERSION bumps still purge old caches.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) ?? (req.mode === 'navigate' ? (await cache.match('./index.html')) : null) ?? Response.error();
  })());
});
