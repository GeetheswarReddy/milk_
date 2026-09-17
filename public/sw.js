/* Same-origin static assets are identical regardless of Origin request header.
 * Ignore Vary for these allowlisted assets so module fetches match precache requests.
 * The build injects only application assets; authenticated network data is never cached. */
const CACHE = 'dairy-shell-__VERSION__';
const SHELL = __PRECACHE__;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dairy-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    const page = url.pathname === '/how-it-works' || url.pathname === '/how-it-works.html' ? '/how-it-works.html' : '/index.html';
    event.respondWith(caches.open(CACHE).then(cache => cache.match(page, { ignoreVary: true })).then(cached => cached || fetch(request)));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname, { ignoreVary: true })).then(cached => cached || fetch(request)));
  }
});
