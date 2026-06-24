// Hand-rolled service worker for Bar Path Tracker (no build-tool plugin).
// Caches the app shell + OpenCV engine so the app loads fast and works offline
// after the first visit. All paths are relative so it works under the GitHub
// Pages subpath (/bar-path/).
const CACHE = 'bp-v1'

// App shell we can know statically at install time. Hashed Vite assets are
// added to the cache at runtime on first load (see the fetch handler).
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './opencv.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only handle same-origin GET requests; leave everything else alone.
  if (req.method !== 'GET') return
  if (new URL(req.url).origin !== self.location.origin) return

  // Cache-first: serve from cache, else fetch + runtime-cache the response.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        // Only cache successful, basic (same-origin) responses.
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      })
    })
  )
})
