const CACHE_PREFIX = 'fleetpro-';

// Static assets to cache on install (no content hashes — need cache-first)
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Offline fallback HTML — minimal shell so users see something useful when offline
const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#f59e0b">
  <title>iFleetPro — Offline</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;
         display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
    .card{text-align:center;max-width:400px;padding:2.5rem;border-radius:1rem;
          background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .icon{width:64px;height:64px;margin:0 auto 1.25rem;border-radius:50%;
          background:#fef3c7;display:flex;align-items:center;justify-content:center}
    .icon svg{width:32px;height:32px;color:#d97706}
    h1{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}
    p{font-size:.875rem;color:#64748b;line-height:1.5}
    .btn{display:inline-block;margin-top:1.5rem;padding:.625rem 1.5rem;
         background:#d97706;color:#fff;border-radius:.5rem;text-decoration:none;
         font-size:.875rem;font-weight:600;transition:background .15s}
    .btn:hover{background:#b45309}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round"
           stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    </div>
    <h1>You're Offline</h1>
    <p>iFleetPro is not available right now. Please check your internet connection and try again.</p>
    <a class="btn" href="/">Try Again</a>
  </div>
</body>
</html>`;

let currentBuildId = 'unknown';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getBuildId() {
  try {
    const res = await fetch('/BUILD_ID', { cache: 'no-store' });
    if (res.ok) return await res.text();
  } catch {}
  return null;
}

function cacheName(buildId) {
  return `${CACHE_PREFIX}${buildId}`;
}

/** Determine if a request is a navigation (HTML page). */
function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  );
}

// ── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const buildId = await getBuildId();
      currentBuildId = buildId || 'fallback';
      const cache = await caches.open(cacheName(currentBuildId));
      await cache.addAll(STATIC_ASSETS);

      // Cache the offline fallback page
      const fallbackResponse = new Response(OFFLINE_FALLBACK_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
      await cache.put('/offline-fallback', fallbackResponse);

      self.skipWaiting();
    })()
  );
});

// ── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const buildId = await getBuildId();
      currentBuildId = buildId || currentBuildId;
      const name = cacheName(currentBuildId);

      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== name)
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();

      // Notify all open tabs about the update
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', buildId: currentBuildId });
      });
    })()
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  const name = cacheName(currentBuildId);

  // ── Non-GET requests: pass through (client-side offline-fetch handles queuing) ──
  if (request.method !== 'GET') return;

  // ── API calls: network-first, cache fallback for offline ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(name).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || new Response(JSON.stringify({ error: 'Offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
    );
    return;
  }

  // ── Navigation requests: network-first with offline fallback page ──
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(name).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Try to serve the cached page first
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Fall back to the offline fallback page
            return caches.match('/offline-fallback').then((fallback) => {
              return (
                fallback ||
                new Response(OFFLINE_FALLBACK_HTML, {
                  status: 503,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                })
              );
            });
          });
        })
    );
    return;
  }

  // ── Next.js assets (/_next/*): network-first ──
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(name).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── Truly static assets (icons, manifest, sounds): cache-first ──
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/sounds/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(name).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Default: network-first with cache fallback ──
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(name).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── Message handler ─────────────────────────────────────────────────────────
// Allow the app to communicate with the service worker

self.addEventListener('message', (event) => {
  // Return the current build ID
  if (event.data?.type === 'GET_BUILD_ID') {
    event.ports[0]?.postMessage({ buildId: currentBuildId });
  }

  // Skip waiting — force new SW to activate immediately
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
