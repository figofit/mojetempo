/* The production packager replaces the version token with the app-shell hash. */
const CACHE_NAME = 'moje-tempo-shell-__TEMPO_VERSION__';
const SHELL_INTEGRITY = { /* __TEMPO_INTEGRITY__ */ };
const BASE_URL = new URL('./', self.location.href);
const CACHE_PREFIX = `moje-tempo-shell:${encodeURIComponent(BASE_URL.pathname)}:`;
const CACHE_KEY = `${CACHE_PREFIX}${CACHE_NAME}`;
const INDEX_URL = new URL('index.html', BASE_URL);
const SHELL_PATHS = [
  'index.html',
  'styles.css',
  'app.js',
  'domain.mjs',
  'storage.mjs',
  'local-storage.mjs',
  'sync-rules.mjs',
  'places.mjs',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/LICENSE',
  'pwa.mjs',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];
const SHELL_URLS = SHELL_PATHS.map(path => new URL(path, BASE_URL));
const SHELL_BY_PATH = new Map(SHELL_URLS.map(url => [url.pathname, url.href]));

function verifiedRequest(path) {
  const integrity = SHELL_INTEGRITY[path];
  if (typeof integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(integrity)) {
    throw new Error(`Missing or invalid app-shell integrity: ${path}`);
  }
  return new Request(new URL(path, BASE_URL).href, {
    cache: 'reload',
    credentials: 'same-origin',
    integrity,
  });
}

self.addEventListener('install', event => {
  // A stale CDN response or missing integrity map fails the entire installation.
  event.waitUntil((async () => {
    const requests = SHELL_PATHS.map(verifiedRequest);
    const cache = await caches.open(CACHE_KEY);
    await cache.addAll(requests);
  })());
  // Updates wait until the page explicitly asks to activate them.
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Other applications on this GitHub Pages origin may have their own caches.
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_KEY)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function shellResponse(canonicalUrl, request) {
  const cache = await caches.open(CACHE_KEY);
  const cached = await cache.match(canonicalUrl);
  // Cache-first prevents a new index from loading an older cached JavaScript.
  // The next complete shell arrives through the service-worker update lifecycle.
  if (cached) return portableResponse(cached, request);
  // If a cache entry was evicted, never substitute an unverified newer asset.
  const path = SHELL_PATHS.find(path => new URL(path, BASE_URL).href === canonicalUrl);
  const response = await fetch(verifiedRequest(path));
  if (!response.ok) throw new Error(`App-shell asset unavailable: ${path}`);
  return portableResponse(response, request);
}

function portableResponse(response, request) {
  // Static hosts may redirect index.html to /. A cached redirected response
  // cannot satisfy a navigation request whose redirect mode is manual.
  if (request.mode === 'navigate' && response.redirected) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;

  if (request.mode === 'navigate') {
    if (url.pathname === BASE_URL.pathname || url.pathname === INDEX_URL.pathname) {
      event.respondWith(shellResponse(INDEX_URL.href, request));
    }
    return;
  }

  const canonicalUrl = SHELL_BY_PATH.get(url.pathname);
  if (canonicalUrl) event.respondWith(shellResponse(canonicalUrl, request));
  // Unknown requests, user photos, downloads and APIs never enter the shell cache.
});
