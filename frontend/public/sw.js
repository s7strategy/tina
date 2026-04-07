/* PWA mínimo: permite critérios de instalação em browsers que exigem SW + fetch. */
/* v4 — alterar este comentário após deploy força o browser a reavaliar o SW. */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
