const CACHE_NAME = 'meal-plan-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/checker.js',
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

// Cache-first for app shell, network-first for everything else (e.g. Open Food Facts lookups)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (APP_SHELL.some(path => url.pathname === path)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
