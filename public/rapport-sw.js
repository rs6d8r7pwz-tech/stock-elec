/* Service worker de l'application Rapport — permet de rouvrir /rapport sans réseau.
   Portée limitée à /rapport : n'affecte pas les autres applis du portail. */
const CACHE = 'electreau-rapport-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/rapport', '/logo-electreau.png']).catch(() => {})))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('electreau-rapport-') && k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

// La page envoie la liste des fichiers déjà chargés (JS/CSS Next.js) pour les mettre en cache
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache-urls' && Array.isArray(e.data.urls)) {
    caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {}))))
  }
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, etc. : jamais intercepté
  if (url.pathname.startsWith('/api/')) return

  // Fichiers statiques Next.js (noms hachés, immuables) : cache d'abord
  if (url.pathname.startsWith('/_next/static/') || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })))
    return
  }
  // Pages / données RSC : réseau d'abord, cache en secours
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
    return res
  }).catch(async () => (await caches.match(req)) || (await caches.match('/rapport')) || Response.error()))
})
