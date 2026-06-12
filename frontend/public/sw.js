const CACHE_NAME = 'pata-cao-images-v2';

// Imagens padrão/estáticas são efetivamente imutáveis — cache longo.
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
// Imagens enviadas por usuários (logos, galeria) podem mudar — TTL menor.
const USER_IMAGE_TTL_MS = 60 * 60 * 1000; // 1 hora

const PRE_CACHE_URLS = [
  '/api/images/defaults/pet-placeholder',
  '/api/images/defaults/provider-placeholder',
];

// ─── Install: pré-cacheia imagens padrão críticas ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: limpa caches antigos ────────────────────────────────────────────
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

// ─── Message: permite o frontend invalidar caches de imagens específicas ──────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'INVALIDATE_IMAGE' && event.data?.imageId) {
    event.waitUntil(invalidateImage(event.data.imageId));
  }
  if (event.data?.type === 'INVALIDATE_ALL_IMAGES') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.keys().then((keys) => {
        // Mantém padrões, remove todo o resto.
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

// ─── Fetch: stale-while-revalidate com TTL para /api/images/* ─────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!url.pathname.startsWith('/api/images/')) {
    return; // intercepta apenas requisições de API de imagem
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

  // Determina idade do cache pelo header Date que armazenamos junto com a resposta.
  let cacheAge = Infinity;
  if (cached) {
    const cachedDate = cached.headers.get('sw-cached-at');
    if (cachedDate) {
      cacheAge = Date.now() - parseInt(cachedDate, 10);
    }
  }

  // Dispara requisição de rede de qualquer forma.
  const networkFetch = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        // Clona e carimba com timestamp de cache antes de armazenar.
        const stamped = new Response(networkResponse.body, networkResponse);
        stamped.headers.set('sw-cached-at', String(Date.now()));
        cache.put(request, stamped);
      }
      return networkResponse;
    })
    .catch(() => null);

  // Se temos resposta em cache suficientemente recente, serve imediatamente.
  if (cached && cacheAge <= ttl) {
    return cached;
  }

  // Cache expirado ou ausente — espera pela rede.
  const networkResponse = await networkFetch;
  if (networkResponse) {
    return networkResponse;
  }

  // Rede falhou, serve cache expirado como último recurso.
  if (cached) {
    return cached;
  }

  // Ambos falharam — retorna fallback mínimo.
  return new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
