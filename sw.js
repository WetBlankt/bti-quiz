// Service worker for a STATIC host (GitHub Pages). Everything is relative to the worker's own URL, so it works
// at https://USER.github.io/REPO/ as well as at http://localhost:8080/ - nothing assumes the site lives at "/".
//
// Strategy
//  - install:  precache the whole app shell + all question data (fetched with cache:'reload' so GitHub's 10-minute
//              HTTP cache can never hand us a half-old, half-new copy).
//  - runtime:  network-first with a short timeout, falling back to the cache. Online = always the latest deployed
//              files (cheap conditional requests); offline or flaky = the cached copy. No manual version bump is
//              needed for an update to show up. VERSION only has to change when files are ADDED/REMOVED from SHELL.
const VERSION = 'v3';
const SHELL_CACHE = 'bti-shell-' + VERSION, DATA_CACHE = 'bti-data';
const NETWORK_TIMEOUT_MS = 3000;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/util.js', 'js/engine.js', 'js/check.js', 'js/data.js', 'js/select.js', 'js/storage.js', 'js/store.js', 'js/sync.js', 'js/sound.js', 'js/dom.js', 'js/config.js',
  'js/views/helpers.js', 'js/views/home.js', 'js/views/study.js', 'js/views/module.js', 'js/views/quiz.js', 'js/views/flash.js', 'js/views/mistakes.js', 'js/views/stats.js', 'js/views/search.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];
const fresh = (u) => new Request(u, { cache: 'reload' });

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map((u) => shell.add(fresh(u))));
    const data = await caches.open(DATA_CACHE);
    const manifestReq = fresh('data/manifest.json');
    const manifest = await (await fetch(manifestReq)).json();
    await Promise.all([data.add(fresh('data/syllabus.json')), data.add(fresh('data/manifest.json')), ...manifest.files.map((f) => data.add(fresh('data/' + f)))]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL_CACHE && k !== DATA_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const url = new URL(req.url);
  const cache = await caches.open(url.pathname.includes('/data/') ? DATA_CACHE : SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(req.url, { cache: 'no-cache' }),   // revalidate with the server (ETag / Last-Modified -> cheap 304)
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req.url, { ignoreSearch: true })) || (await caches.match(req.url, { ignoreSearch: true }));
    if (hit) return hit;
    if (req.mode === 'navigate') { const idx = await caches.match('index.html'); if (idx) return idx; }
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // e.g. Supabase calls go straight to the network
  e.respondWith(networkFirst(req));
});
