// XBot Service Worker — offline shell caching with auto-versioning
// Version is injected at build time via vite.config.js
const CACHE_NAME = 'xbot-__BUILD_HASH__';
const SHELL_URLS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const { request } = e;
    // Skip API and WebSocket requests
    if (request.url.includes('/api/') || request.url.includes('/ws')) return;

    e.respondWith(
        fetch(request).then(res => {
            // Cache successful GET responses for static assets
            if (res.ok && request.method === 'GET') {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return res;
        }).catch(() => caches.match(request).then(r => r || caches.match('/')))
    );
});
