const STATIC_CACHE = 'personal-academia-smart-v14-7-static-v1';
const REMOTE_GIF_CACHE = 'pas_v147_legacy_gifs';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/workouts.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => {
      const keep = key === STATIC_CACHE || key === REMOTE_GIF_CACHE;
      return keep ? null : caches.delete(key);
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isRemoteGif =
    url.hostname.includes('drive.google.com') ||
    url.hostname.includes('googleusercontent.com');

  if (isRemoteGif) {
    event.respondWith(cacheFirstRemoteGif(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});

async function cacheFirstRemoteGif(request) {
  const cache = await caches.open(REMOTE_GIF_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const fallback = await cache.match(request.url);
    if (fallback) return fallback;
    throw error;
  }
}
