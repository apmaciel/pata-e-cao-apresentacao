const CACHE_NAME = 'pata-cao-images-v2';

// Default/static images are effectively immutable — cache them for a long time.
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// User-uploaded images (logos, gallery) may change — shorter TTL.
const USER_IMAGE_TTL_MS = 60 * 60 * 1000; // 1 hour

const PRE_CACHE_URLS = [
  '/api/images/defaults/pet-placeholder',
  '/api/images/defaults/provider-placeholder',
];

// ─── Install: pre-cache critical default images ───────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Message: allow frontend to invalidate specific image caches ─────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'INVALIDATE_IMAGE' && event.data?.imageId) {
    event.waitUntil(invalidateImage(event.data.imageId));
  }
  if (event.data?.type === 'INVALIDATE_ALL_IMAGES') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.keys().then((keys) => {
        // Keep defaults, remove everything else.
        return Promise.all(
          keys
            .filter((req) => !PRE_CACHE_URLS.some((p) => req.url.endsWith(p)))
            .map((req) => cache.delete(req))
        );
      }))
    );
  }
});

async function invalidateImage(imageId) {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const matches = keys.filter((req) => req.url.includes(`/api/images/${imageId}`));
  return Promise.all(matches.map((req) => cache.delete(req)));
}

// ─── Fetch: stale-while-revalidate with TTL for /api/images/* ────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!url.pathname.startsWith('/api/images/')) {
    return; // only intercept image API requests
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

function isDefaultImage(url) {
  return PRE_CACHE_URLS.some((d) => url.endsWith(d));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const requestUrl = new URL(request.url);
  const ttl = isDefaultImage(requestUrl.pathname) ? DEFAULT_TTL_MS : USER_IMAGE_TTL_MS;

  // Determine cache age from the Date header we stored alongside the response.
  let cacheAge = Infinity;
  if (cached) {
    const cachedDate = cached.headers.get('sw-cached-at');
    if (cachedDate) {
      cacheAge = Date.now() - parseInt(cachedDate, 10);
    }
  }

  // Kick off network request regardless.
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        // Clone and stamp with a cache timestamp before storing.
        const stamped = new Response(networkResponse.body, networkResponse);
        stamped.headers.set('sw-cached-at', String(Date.now()));
        cache.put(request, stamped);
      }
      return networkResponse;
    })
    .catch(() => null);

  // If we have a fresh-enough cached response, serve it immediately.
  if (cached && cacheAge <= ttl) {
    return cached;
  }

  // Cache is stale or missing — wait for network.
  const networkResponse = await networkFetch;
  if (networkResponse) {
    return networkResponse;
  }

  // Network failed, serve stale cache as last resort.
  if (cached) {
    return cached;
  }

  // Both failed — return a minimal fallback.
  return new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
