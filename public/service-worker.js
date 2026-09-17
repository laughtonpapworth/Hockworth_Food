const CACHE_NAME = 'meal-plan-v10';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/checker.js',
  '/js/discover.js',
  '/js/calendar.js',
  '/js/profiles.js',
  '/data/recipes.json',
  '/data/ingredient-rules.json',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for the app shell: always tries to fetch the latest version
// first, and only serves the cached copy if there's no connection. This
// means a normal page refresh always shows the newest deploy — the cache
// exists purely as an offline fallback, not to speed up normal loads.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (APP_SHELL.some(path => url.pathname === path)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
